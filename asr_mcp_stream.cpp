// Unified ASR MCP Streaming Server using Boost.Beast for WebSocket
// Pure C++ implementation - no external bridge needed

#include <algorithm>
#include <arpa/inet.h>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <memory>
#include <mutex>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <queue>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <vector>

#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/ssl/stream.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/beast/websocket/ssl.hpp>

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
namespace ssl = boost::asio::ssl;
using tcp = boost::asio::ip::tcp;

// ============================================================================
// Configuration
// ============================================================================
constexpr int MCP_PORT = 8080;
constexpr int MAX_CONNECTIONS = 100;
constexpr int BUFFER_SIZE = 16384;

// ASR WebSocket API Configuration
const std::string ASR_WS_HOST = "asr-ws.votee-demo.votee.dev";
const std::string ASR_WS_PORT = "443";
const std::string ASR_WS_PATH = "/v1/audio/transcriptions";
const std::string ASR_LANGUAGE = "yue"; // Cantonese (default)

constexpr int CONNECTION_TIMEOUT_MS = 10000;
constexpr int POLL_TIMEOUT_MS = 100;

// Base64 decoding table
static const std::string BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Get API key from environment
static std::string get_api_key() {
  const char *env_key = std::getenv("ASR_API_KEY");
  if (env_key && strlen(env_key) > 0) {
    return std::string(env_key);
  }
  return "votee_69e3377e77d40f345a792848";
}

// Get language from environment
static std::string get_language() {
  const char *env_lang = std::getenv("ASR_LANGUAGE");
  if (env_lang && strlen(env_lang) > 0) {
    return std::string(env_lang);
  }
  return ASR_LANGUAGE;
}

// Base64 decode
static std::vector<uint8_t> base64_decode(const std::string &encoded) {
  std::vector<uint8_t> decoded;
  int val = 0, valb = -8;
  for (char c : encoded) {
    if (c == '=')
      break;
    size_t pos = BASE64_CHARS.find(c);
    if (pos == std::string::npos)
      continue;
    val = (val << 6) + static_cast<int>(pos);
    valb += 6;
    if (valb >= 0) {
      decoded.push_back(static_cast<uint8_t>((val >> valb) & 0xFF));
      valb -= 8;
    }
  }
  return decoded;
}

// ============================================================================
// Stream Context
// ============================================================================
struct StreamContext {
  std::queue<std::string> result_queue;
  std::mutex mutex;
  std::atomic<bool> streaming{false};
  std::atomic<bool> connected{false};
  std::string last_message;
};

// ============================================================================
// Beast WebSocket ASR Connection
// ============================================================================
class ASRConnection {
private:
  net::io_context ioc_;
  ssl::context ssl_ctx_{ssl::context::tlsv12_client};
  std::unique_ptr<websocket::stream<beast::ssl_stream<tcp::socket>>> ws_;
  std::thread read_thread_;
  std::atomic<bool> active_{false};
  StreamContext *stream_ctx_{nullptr};
  std::mutex mutex_;
  beast::flat_buffer read_buffer_;

public:
  ASRConnection() {
    // Configure SSL
    ssl_ctx_.set_default_verify_paths();
    ssl_ctx_.set_verify_mode(ssl::verify_none); // For development
  }

  ~ASRConnection() { stop(); }

  bool is_valid() const { return true; }

  bool connect(StreamContext *stream_ctx) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (ws_ && stream_ctx_ && stream_ctx_->connected) {
      return true;
    }

    stream_ctx_ = stream_ctx;

