#include <iostream>
#include <memory>
#include <string>
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <chrono>
#include <functional>
#include <cstring>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <poll.h>
#include <algorithm>
#include <stdexcept>
#include <sstream>
#include <cstdlib>
#include <cerrno>
#include <curl/curl.h>

// ============================================================================
// Configuration
// ============================================================================
constexpr int MCP_PORT = 8080;
constexpr int MAX_CONNECTIONS = 100;
constexpr int BUFFER_SIZE = 16384;
constexpr int AUDIO_CHUNK_SIZE = 4096;

// ASR API Configuration
constexpr const char* ASR_API_URL = "https://asr.votee-demo.votee.dev/v1/audio/transcriptions";
constexpr const char* ASR_MODEL = "votee/stt-v2";
constexpr const char* ASR_LANGUAGE = "yue";
constexpr const char* ASR_TIMESTAMP_GRANULARITIES = "[\"segment\"]";
constexpr const char* ASR_RESPONSE_FORMAT = "verbose_json";

// Timeout and size constants
constexpr long HTTP_TIMEOUT_SEC = 300L; // 5 minutes for long audio
constexpr long CONNECTION_TIMEOUT_SEC = 30L;
constexpr size_t MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB max
constexpr int POLL_TIMEOUT_MS = 1000;

// Get API key from environment variable
static std::string get_api_key() {
    const char* env_key = std::getenv("ASR_API_KEY");
    if (env_key && strlen(env_key) > 0) {
        return std::string(env_key);
    }
    // Fallback to default (should be removed in production)
    return "votee_112f7d0b1b0af5c537626429";
}

// ============================================================================
// ASR Backend HTTP Client
// ============================================================================
struct StreamContext {
    std::queue<std::string> result_queue;
    std::mutex mutex;
    bool streaming;
    
    StreamContext() : streaming(false) {}
};

// Callback for writing HTTP response data (streaming results)
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    StreamContext* ctx = static_cast<StreamContext*>(userp);
    size_t total_size = size * nmemb;
    
    std::lock_guard<std::mutex> lock(ctx->mutex);
    std::string chunk(reinterpret_cast<char*>(contents), total_size);
    ctx->result_queue.push(chunk);
    
    return total_size;
}

class ASRConnection {
private:
    CURL* curl_;
    std::mutex mutex_;
    bool in_use_;
    StreamContext* current_stream_;
    
public:
    ASRConnection() : curl_(nullptr), in_use_(false), current_stream_(nullptr) {
        curl_ = curl_easy_init();
        if (curl_) {
            curl_easy_setopt(curl_, CURLOPT_SSL_VERIFYPEER, 1L);
            curl_easy_setopt(curl_, CURLOPT_SSL_VERIFYHOST, 2L);
            curl_easy_setopt(curl_, CURLOPT_TIMEOUT, HTTP_TIMEOUT_SEC);
            curl_easy_setopt(curl_, CURLOPT_CONNECTTIMEOUT, CONNECTION_TIMEOUT_SEC);
        }
    }
    
    ~ASRConnection() {
        if (curl_) {
            curl_easy_cleanup(curl_);
        }
    }
    
    bool is_valid() const {
        return curl_ != nullptr;
    }
    
