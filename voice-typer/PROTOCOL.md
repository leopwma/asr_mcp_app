# MCP Protocol Documentation

## Overview

The Voice Typer application communicates with the ASR MCP server using a simple TCP-based protocol with newline-delimited JSON messages.

## Connection

- **Protocol**: TCP
- **Default Port**: 8080
- **Default Host**: localhost

## Message Format

All messages are JSON objects terminated with a newline character (`\n`).

## Message Flow

### 1. Initialization

**Client → Server**: (automatic on connection)

**Server → Client**:
```json
{"type":"initialized","server":"asr-mcp","version":"1.0"}
```

### 2. Start Transcription

**Client → Server**:
```json
{"method":"transcribe"}
```

**Server → Client**:
```json
{"type":"transcription_started"}
```

### 3. Stream Audio

**Client → Server**:
```
{"method":"stream_audio"}\n
[Binary audio data]
```

The audio data is sent immediately after the JSON message (no newline between them). The server parses the JSON to identify the method, then processes the binary audio data that follows.

**Audio Format**:
- Sample Rate: 16000 Hz
- Channels: 1 (mono)
- Bit Depth: 16-bit
- Encoding: Signed integer, little-endian (s16le)

**Server → Client** (acknowledgment):
```json
{"type":"audio_sent","bytes":4096}
```

### 4. Transcription Results

**Server → Client** (streaming results):
```json
{"type":"transcription","text":"Hello world"}
```

The server sends partial transcription results as they become available.

### 5. Stop Transcription

**Client → Server**:
```json
{"method":"finalize_transcription"}
```

**Server → Client**:
```json
{"type":"transcription_stopped"}
```

## Error Handling

**Server → Client** (on error):
```json
{"type":"error","message":"Error description"}
```

## Notes

- The server uses a simple string search to identify message types (`"method":"stream_audio"`)
- Audio data is sent as raw binary immediately after the JSON message
- The server accumulates audio chunks and sends them to the ASR backend
- Transcription results are streamed back as they become available