    try {
      // Resolve the host
      tcp::resolver resolver(ioc_);
      auto const results = resolver.resolve(ASR_WS_HOST, ASR_WS_PORT);

      // Create WebSocket stream
      ws_ = std::make_unique<websocket::stream<beast::ssl_stream<tcp::socket>>>(
          ioc_, ssl_ctx_);

      // Set SNI
      if (!SSL_set_tlsext_host_name(ws_->next_layer().native_handle(),
                                    ASR_WS_HOST.c_str())) {
        throw beast::system_error(
            beast::error_code(static_cast<int>(::ERR_get_error()),
                              net::error::get_ssl_category()),
            "Failed to set SNI");
      }

      // Connect to the server
      net::connect(ws_->next_layer().next_layer(), results.begin(),
                   results.end());

      // SSL handshake
      ws_->next_layer().handshake(ssl::stream_base::client);

      // Build the target path with query params
      std::string api_key = get_api_key();
      std::string language = get_language();
      std::string target =
          ASR_WS_PATH + "?language=" + language + "&api-key=" + api_key;

      // Set WebSocket options
      ws_->set_option(
          websocket::stream_base::decorator([](websocket::request_type &req) {
            req.set(beast::http::field::user_agent, "ASR-MCP/1.0");
            req.set(beast::http::field::origin,
                    "https://asr-ws.votee-demo.votee.dev");
          }));

      std::cout << "Connecting to WebSocket: wss://" << ASR_WS_HOST
                << ASR_WS_PATH << std::endl;
      std::cout << "Language: " << language
                << ", API Key: " << api_key.substr(0, 10) << "..." << std::endl;

      // WebSocket handshake
      ws_->handshake(ASR_WS_HOST, target);

      stream_ctx_->connected = true;
      stream_ctx_->streaming = true;
      active_ = true;

      std::cout << "✓ WebSocket connected successfully!" << std::endl;

      // Start async read thread
      read_thread_ = std::thread(&ASRConnection::read_loop, this);

      return true;

    } catch (const std::exception &e) {
      std::cerr << "✗ WebSocket connection failed: " << e.what() << std::endl;
      stream_ctx_->connected = false;
      stream_ctx_->streaming = false;
      return false;
    }
  }

  void read_loop() {
    while (active_ && stream_ctx_ && stream_ctx_->connected) {
      try {
        beast::flat_buffer buffer;
        ws_->read(buffer);

        std::string message = beast::buffers_to_string(buffer.data());

        // Parse and handle the message
        handle_message(message);

      } catch (const beast::system_error &e) {
        if (e.code() != websocket::error::closed) {
          std::cerr << "WebSocket read error: " << e.what() << std::endl;
        }
        break;
      }
    }

    if (stream_ctx_) {
      stream_ctx_->connected = false;
      stream_ctx_->streaming = false;
    }
  }

  void handle_message(const std::string &message) {
    if (!stream_ctx_)
      return;

    // Skip status messages
    if (message.find("ASR started") != std::string::npos ||
        message.find("ASR Stopped") != std::string::npos) {
      return;
    }

    // Check for transcription with text field
    if (message.find("\"text\"") != std::string::npos) {
      // Check if final
      bool is_final = true;
      if (message.find("\"is_final\":false") != std::string::npos ||
          message.find("\"partial\":true") != std::string::npos) {
        is_final = false;
      }

      // Extract text
      size_t text_pos = message.find("\"text\"");
      if (text_pos != std::string::npos) {
        size_t colon_pos = message.find(":", text_pos);
        if (colon_pos != std::string::npos) {
          size_t value_start = message.find("\"", colon_pos);
          if (value_start != std::string::npos) {
            size_t value_end = message.find("\"", value_start + 1);
            if (value_end != std::string::npos) {
              std::string text =
                  message.substr(value_start + 1, value_end - value_start - 1);

              if (!is_final) {
                std::cout << "[Partial] " << text.substr(0, 50) << "..."
                          << std::endl;
                return;
              }

              // Remove duplicate prefix
              std::string non_duplicate = text;
              std::lock_guard<std::mutex> lock(stream_ctx_->mutex);
              if (!stream_ctx_->last_message.empty() &&
                  text.length() >= stream_ctx_->last_message.length() &&
                  text.substr(0, stream_ctx_->last_message.length()) ==
                      stream_ctx_->last_message) {
                non_duplicate = text.substr(stream_ctx_->last_message.length());
              }

              if (!non_duplicate.empty()) {
                std::string escaped;
                for (char c : non_duplicate) {
                  if (c == '"')
                    escaped += "\\\"";
                  else if (c == '\\')
                    escaped += "\\\\";
                  else if (c == '\n')
                    escaped += "\\n";
                  else
                    escaped += c;
                }

                stream_ctx_->result_queue.push(
                    "{\"type\":\"transcription\",\"text\":\"" + escaped +
                    "\"}");
                std::cout << "✓✓✓ FINAL: \"" << non_duplicate << "\" ✓✓✓"
                          << std::endl;
              }

              stream_ctx_->last_message = text;
            }
          }
        }
      }
    }
  }

  bool send_audio_chunk(const uint8_t *data, size_t len) {
    if (!ws_ || !stream_ctx_ || !stream_ctx_->connected) {
      return false;
    }

    try {
      std::lock_guard<std::mutex> lock(mutex_);
      ws_->binary(true);
      ws_->write(net::buffer(data, len));
      return true;
    } catch (const std::exception &e) {
      std::cerr << "Send error: " << e.what() << std::endl;
      return false;
    }
  }

  void stop() {
    active_ = false;

    if (ws_ && stream_ctx_ && stream_ctx_->connected) {
      try {
        ws_->close(websocket::close_code::normal);
      } catch (...) {
      }
    }

    if (read_thread_.joinable()) {
      read_thread_.join();
    }

    if (stream_ctx_) {
      stream_ctx_->connected = false;
      stream_ctx_->streaming = false;
    }
  }

  bool is_connected() const {
    return stream_ctx_ && stream_ctx_->connected.load();
  }
};

