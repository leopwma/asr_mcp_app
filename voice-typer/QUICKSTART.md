# Quick Start Guide

## Prerequisites

1. **Install Node.js** (v14 or later)
2. **Install audio capture tool**:
   - **macOS**: `brew install sox` or `brew install ffmpeg`
   - **Windows**: Download ffmpeg from https://ffmpeg.org and add to PATH
3. **Start your ASR MCP server** (e.g., `./asr_mcp_stream`)

## Installation

```bash
cd voice-typer
npm install
```

## Running

```bash
npm start
```

## First Time Setup

1. **Grant Permissions** (macOS):
   - System Preferences → Security & Privacy → Accessibility
   - Add Voice Typer to allowed apps
   - System Preferences → Security & Privacy → Microphone
   - Add Voice Typer to allowed apps

2. **Configure ASR Server**:
   - Enter your ASR MCP server host (default: `localhost`)
   - Enter port (default: `8080`)
   - Click "Save Config"

3. **Enable the App**:
   - Toggle "App Status" to ON
   - Toggle "Microphone" to ON

4. **Test**:
   - Open any text editor (Notes, Word, etc.)
   - Click in a text field
   - Start speaking
   - Text should appear at your cursor!

## Troubleshooting

### "Microphone not working"
- Check microphone permissions
- Verify sox/ffmpeg is installed: `which sox` or `which ffmpeg`
- Check console for errors

### "Text not typing"
- Ensure app has accessibility permissions (macOS) or admin privileges (Windows)
- Try clicking in a text field before speaking
- Check that transcriptions appear in the app window

### "ASR connection failed"
- Verify ASR MCP server is running: `./asr_mcp_stream` or `./asr_mcp_batch`
- Check host/port settings
- Ensure server is accessible (not blocked by firewall)

## Building for Distribution

**macOS:**
```bash
npm run build:mac
```

**Windows:**
```bash
npm run build:win
```

Built apps will be in the `dist` folder.