    bool transcribe_audio(const uint8_t* audio_data, size_t audio_len, 
                         StreamContext* stream_ctx) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!curl_) return false;
        
        current_stream_ = stream_ctx;
        
        // Mark streaming as active
        {
            std::lock_guard<std::mutex> ctx_lock(stream_ctx->mutex);
            stream_ctx->streaming = true;
        }
        
        // Prepare multipart form data
        struct curl_httppost* formpost = nullptr;
        struct curl_httppost* lastptr = nullptr;
        
        // Add form fields
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "model",
                    CURLFORM_COPYCONTENTS, ASR_MODEL,
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "file",
                    CURLFORM_BUFFER, "audio.mp3",
                    CURLFORM_BUFFERPTR, audio_data,
                    CURLFORM_BUFFERLENGTH, audio_len,
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "stream",
                    CURLFORM_COPYCONTENTS, "True",
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "language",
                    CURLFORM_COPYCONTENTS, ASR_LANGUAGE,
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "timestamp_granularities",
                    CURLFORM_COPYCONTENTS, ASR_TIMESTAMP_GRANULARITIES,
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "response_format",
                    CURLFORM_COPYCONTENTS, ASR_RESPONSE_FORMAT,
                    CURLFORM_END);
        
        curl_formadd(&formpost, &lastptr,
                    CURLFORM_COPYNAME, "vad_filter",
                    CURLFORM_COPYCONTENTS, "True",
                    CURLFORM_END);
        
        // Set up HTTP request
        std::string api_key = get_api_key();
        std::string api_key_header = "x-api-key: " + api_key;
        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, api_key_header.c_str());
        
        curl_easy_setopt(curl_, CURLOPT_URL, ASR_API_URL);
        curl_easy_setopt(curl_, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl_, CURLOPT_HTTPPOST, formpost);
        curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl_, CURLOPT_WRITEDATA, stream_ctx);
        curl_easy_setopt(curl_, CURLOPT_VERBOSE, 0L);
        
        // Perform request (this will block until complete or error)
        CURLcode res = curl_easy_perform(curl_);
        
        // Get error details if failed
        if (res != CURLE_OK) {
            const char* err_str = curl_easy_strerror(res);
            std::cerr << "CURL error: " << err_str << " (code: " << res << ")" << std::endl;
        }
        
        // Cleanup
        curl_formfree(formpost);
        curl_slist_free_all(headers);
        
        {
            std::lock_guard<std::mutex> ctx_lock(stream_ctx->mutex);
            stream_ctx->streaming = false;
        }
        
        current_stream_ = nullptr;
        return (res == CURLE_OK);
    }
    
    bool get_result(std::string& result) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!current_stream_) return false;
        
        std::lock_guard<std::mutex> ctx_lock(current_stream_->mutex);
        if (current_stream_->result_queue.empty()) {
            return false;
        }
        
        result = current_stream_->result_queue.front();
        current_stream_->result_queue.pop();
        return true;
    }
    
    bool is_in_use() const { return in_use_; }
    void set_in_use(bool use) { in_use_ = use; }
};

class ASRConnectionPool {
private:
    std::vector<std::unique_ptr<ASRConnection>> connections_;
    std::mutex pool_mutex_;
    std::condition_variable cv_;
    size_t pool_size_;
    
public:
    ASRConnectionPool(size_t size) : pool_size_(size) {
        for (size_t i = 0; i < pool_size_; ++i) {
            auto conn = std::make_unique<ASRConnection>();
            if (conn->is_valid()) {
                connections_.push_back(std::move(conn));
            }
        }
    }
    
    ASRConnection* acquire() {
        std::unique_lock<std::mutex> lock(pool_mutex_);
        cv_.wait(lock, [this] {
            return std::any_of(connections_.begin(), connections_.end(),
                [](const auto& conn) { return !conn->is_in_use(); });
        });
        
        for (auto& conn : connections_) {
            if (!conn->is_in_use()) {
                conn->set_in_use(true);
                return conn.get();
            }
        }
        return nullptr;
    }
    
    void release(ASRConnection* conn) {
        std::lock_guard<std::mutex> lock(pool_mutex_);
        conn->set_in_use(false);
        cv_.notify_one();
    }
};

// ============================================================================
// MCP Protocol Handler
// ============================================================================
class MCPSession {
private:
    int client_fd_;
    ASRConnectionPool& pool_;
    std::atomic<bool> active_;
    std::atomic<bool> finished_;
    std::thread worker_thread_;
    std::unique_ptr<StreamContext> stream_ctx_;
    std::vector<uint8_t> accumulated_audio_;
    std::mutex audio_mutex_;
    std::vector<std::thread> transcription_threads_;
    std::mutex threads_mutex_;
    
public:
    MCPSession(int fd, ASRConnectionPool& pool) 
        : client_fd_(fd), pool_(pool), active_(true), finished_(false) {
        stream_ctx_ = std::make_unique<StreamContext>();
    }
    
    ~MCPSession() {
        active_ = false;
        finished_ = true;
        
        // Wait for all transcription threads to complete
        {
            std::lock_guard<std::mutex> lock(threads_mutex_);
            for (auto& t : transcription_threads_) {
                if (t.joinable()) {
                    t.join();
                }
            }
        }
        
        if (worker_thread_.joinable()) {
            worker_thread_.join();
        }
        
        if (client_fd_ >= 0) {
            close(client_fd_);
        }
    }
    
    bool is_finished() const {
        return finished_.load();
    }
    