// ============================================================================
// MCP Session Handler
// ============================================================================
class MCPSession {
private:
  int client_fd_;
  std::atomic<bool> active_{true};
  std::atomic<bool> finished_{false};
  std::thread worker_thread_;
  std::unique_ptr<StreamContext> stream_ctx_;
  std::unique_ptr<ASRConnection> asr_connection_;

public:
  MCPSession(int fd) : client_fd_(fd) {
    stream_ctx_ = std::make_unique<StreamContext>();
    asr_connection_ = std::make_unique<ASRConnection>();
  }

  ~MCPSession() {
    active_ = false;
    finished_ = true;
    if (asr_connection_)
      asr_connection_->stop();
    if (worker_thread_.joinable())
      worker_thread_.join();
    if (client_fd_ >= 0)
      close(client_fd_);
  }

  bool is_finished() const { return finished_.load(); }

  void start() {
    worker_thread_ = std::thread(&MCPSession::handle_session, this);
  }

private:
  void handle_session() {
    uint8_t buffer[BUFFER_SIZE];
    send_response("{\"type\":\"initialized\",\"server\":\"asr-mcp\","
                  "\"version\":\"1.0\"}");

    while (active_) {
      struct pollfd pfd = {client_fd_, POLLIN, 0};
      int ret = poll(&pfd, 1, POLL_TIMEOUT_MS);

      if (ret > 0 && (pfd.revents & POLLIN)) {
        ssize_t n = recv(client_fd_, buffer, BUFFER_SIZE, MSG_DONTWAIT);
        if (n <= 0) {
          if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK))
            break;
          continue;
        }

        std::string msg(reinterpret_cast<char *>(buffer),
                        static_cast<size_t>(n));

        if (msg.find("\"method\":\"transcribe\"") != std::string::npos) {
          handle_transcribe();
        } else if (msg.find("\"method\":\"stream_audio\"") !=
                   std::string::npos) {
          handle_audio_stream(buffer, n);
        } else if (msg.find("\"method\":\"finalize_transcription\"") !=
                   std::string::npos) {
          handle_finalize();
        }
      }

