const EventEmitter = require('events');
const WebSocket = require('ws');
const net = require('net');

class ASRClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.ws = null;
    this.isConnected = false;
    this.useStreaming = true;
    this.host = 'localhost';
    this.port = 8080;
    this.buffer = Buffer.alloc(0);
    this.transcriptionStarted = false;
  }
  

  connect(host, port, useStreaming = true) {
    this.host = host || this.host;
    this.port = port || this.port;
    this.useStreaming = useStreaming !== false;

    if (this.useStreaming) {
      this.connectWebSocket();
    } else {
      this.connectTCP();
    }
  }

  connectWebSocket() {
    // For now, we'll use TCP socket to connect to MCP server
    // The MCP server uses TCP, not WebSocket
    this.connectTCP();
  }

  connectTCP() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }

    this.socket = new net.Socket();
    this.buffer = Buffer.alloc(0);
    this.transcriptionStarted = false;

    this.socket.on('connect', () => {
      console.log('\n' + '='.repeat(80));
      console.log('[ASRClient] ===== CONNECTION ESTABLISHED =====');
      console.log('[ASRClient] ✓✓✓ CONNECTED TO ASR MCP SERVER ✓✓✓');
      console.log('='.repeat(80) + '\n');
      this.isConnected = true;
      this.emit('connected');
      // Transcription will start automatically when initialized message is received
    });

    this.socket.on('data', (data) => {
      console.log('[ASRClient] Received', data.length, 'bytes from socket');
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });

    this.socket.on('error', (error) => {
      console.error('[ASRClient] ✗✗✗ CONNECTION ERROR ✗✗✗');
      console.error('[ASRClient] Error details:', error);
      console.error('[ASRClient] Error code:', error.code);
      console.error('[ASRClient] Error message:', error.message);
      this.isConnected = false;
      this.emit('error', error.message);
      
      // Attempt to reconnect after a short delay
      if (!this.socket.destroyed) {
        console.log('[ASRClient] Attempting to reconnect in 1 second...');
        setTimeout(() => {
          if (!this.isConnected) {
            console.log('[ASRClient] Reconnecting...');
            this.connectTCP();
          }
        }, 1000);
      }
    });

    this.socket.on('close', () => {
      console.log('[ASRClient] ===== CONNECTION CLOSED =====');
      console.log('[ASRClient] Socket closed, wasConnected:', this.isConnected);
      this.isConnected = false;
      this.transcriptionStarted = false;
      console.log('[ASRClient] Disconnected from ASR MCP server');
      this.emit('disconnected');
    });

    try {
      console.log('[ASRClient] ===== ATTEMPTING CONNECTION =====');
      console.log('[ASRClient] Host:', this.host);
      console.log('[ASRClient] Port:', this.port);
      this.socket.connect(this.port, this.host, () => {
        console.log('[ASRClient] ✓✓✓ CONNECTION CALLBACK FIRED ✓✓✓');
        // Wait for initialized message before starting transcription
      });
      console.log('[ASRClient] connect() called, waiting for events...');
    } catch (error) {
      console.error('[ASRClient] ✗✗✗ EXCEPTION IN CONNECT ✗✗✗');
      console.error('[ASRClient] Exception:', error);
      this.emit('error', `Failed to connect: ${error.message}`);
    }
  }

  processBuffer() {
    // Process newline-delimited JSON messages
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).toString();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim()) {
        console.log('[ASRClient] Raw message received:', line.substring(0, 200));
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('[ASRClient] Failed to parse message:', error.message);
          console.error('[ASRClient] Raw line:', line);
        }
      }
    }
  }

  handleMessage(message) {
    console.log('[ASRClient] handleMessage called with type:', message.type);
    console.log('[ASRClient] Full message:', JSON.stringify(message, null, 2));
    
    if (message.type === 'initialized') {
      console.log('[ASRClient] ✓ MCP server initialized');
      // Start transcription after initialization
      if (!this.transcriptionStarted) {
        console.log('[ASRClient] Sending transcribe request...');
        const sent = this.sendMessage({ method: 'transcribe' });
        console.log('[ASRClient] Transcribe request sent:', sent ? 'success' : 'failed');
      } else {
        console.log('[ASRClient] Transcription already started, skipping');
      }
    } else if (message.type === 'transcription') {
      // Extract text from transcription
      console.log('\n' + '='.repeat(80));
      console.log('[ASRClient] ===== TEXT RETURNED - RECEIVED FROM SERVER =====');
      console.log('[ASRClient] ===== TRANSCRIPTION MESSAGE =====');
      console.log('='.repeat(80) + '\n');
      console.log('[ASRClient] Full message:', JSON.stringify(message, null, 2));
      
      if (message.text) {
        console.log('\n' + '='.repeat(80));
        console.log('[ASRClient] ✓✓✓ EXTRACTED TEXT: "' + message.text + '" ✓✓✓');
        console.log('[ASRClient] ✓✓✓ EMITTING TRANSCRIPTION EVENT ✓✓✓');
        console.log('='.repeat(80) + '\n');
        this.emit('transcription', message.text);
      } else {
        console.log('[ASRClient] ⚠️  Transcription message missing text field');
        console.log('[ASRClient] Message keys:', Object.keys(message));
        // Try to find text in other fields
        if (message.data) {
          console.log('[ASRClient] Found data field, trying that...');
          this.emit('transcription', message.data);
        }
      }
    } else if (message.type === 'error') {
      this.emit('error', message.message || 'Unknown error');
    } else if (message.type === 'transcription_started') {
      console.log('[ASRClient] ✓✓✓ TRANSCRIPTION STARTED ✓✓✓');
      this.transcriptionStarted = true;
      console.log('[ASRClient] transcriptionStarted flag set to:', this.transcriptionStarted);
    } else if (message.type === 'transcription_stopped') {
      console.log('Transcription stopped');
      this.transcriptionStarted = false;
    } else if (message.type === 'audio_sent') {
      // Acknowledgment that audio was received
      // No action needed
    } else {
      console.log('[ASRClient] Received other message type:', message.type);
      console.log('[ASRClient] Message:', JSON.stringify(message, null, 2));
    }
  }

  sendMessage(message) {
    if (!this.socket || !this.isConnected) {
      return false;
    }

    try {
      const json = JSON.stringify(message) + '\n';
      this.socket.write(json);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  sendAudio(audioBuffer) {
    console.log('[ASRClient] sendAudio called');
    console.log('[ASRClient] isConnected:', this.isConnected);
    console.log('[ASRClient] transcriptionStarted:', this.transcriptionStarted);
    console.log('[ASRClient] socket exists:', !!this.socket);
    console.log('[ASRClient] socket destroyed:', this.socket ? this.socket.destroyed : 'N/A');
    
    if (!this.isConnected) {
      console.log('[ASRClient] ⚠️  ⚠️  ⚠️  NOT CONNECTED - CANNOT SEND AUDIO ⚠️  ⚠️  ⚠️');
      console.log('[ASRClient] Attempting to reconnect...');
      // Try to reconnect
      if (this.socket && this.socket.destroyed) {
        console.log('[ASRClient] Socket is destroyed, creating new connection...');
        this.connectTCP();
      }
      return false;
    }
    
    // WORKAROUND: Allow sending audio even if transcription_started wasn't received
    // This is a temporary fix - the server should handle it
    if (!this.transcriptionStarted) {
      console.log('[ASRClient] ⚠️  Transcription not started, but allowing audio send (workaround)');
      // Auto-start transcription if not started
      if (!this.transcriptionStarted) {
        console.log('[ASRClient] Auto-starting transcription now');
        this.sendMessage({ method: 'transcribe' });
        // Set flag optimistically - server should confirm
        this.transcriptionStarted = true;
      }
    }

    // Send audio data to MCP server
    // The MCP server expects base64-encoded audio in JSON format
    if (this.socket && !this.socket.destroyed) {
      try {
        // Ensure we have a Buffer
        let buffer = audioBuffer;
        if (!Buffer.isBuffer(audioBuffer)) {
          if (audioBuffer instanceof Uint8Array) {
            buffer = Buffer.from(audioBuffer);
          } else {
            console.error('[ASRClient] Invalid audio buffer type:', typeof audioBuffer);
            return false;
          }
        }
        
        // Convert audio buffer to base64
        const base64Audio = buffer.toString('base64');
        console.log('[ASRClient] Converted audio to base64:', base64Audio.length, 'chars');
        console.log('[ASRClient] Original buffer size:', buffer.length, 'bytes');
        console.log('[ASRClient] Base64 preview (first 50 chars):', base64Audio.substring(0, 50));
        
        // Verify base64 doesn't contain quotes (which would break JSON parsing)
        if (base64Audio.includes('"')) {
          console.error('[ASRClient] ✗ Base64 contains quote character! This will break JSON parsing!');
          return false;
        }
        
        // Send JSON message with base64-encoded audio data
        const message = JSON.stringify({
          method: 'stream_audio',
          data: base64Audio
        }) + '\n';
        
        console.log('[ASRClient] Sending audio message (', message.length, 'bytes)');
        console.log('[ASRClient] JSON message preview (first 100 chars):', message.substring(0, 100));
        this.socket.write(message);
        console.log('[ASRClient] ✓ Audio sent successfully');
        return true;
      } catch (error) {
        console.error('[ASRClient] ✗ Failed to send audio:', error);
        return false;
      }
    }
    
    console.log('[ASRClient] ⚠️  Socket not available');
    return false;
  }

  disconnect() {
    if (this.socket && !this.socket.destroyed) {
      // Send finalize message (non-blocking)
      this.sendMessage({
        method: 'finalize_transcription'
      });
      
      // Destroy immediately - no timeout
      this.socket.destroy();
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }
}

module.exports = { ASRClient };

