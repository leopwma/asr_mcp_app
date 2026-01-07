# ASR MCP Server Compilation Guide

## Overview

The ASR MCP system has two server implementations:
- **`asr_mcp_batch.cpp`**: HTTP-based batch transcription server using libcurl
- **`asr_mcp_stream.cpp`**: WebSocket-based streaming transcription server using Boost.Beast

## Prerequisites

### Common Requirements
- **C++ Compiler**: `g++` (GCC) or `clang++` with C++17 support
- **Standard Libraries**: POSIX sockets, threading, etc. (usually included)

### `asr_mcp_batch.cpp` Dependencies
- **libcurl**: HTTP client library for making API requests
  ```bash
  # macOS
  brew install curl
  
  # Ubuntu/Debian
  sudo apt-get install libcurl4-openssl-dev
  ```

### `asr_mcp_stream.cpp` Dependencies
- **Boost Libraries**: Boost.Beast, Boost.Asio, Boost.SSL
  ```bash
  # macOS
  brew install boost
  
  # Ubuntu/Debian
  sudo apt-get install libboost-all-dev
  ```

## Compilation Commands

### Compile `asr_mcp_batch.cpp`

```bash
g++ -std=c++17 -O2 -pthread \
    -o asr_mcp_batch \
    asr_mcp_batch.cpp \
    -lcurl
```

**Or with clang++:**
```bash
clang++ -std=c++17 -O2 -pthread \
        -o asr_mcp_batch \
        asr_mcp_batch.cpp \
        -lcurl
```

### Compile `asr_mcp_stream.cpp`

```bash
g++ -std=c++17 -O2 -pthread \
    -o asr_mcp_stream \
    asr_mcp_stream.cpp \
    -lboost_system -lboost_thread -lssl -lcrypto
```

**Or with clang++:**
```bash
clang++ -std=c++17 -O2 -pthread \
        -o asr_mcp_stream \
        asr_mcp_stream.cpp \
        -lboost_system -lboost_thread -lssl -lcrypto
```

## Key Differences

| Feature | `asr_mcp_batch.cpp` | `asr_mcp_stream.cpp` |
|---------|---------------------|----------------------|
| **Protocol** | HTTP POST (multipart/form-data) | WebSocket (WSS) |
| **Library** | libcurl | Boost.Beast + Boost.Asio |
| **Mode** | Batch (accumulate audio, then transcribe) | Streaming (real-time transcription) |
| **Dependencies** | `-lcurl` | `-lboost_system -lboost_thread -lssl -lcrypto` |
| **Use Case** | Complete audio files | Real-time audio streaming |

## Compilation Flags Explained

- `-std=c++17`: C++17 standard (required for modern C++ features)
- `-O2`: Optimization level 2 (good balance of speed and compile time)
- `-pthread`: Enable POSIX threading support
- `-l<library>`: Link against the specified library

## Running the Compiled Servers

Both servers listen on port **8080** by default:

```bash
# Set API key (optional, has fallback)
export ASR_API_KEY="your_api_key_here"

# Run batch server
./asr_mcp_batch

# Run streaming server
./asr_mcp_stream
```

## Troubleshooting

### "curl/curl.h: No such file or directory"
- Install libcurl development headers: `brew install curl` or `sudo apt-get install libcurl4-openssl-dev`

### "boost/beast/core.hpp: No such file or directory"
- Install Boost: `brew install boost` or `sudo apt-get install libboost-all-dev`

### "undefined reference to `boost::system`"
- Ensure Boost libraries are installed and link with `-lboost_system -lboost_thread`

### "undefined reference to `SSL_*`"
- Install OpenSSL development headers: `brew install openssl` or `sudo apt-get install libssl-dev`
- Link with `-lssl -lcrypto`