      // Forward results to client
      std::string result;
      {
        std::lock_guard<std::mutex> lock(stream_ctx_->mutex);
        if (!stream_ctx_->result_queue.empty()) {
          result = stream_ctx_->result_queue.front();
          stream_ctx_->result_queue.pop();
        }
      }
      if (!result.empty()) {
        send_response(result);
      }
    }

    finished_ = true;
  }

  void handle_transcribe() {
    if (!asr_connection_->connect(stream_ctx_.get())) {
      send_error("Failed to connect to ASR service");
      return;
    }
    send_response("{\"type\":\"transcription_started\"}");
  }

  void handle_audio_stream(const uint8_t *data, size_t len) {
    std::string msg(reinterpret_cast<const char *>(data), len);

    // Extract base64 data
    size_t data_pos = msg.find("\"data\":\"");
    if (data_pos == std::string::npos) {
      send_error("No audio data");
      return;
    }

    size_t data_start = data_pos + 8;
    size_t data_end = msg.find("\"", data_start);
    if (data_end == std::string::npos) {
      send_error("Invalid format");
      return;
    }

    std::string base64_data = msg.substr(data_start, data_end - data_start);
    std::vector<uint8_t> audio = base64_decode(base64_data);

    if (audio.empty()) {
      send_error("Decode failed");
      return;
    }

    if (!asr_connection_->is_connected()) {
      if (!asr_connection_->connect(stream_ctx_.get())) {
        send_error("Connection failed");
        return;
      }
    }

    if (asr_connection_->send_audio_chunk(audio.data(), audio.size())) {
      send_response("{\"type\":\"audio_sent\",\"bytes\":" +
                    std::to_string(audio.size()) + "}");
    } else {
      send_error("Send failed");
    }
  }

  void handle_finalize() {
    if (asr_connection_)
      asr_connection_->stop();
    send_response("{\"type\":\"transcription_stopped\"}");
  }

  void send_response(const std::string &response) {
    if (client_fd_ < 0)
      return;
    std::string msg = response + "\n";
    send(client_fd_, msg.c_str(), msg.length(), MSG_NOSIGNAL);
  }

  void send_error(const std::string &error) {
    send_response("{\"type\":\"error\",\"message\":\"" + error + "\"}");
  }
};

// ============================================================================
// MCP Server
// ============================================================================
class MCPServer {
private:
  int server_fd_;
  std::vector<std::unique_ptr<MCPSession>> sessions_;
  std::atomic<bool> running_{true};
  std::mutex sessions_mutex_;

public:
  MCPServer() {
    server_fd_ = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd_ < 0)
      throw std::runtime_error("Socket creation failed");

    int opt = 1;
    setsockopt(server_fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(MCP_PORT);

    if (bind(server_fd_, (struct sockaddr *)&addr, sizeof(addr)) < 0)
      throw std::runtime_error("Bind failed");

    if (listen(server_fd_, MAX_CONNECTIONS) < 0)
      throw std::runtime_error("Listen failed");

    std::cout << "========================================" << std::endl;
    std::cout << "ASR MCP Server (Boost.Beast WebSocket)" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Port: " << MCP_PORT << std::endl;
    std::cout << "ASR: wss://" << ASR_WS_HOST << ASR_WS_PATH << std::endl;
    std::cout << "Language: " << get_language() << std::endl;
    std::cout << "========================================" << std::endl;
  }

  ~MCPServer() {
    running_ = false;
    close(server_fd_);
  }

  void run() {
    std::thread cleanup([this]() {
      while (running_) {
        std::this_thread::sleep_for(std::chrono::seconds(5));
        std::lock_guard<std::mutex> lock(sessions_mutex_);
        auto it =
            std::remove_if(sessions_.begin(), sessions_.end(),
                           [](const auto &s) { return s && s->is_finished(); });
        sessions_.erase(it, sessions_.end());
      }
    });

    while (running_) {
      struct sockaddr_in client_addr;
      socklen_t client_len = sizeof(client_addr);

      int client_fd =
          accept(server_fd_, (struct sockaddr *)&client_addr, &client_len);
      if (client_fd < 0)
        continue;

      int flag = 1;
      setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

      std::cout << "New connection from " << inet_ntoa(client_addr.sin_addr)
                << std::endl;

      auto session = std::make_unique<MCPSession>(client_fd);
      session->start();

      std::lock_guard<std::mutex> lock(sessions_mutex_);
      sessions_.push_back(std::move(session));
    }

    if (cleanup.joinable())
      cleanup.join();
  }
};

// ============================================================================
// Main
// ============================================================================
int main() {
  try {
    std::cout << "Starting ASR MCP Server (Pure C++)..." << std::endl;
    MCPServer server;
    server.run();
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << std::endl;
    return 1;
  }
  return 0;
}