    void start() {
        worker_thread_ = std::thread(&MCPSession::handle_session, this);
    }
    
private:
    void handle_session() {
        uint8_t buffer[BUFFER_SIZE];
        
        // Send initial handshake
        send_response("{\"type\":\"initialized\",\"server\":\"asr-mcp\",\"version\":\"1.0\"}");
        
        while (active_) {
            // Poll for data from client
            struct pollfd pfd = {client_fd_, POLLIN, 0};
            int ret = poll(&pfd, 1, POLL_TIMEOUT_MS);
            
            if (ret > 0 && (pfd.revents & POLLIN)) {
                ssize_t n = recv(client_fd_, buffer, BUFFER_SIZE, MSG_DONTWAIT);
                
                if (n <= 0) {
                    if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) {
                        break; // Connection closed or error
                    }
                    continue;
                }
                
                // Safe string construction with explicit length
                std::string msg(reinterpret_cast<char*>(buffer), static_cast<size_t>(n));
                
                if (msg.find("\"method\":\"transcribe\"") != std::string::npos) {
                    handle_transcribe_request(msg);
                } else if (msg.find("\"method\":\"stream_audio\"") != std::string::npos) {
                    handle_audio_stream(buffer, n);
                } else if (msg.find("\"method\":\"finalize_transcription\"") != std::string::npos) {
                    handle_finalize_transcription();
                }
            }
            
            // Check for results from ASR backend (streaming)
            std::string result;
            {
                std::lock_guard<std::mutex> lock(stream_ctx_->mutex);
                if (!stream_ctx_->result_queue.empty()) {
                    result = stream_ctx_->result_queue.front();
                    stream_ctx_->result_queue.pop();
                }
            }
            
            if (!result.empty()) {
                // Forward partial results immediately
                send_response(result);
            }
        }
    }
    
    void handle_transcribe_request(const std::string& msg) {
        // Extract audio data from message (simplified)
        // In production, parse JSON properly and extract base64 audio
        // For now, assume audio is in the message body or will be streamed
        
        std::vector<uint8_t> audio_copy;
        {
            std::lock_guard<std::mutex> audio_lock(audio_mutex_);
            
            if (accumulated_audio_.empty()) {
                send_error("No audio data provided");
                return;
            }
            
            // Check size limit
            if (accumulated_audio_.size() > MAX_AUDIO_SIZE) {
                send_error("Audio data too large (max " + std::to_string(MAX_AUDIO_SIZE) + " bytes)");
                return;
            }
            
            // Copy audio data for thread safety
            audio_copy = accumulated_audio_;
        }
        
        ASRConnection* asr_conn = pool_.acquire();
        if (!asr_conn) {
            send_error("No ASR connection available");
            return;
        }
        
        // Create thread and track it
        std::thread transcribe_thread([this, asr_conn, audio_copy]() {
            bool success = asr_conn->transcribe_audio(
                audio_copy.data(), 
                audio_copy.size(), 
                stream_ctx_.get()
            );
            if (!success) {
                send_error("Transcription request failed");
            }
            pool_.release(asr_conn);
        });
        
        // Store thread reference for cleanup
        {
            std::lock_guard<std::mutex> threads_lock(threads_mutex_);
            transcription_threads_.push_back(std::move(transcribe_thread));
        }
    }
    
    void handle_audio_stream(const uint8_t* data, size_t len) {
        // Validate input
        if (!data || len == 0) {
            send_error("Invalid audio data");
            return;
        }
        
        std::lock_guard<std::mutex> audio_lock(audio_mutex_);
        
        // Check size limit
        if (accumulated_audio_.size() + len > MAX_AUDIO_SIZE) {
            send_error("Audio data too large (max " + std::to_string(MAX_AUDIO_SIZE) + " bytes)");
            return;
        }
        
        // Accumulate audio chunks
        accumulated_audio_.insert(accumulated_audio_.end(), data, data + len);
        size_t total_size = accumulated_audio_.size();
        
        // Send acknowledgment
        send_response("{\"type\":\"audio_received\",\"bytes\":" + 
                     std::to_string(total_size) + "}");
    }
    
    void handle_finalize_transcription() {
        std::vector<uint8_t> audio_copy;
        {
            std::lock_guard<std::mutex> audio_lock(audio_mutex_);
            
            if (accumulated_audio_.empty()) {
                send_error("No audio data to transcribe");
                return;
            }
            
            // Check size limit
            if (accumulated_audio_.size() > MAX_AUDIO_SIZE) {
                send_error("Audio data too large (max " + std::to_string(MAX_AUDIO_SIZE) + " bytes)");
                return;
            }
            
            // Copy audio data for thread safety and clear
            audio_copy = accumulated_audio_;
            accumulated_audio_.clear();
        }
        
        ASRConnection* asr_conn = pool_.acquire();
        if (!asr_conn) {
            send_error("No ASR connection available");
            return;
        }
        
        // Start transcription in background thread
        std::thread transcribe_thread([this, asr_conn, audio_copy]() {
            bool success = asr_conn->transcribe_audio(
                audio_copy.data(), 
                audio_copy.size(), 
                stream_ctx_.get()
            );
            
            if (!success) {
                send_error("Transcription request failed");
            }
            
            // Send final result marker
            send_response("{\"type\":\"transcription_complete\"}");
            
            pool_.release(asr_conn);
        });
        
        // Store thread reference for cleanup
        {
            std::lock_guard<std::mutex> threads_lock(threads_mutex_);
            transcription_threads_.push_back(std::move(transcribe_thread));
        }
    }
    
    void send_response(const std::string& response) {
        if (client_fd_ < 0) return;
        
        std::string msg = response + "\n";
        ssize_t sent = send(client_fd_, msg.c_str(), msg.length(), MSG_NOSIGNAL);
        if (sent < 0) {
            std::cerr << "Error sending response: " << strerror(errno) << std::endl;
        }
    }
    
    void send_error(const std::string& error) {
        // Escape error message for JSON safety
        std::string escaped;
        for (char c : error) {
            if (c == '"') escaped += "\\\"";
            else if (c == '\\') escaped += "\\\\";
            else if (c == '\n') escaped += "\\n";
            else if (c == '\r') escaped += "\\r";
            else escaped += c;
        }
        
        std::stringstream ss;
        ss << "{\"type\":\"error\",\"message\":\"" << escaped << "\"}\n";
        send_response(ss.str());
    }
};

