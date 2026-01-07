# Voice Typer

A cross-platform desktop application that converts speech to text and types it at your cursor position in any application.

## Features

- 🎤 **Microphone Control**: Toggle microphone on/off
- 🔄 **App Toggle**: Enable/disable the entire application
- 📡 **ASR MCP Integration**: Streams audio to your ASR MCP server
- ⌨️ **Auto-typing**: Inserts transcribed text at the active cursor position
- 🖥️ **Cross-platform**: Works on macOS and Windows
- ⚙️ **Configurable**: Customize ASR MCP server host and port

## Requirements

### System Requirements
- **macOS**: 10.13 or later
- **Windows**: Windows 10 or later
- **Node.js**: 14.0 or later (for development)

### Audio Capture Dependencies

**macOS:**
- Install either `sox` or `ffmpeg`:
  ```bash
  brew install sox
  # OR
  brew install ffmpeg
  ```

**Windows:**
- Install `ffmpeg` from [https://ffmpeg.org](https://ffmpeg.org)
- Add ffmpeg to your system PATH

**Linux:**
- Install `arecord` (part of alsa-utils):
  ```bash
  sudo apt-get install alsa-utils
  ```

### ASR MCP Server

You need to have the ASR MCP server running. The server should be listening on the configured host and port (default: `localhost:8080`).

## Installation

1. Clone or download this repository
2. Navigate to the `voice-typer` directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Running

### Development Mode

```bash
npm start
```

### Building for Production

**macOS:**
```bash
npm run build:mac
```

**Windows:**
```bash
npm run build:win
```

The built applications will be in the `dist` folder.

## Usage

1. **Start the ASR MCP Server**: Make sure your ASR MCP server is running (e.g., `asr_mcp_stream`)

2. **Launch Voice Typer**: Start the application

3. **Configure ASR Server** (if needed):
   - Enter the host and port of your ASR MCP server
   - Choose streaming or batch mode
   - Click "Save Config"

4. **Enable the App**: Toggle the "App Status" switch to ON

5. **Enable Microphone**: Toggle the "Microphone" switch to ON

6. **Start Speaking**: The app will capture your voice, send it to the ASR MCP server, and type the transcribed text at your cursor position in any application.

## How It Works

1. **Audio Capture**: The app captures audio from your microphone using platform-specific tools (sox/ffmpeg on macOS, ffmpeg on Windows)

2. **ASR MCP Client**: Audio chunks are sent to the ASR MCP server via TCP socket using the MCP protocol

3. **Transcription**: The ASR MCP server processes the audio and returns transcribed text

4. **Text Insertion**: The transcribed text is automatically inserted at the cursor position using:
   - **macOS**: AppleScript to send keystrokes
   - **Windows**: PowerShell SendKeys API

## Configuration

### ASR MCP Server Settings

- **Host**: The hostname or IP address of your ASR MCP server (default: `localhost`)
- **Port**: The port number (default: `8080`)
- **Streaming Mode**: Enable/disable streaming mode (recommended for real-time transcription)

### Environment Variables

The ASR MCP server may require an API key. Set it as an environment variable:
```bash
export ASR_API_KEY="your-api-key-here"
```

## Troubleshooting

### Microphone Not Working

1. Check that you've granted microphone permissions to the app
2. Verify that sox/ffmpeg is installed and accessible
3. Check the console for error messages

### Text Not Typing

1. Make sure the app has accessibility permissions (macOS) or is running with appropriate privileges (Windows)
2. Try clicking in a text field before speaking
3. Check that the transcription is appearing in the app (if not, check ASR MCP connection)

### ASR MCP Connection Issues

1. Verify the ASR MCP server is running
2. Check the host and port settings
3. Ensure the server is accessible from your machine
4. Check firewall settings

## Development

### Project Structure

```
voice-typer/
├── main.js              # Electron main process
├── index.html           # UI HTML
├── styles.css           # UI styles
├── renderer.js          # Renderer process (UI logic)
├── asr-client.js        # ASR MCP client
├── native/
│   ├── audio-capture.js           # Audio capture wrapper
│   ├── audio-capture-native.js    # Native audio capture implementation
│   └── text-inserter.js           # Cross-platform text insertion
└── package.json         # Dependencies and build config
```

### Adding Native Modules

For better performance, you can replace the current implementations with native Node.js addons:

- **Audio Capture**: Use `node-addon-api` with CoreAudio (macOS) or WASAPI (Windows)
- **Text Insertion**: Use `node-addon-api` with CGEvent (macOS) or SendInput (Windows)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

