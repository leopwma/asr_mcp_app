# Installation Instructions

## macOS

### 1. Install Dependencies

```bash
# Install Node.js (if not already installed)
brew install node

# Install audio capture tool (choose one)
brew install sox
# OR
brew install ffmpeg
```

### 2. Install Application Dependencies

```bash
cd voice-typer
npm install
```

### 3. Grant Permissions

After first launch, you'll need to grant permissions:

1. **Accessibility Permission** (required for typing):
   - System Preferences → Security & Privacy → Privacy → Accessibility
   - Click the lock icon and enter your password
   - Check the box next to "Voice Typer" or click "+" to add it

2. **Microphone Permission** (required for audio capture):
   - System Preferences → Security & Privacy → Privacy → Microphone
   - Check the box next to "Voice Typer" or click "+" to add it

### 4. Run

```bash
npm start
```

## Windows

### 1. Install Dependencies

1. **Install Node.js**: Download from https://nodejs.org/

2. **Install FFmpeg**:
   - Download from https://ffmpeg.org/download.html
   - Extract to a folder (e.g., `C:\ffmpeg`)
   - Add to PATH:
     - Right-click "This PC" → Properties → Advanced system settings
     - Click "Environment Variables"
     - Under "System variables", find "Path" and click "Edit"
     - Click "New" and add the path to ffmpeg (e.g., `C:\ffmpeg\bin`)
     - Click OK on all dialogs

### 2. Install Application Dependencies

Open Command Prompt or PowerShell in the `voice-typer` directory:

```bash
npm install
```

### 3. Run

```bash
npm start
```

**Note**: On Windows, the app may need to run with administrator privileges for text insertion to work in some applications.

## Linux

### 1. Install Dependencies

```bash
# Install Node.js (if not already installed)
sudo apt-get install nodejs npm

# Install audio capture tool
sudo apt-get install alsa-utils
```

### 2. Install Application Dependencies

```bash
cd voice-typer
npm install
```

### 3. Run

```bash
npm start
```

## Building Distributable Packages

### macOS

```bash
npm run build:mac
```

This creates a `.dmg` file in the `dist` folder.

### Windows

```bash
npm run build:win
```

This creates an installer (`.exe`) in the `dist` folder.

## Troubleshooting Installation

### "Command not found: sox" or "Command not found: ffmpeg"

- **macOS**: Run `brew install sox` or `brew install ffmpeg`
- **Windows**: Ensure ffmpeg is in your PATH (see Windows installation steps)
- **Linux**: Run `sudo apt-get install alsa-utils`

### "npm: command not found"

Install Node.js from https://nodejs.org/

### Permission Denied Errors

- **macOS**: Grant Accessibility and Microphone permissions (see macOS installation steps)
- **Windows**: Try running as Administrator
- **Linux**: May need to add user to audio group: `sudo usermod -a -G audio $USER`