// ============================================================================
// Main MCP Server
// ============================================================================
class MCPServer {
private:
    int server_fd_;
    ASRConnectionPool pool_;
    std::vector<std::unique_ptr<MCPSession>> sessions_;
    std::atomic<bool> running_;
    std::mutex sessions_mutex_;
    
public:
    MCPServer(size_t pool_size)
        : pool_(pool_size), running_(true) {
        
        server_fd_ = socket(AF_INET, SOCK_STREAM, 0);
        if (server_fd_ < 0) {
            throw std::runtime_error("Failed to create socket");
        }
        
        int opt = 1;
        setsockopt(server_fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        
        struct sockaddr_in addr;
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(MCP_PORT);
        
        if (bind(server_fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            throw std::runtime_error("Failed to bind");
        }
        
        if (listen(server_fd_, MAX_CONNECTIONS) < 0) {
            throw std::runtime_error("Failed to listen");
        }
        
        std::cout << "MCP Server listening on port " << MCP_PORT << std::endl;
        std::cout << "ASR API: " << ASR_API_URL << std::endl;
    }
    
    ~MCPServer() {
        running_ = false;
        close(server_fd_);
    }
    
    void run() {
        // Cleanup thread for finished sessions
        std::thread cleanup_thread([this]() {
            while (running_) {
                std::this_thread::sleep_for(std::chrono::seconds(5));
                cleanup_finished_sessions();
            }
        });
        
        while (running_) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            
            int client_fd = accept(server_fd_, (struct sockaddr*)&client_addr, &client_len);
            if (client_fd < 0) {
                if (errno != EAGAIN && errno != EWOULDBLOCK) {
                    std::cerr << "Accept error: " << strerror(errno) << std::endl;
                }
                continue;
            }
            
            // Set TCP_NODELAY for client connection
            int flag = 1;
            setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
            
            std::cout << "New connection from " 
                     << inet_ntoa(client_addr.sin_addr) << std::endl;
            
            auto session = std::make_unique<MCPSession>(client_fd, pool_);
            session->start();
            
            {
                std::lock_guard<std::mutex> lock(sessions_mutex_);
                sessions_.push_back(std::move(session));
            }
        }
        
        if (cleanup_thread.joinable()) {
            cleanup_thread.join();
        }
    }
    
private:
    void cleanup_finished_sessions() {
        std::lock_guard<std::mutex> lock(sessions_mutex_);
        auto it = std::remove_if(sessions_.begin(), sessions_.end(),
            [](const std::unique_ptr<MCPSession>& session) {
                return session && session->is_finished();
            });
        sessions_.erase(it, sessions_.end());
    }
};

// ============================================================================
// Entry Point
// ============================================================================
int main(int argc, char* argv[]) {
    try {
        // Initialize libcurl
        curl_global_init(CURL_GLOBAL_DEFAULT);
        
        // Connection pool size (number of concurrent ASR requests)
        size_t pool_size = 10;
        
        if (argc >= 2) {
            pool_size = std::stoul(argv[1]);
        }
        
        std::cout << "Starting ASR MCP Server..." << std::endl;
        std::cout << "Connection pool size: " << pool_size << std::endl;
        
        MCPServer server(pool_size);
        server.run();
        
        // Cleanup libcurl
        curl_global_cleanup();
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        curl_global_cleanup();
        return 1;
    }
    
    return 0;
}