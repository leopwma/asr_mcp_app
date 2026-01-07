const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
// Audio capture is now handled in renderer process via getUserMedia (Web Audio API)
// No need for external tools (ffmpeg/sox)!
const { TextInserter } = require('./native/text-inserter');
const { ASRClient } = require('./asr-client');

let mainWindow = null;
let tray = null;
// Audio capture is now handled in renderer process via getUserMedia
let textInserter = null;
let asrClient = null;
let isAppEnabled = false;
let isMicEnabled = false;

// Default ASR MCP configuration
let asrConfig = {
  host: 'localhost',
  port: 8080,
  useStreaming: true
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enable mediaDevices API for getUserMedia
      enableBlinkFeatures: 'MediaDevices'
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    resizable: false,
    frame: true,
    title: 'Voice Typer'
  });

  mainWindow.loadFile('index.html');

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create system tray
  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(iconPath || path.join(__dirname, 'assets', 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        cleanup();
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Voice Typer');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function cleanup() {
  // Tell renderer to stop audio capture
  if (mainWindow) {
    mainWindow.webContents.send('stop-audio-capture');
  }
  if (asrClient) {
    asrClient.disconnect();
    asrClient = null;
  }
  isMicEnabled = false;
  isAppEnabled = false;
}

// Initialize native modules
function initializeNativeModules() {
  try {
    textInserter = new TextInserter();
    // Audio capture is now handled in renderer process via getUserMedia
    // Audio data will be sent from renderer via IPC
    asrClient = new ASRClient();
    
    // Handle audio data from renderer process (via getUserMedia)
    ipcMain.on('audio-data', (event, audioBuffer) => {
      // Ensure we have a proper Buffer (IPC might deserialize it differently)
      let buffer = audioBuffer;
      if (!Buffer.isBuffer(audioBuffer)) {
        console.log('[Main] Converting audio data to Buffer...');
        if (audioBuffer instanceof Uint8Array) {
          buffer = Buffer.from(audioBuffer);
        } else if (audioBuffer && audioBuffer.data) {
          // Handle serialized Buffer
          buffer = Buffer.from(audioBuffer.data);
        } else {
          console.error('[Main] Unknown audio data type:', typeof audioBuffer, audioBuffer);
          return;
        }
      }
      
      console.log('[Main] Audio data received from renderer:', buffer.length, 'bytes');
      console.log('[Main] Buffer type:', Buffer.isBuffer(buffer) ? 'Buffer' : typeof buffer);
      
      // Log first few bytes for debugging
      if (buffer.length > 0) {
        const preview = Array.from(buffer.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log('[Main] Audio buffer preview (hex):', preview);
      }
      
      console.log('[Main] Conditions - isAppEnabled:', isAppEnabled, 'isMicEnabled:', isMicEnabled, 'hasClient:', !!asrClient);
      
      if (isAppEnabled && isMicEnabled && asrClient) {
        console.log('[Main] Sending audio to ASR client...');
        const sent = asrClient.sendAudio(buffer);
        console.log('[Main] Audio send result:', sent ? 'success' : 'failed');
      } else {
        console.log('[Main] ⚠️  Not sending audio - conditions not met');
      }
    });
    
    // Handle audio capture errors from renderer
    ipcMain.on('audio-error', (event, error) => {
      console.error('[Main] Audio capture error from renderer:', error);
      if (mainWindow) {
        mainWindow.webContents.send('asr-error', `Audio capture: ${error}`);
      }
    });
    
    // Set up ASR transcription callback
    asrClient.on('transcription', (text) => {
      console.log('\n' + '='.repeat(80));
      console.log('[Main] ===== TEXT RETURNED - RECEIVED IN MAIN PROCESS =====');
      console.log('[Main] ===== TRANSCRIPTION RECEIVED =====');
      console.log('='.repeat(80) + '\n');
      console.log('[Main] Text:', text);
      console.log('[Main] Text length:', text ? text.length : 0);
      console.log('[Main] Text trimmed:', text ? text.trim().length : 0);
      console.log('[Main] isAppEnabled:', isAppEnabled);
      console.log('[Main] hasTextInserter:', !!textInserter);
      console.log('[Main] hasMainWindow:', !!mainWindow);
      
      if (!isAppEnabled) {
        console.log('[Main] ⚠️  App is disabled, skipping insertion');
        return;
      }
      
      if (!textInserter) {
        console.log('[Main] ⚠️  TextInserter not initialized');
        return;
      }
      
      if (!text || !text.trim()) {
        console.log('[Main] ⚠️  Empty text, skipping');
        return;
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('[Main] ✓✓✓ ALL CHECKS PASSED - INSERTING TEXT AT CURSOR ✓✓✓');
      console.log('[Main] ✓✓✓ TEXT: "' + text + '" ✓✓✓');
      console.log('='.repeat(80) + '\n');
      console.log('[Main] Calling textInserter.insertText');
      console.log('[Main] Inserting text:', text.substring(0, 100));
      textInserter.insertText(text);
      
      if (mainWindow) {
        mainWindow.webContents.send('transcription-update', text);
        console.log('[Main] ✓ Sent transcription to UI');
      } else {
        console.log('[Main] ⚠️  Main window not available');
      }
    });
    
    // Set up ASR error callback
    asrClient.on('error', (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('asr-error', error);
      }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to initialize native modules:', error);
    return false;
  }
}

// IPC Handlers
ipcMain.on('toggle-app', (event, enabled) => {
  isAppEnabled = enabled;
  if (!enabled) {
    // Stop microphone if app is disabled
    if (isMicEnabled) {
      toggleMicrophone(false);
    }
  }
  event.reply('app-toggled', isAppEnabled);
});

ipcMain.on('toggle-microphone', (event, enabled) => {
  toggleMicrophone(enabled);
  event.reply('mic-toggled', isMicEnabled);
});

function toggleMicrophone(enabled) {
  console.log('[Main] toggleMicrophone called:', enabled);
  console.log('[Main] isAppEnabled:', isAppEnabled);
  
  if (!isAppEnabled && enabled) {
    console.log('[Main] ⚠️  Cannot enable mic - app is disabled');
    return; // Can't enable mic if app is disabled
  }
  
  isMicEnabled = enabled;
  console.log('[Main] isMicEnabled set to:', isMicEnabled);
  
  if (enabled) {
    console.log('[Main] Starting microphone...');
    // Tell renderer to start audio capture (uses getUserMedia)
    if (mainWindow) {
      mainWindow.webContents.send('start-audio-capture');
    }
    
    // Connect to ASR MCP server
    if (asrClient) {
      console.log('[Main] ===== CONNECTING TO ASR MCP SERVER =====');
      console.log('[Main] Host:', asrConfig.host);
      console.log('[Main] Port:', asrConfig.port);
      console.log('[Main] UseStreaming:', asrConfig.useStreaming);
      
      // Set up connection event handlers
      asrClient.on('connected', () => {
        console.log('[Main] ✓✓✓ ASR CLIENT CONNECTED ✓✓✓');
      });
      
      asrClient.on('error', (error) => {
        console.error('[Main] ✗✗✗ ASR CLIENT ERROR ✗✗✗');
        console.error('[Main] Error:', error);
        if (mainWindow) {
          mainWindow.webContents.send('asr-error', `Connection error: ${error}`);
        }
      });
      
      asrClient.on('disconnected', () => {
        console.log('[Main] ⚠️  ASR CLIENT DISCONNECTED');
      });
      
      asrClient.connect(asrConfig.host, asrConfig.port, asrConfig.useStreaming);
    } else {
      console.log('[Main] ⚠️  asrClient not initialized');
    }
  } else {
    console.log('[Main] Stopping microphone...');
    // Tell renderer to stop audio capture
    if (mainWindow) {
      mainWindow.webContents.send('stop-audio-capture');
    }
    
    // Disconnect from ASR MCP server
    if (asrClient) {
      asrClient.disconnect();
    }
  }
}

ipcMain.on('update-asr-config', (event, config) => {
  asrConfig = { ...asrConfig, ...config };
  
  // Reconnect if currently connected
  if (isMicEnabled && asrClient) {
    asrClient.disconnect();
    asrClient.connect(asrConfig.host, asrConfig.port, asrConfig.useStreaming);
  }
  
  event.reply('asr-config-updated', asrConfig);
});

ipcMain.on('get-status', (event) => {
  event.reply('status', {
    appEnabled: isAppEnabled,
    micEnabled: isMicEnabled,
    asrConfig: asrConfig
  });
});

// App lifecycle
app.whenReady().then(() => {
  if (initializeNativeModules()) {
    createWindow();
  } else {
    console.error('Failed to initialize. Please check native module dependencies.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  cleanup();
});

