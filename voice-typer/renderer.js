const { ipcRenderer } = require('electron');
const { AudioCaptureWeb } = require('./native/audio-capture-web');

// Audio capture instance (using Web Audio API / getUserMedia)
let audioCapture = null;

// UI Elements
const appToggle = document.getElementById('appToggle');
const micToggle = document.getElementById('micToggle');
const appStatus = document.getElementById('appStatus');
const micStatus = document.getElementById('micStatus');
const asrHost = document.getElementById('asrHost');
const asrPort = document.getElementById('asrPort');
const useStreaming = document.getElementById('useStreaming');
const saveConfigBtn = document.getElementById('saveConfig');
const transcriptionBox = document.getElementById('transcriptionBox');
const errorText = document.getElementById('errorText');

// Event Listeners
appToggle.addEventListener('change', (e) => {
  const enabled = e.target.checked;
  ipcRenderer.send('toggle-app', enabled);
});

micToggle.addEventListener('change', (e) => {
  const enabled = e.target.checked;
  ipcRenderer.send('toggle-microphone', enabled);
});

saveConfigBtn.addEventListener('click', () => {
  const config = {
    host: asrHost.value.trim(),
    port: parseInt(asrPort.value) || 8080,
    useStreaming: useStreaming.checked
  };
  
  if (!config.host) {
    showError('Host cannot be empty');
    return;
  }
  
  ipcRenderer.send('update-asr-config', config);
  showError(''); // Clear error
});

// IPC Listeners
ipcRenderer.on('app-toggled', (event, enabled) => {
  appToggle.checked = enabled;
  appStatus.textContent = enabled ? 'On' : 'Off';
  appStatus.style.color = enabled ? '#27ae60' : '#666';
  
  // Enable/disable mic toggle
  micToggle.disabled = !enabled;
  if (!enabled) {
    micToggle.checked = false;
    micStatus.textContent = 'Off';
    micStatus.style.color = '#666';
  }
});

ipcRenderer.on('mic-toggled', (event, enabled) => {
  micToggle.checked = enabled;
  micStatus.textContent = enabled ? 'On' : 'Off';
  micStatus.style.color = enabled ? '#27ae60' : '#666';
});

ipcRenderer.on('transcription-update', (event, text) => {
  // Remove placeholder if present
  const placeholder = transcriptionBox.querySelector('.placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Add new transcription
  const p = document.createElement('p');
  p.textContent = text;
  transcriptionBox.appendChild(p);
  
  // Scroll to bottom
  transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
  
  // Limit to last 50 transcriptions
  const paragraphs = transcriptionBox.querySelectorAll('p');
  if (paragraphs.length > 50) {
    paragraphs[0].remove();
  }
});

ipcRenderer.on('asr-error', (event, error) => {
  showError(`ASR Error: ${error}`);
});

ipcRenderer.on('asr-config-updated', (event, config) => {
  showError('Configuration saved successfully!');
  setTimeout(() => showError(''), 2000);
});

ipcRenderer.on('status', (event, status) => {
  appToggle.checked = status.appEnabled;
  micToggle.checked = status.micEnabled;
  micToggle.disabled = !status.appEnabled;
  
  appStatus.textContent = status.appEnabled ? 'On' : 'Off';
  appStatus.style.color = status.appEnabled ? '#27ae60' : '#666';
  
  micStatus.textContent = status.micEnabled ? 'On' : 'Off';
  micStatus.style.color = status.micEnabled ? '#27ae60' : '#666';
  
  // Update config fields
  asrHost.value = status.asrConfig.host || 'localhost';
  asrPort.value = status.asrConfig.port || 8080;
  useStreaming.checked = status.asrConfig.useStreaming !== false;
});

function showError(message) {
  errorText.textContent = message;
  if (message) {
    errorText.style.color = '#e74c3c';
  }
}

// Initialize audio capture (Web Audio API)
audioCapture = new AudioCaptureWeb({
  sampleRate: 16000,
  channels: 1,
  bufferSize: 4096
});

// Set up audio data handler - send to main process via IPC
audioCapture.on('audioData', (audioBuffer) => {
  // Ensure we have a proper Buffer
  // Electron IPC can handle Buffers, but ensure it's a real Buffer instance
  if (!Buffer.isBuffer(audioBuffer)) {
    console.error('[Renderer] Audio data is not a Buffer!', typeof audioBuffer);
    return;
  }
  
  // Log first few bytes for debugging
  if (audioBuffer.length > 0) {
    const preview = Array.from(audioBuffer.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log('[Renderer] Audio buffer:', audioBuffer.length, 'bytes, preview:', preview);
  }
  
  ipcRenderer.send('audio-data', audioBuffer);
});

// Set up error handler
audioCapture.on('error', (error) => {
  console.error('[Renderer] Audio capture error:', error);
  ipcRenderer.send('audio-error', error);
});

// IPC Listeners for audio capture control
ipcRenderer.on('start-audio-capture', () => {
  console.log('[Renderer] Starting audio capture (getUserMedia)...');
  audioCapture.start().catch(err => {
    console.error('[Renderer] Failed to start audio capture:', err);
    ipcRenderer.send('audio-error', err.message);
  });
});

ipcRenderer.on('stop-audio-capture', () => {
  console.log('[Renderer] Stopping audio capture...');
  audioCapture.stop();
});

// Request initial status
ipcRenderer.send('get-status');

