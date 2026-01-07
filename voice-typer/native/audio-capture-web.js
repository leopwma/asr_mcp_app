const EventEmitter = require('events');

/**
 * Audio capture using Web Audio API (getUserMedia)
 * This is the standard, direct way to access the microphone in Electron/web apps.
 * No external tools (ffmpeg/sox) required!
 * 
 * Works in renderer process (browser context) where getUserMedia is available.
 */
class AudioCaptureWeb extends EventEmitter {
  constructor(options = {}) {
    super();
    this.isCapturing = false;
    this.mediaStream = null;
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.scriptProcessor = null;
    
    // Audio format options
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bufferSize = options.bufferSize || 4096; // samples, not bytes
  }

  async start() {
    if (this.isCapturing) {
      console.log('[AudioCaptureWeb] Already capturing, ignoring start()');
      return;
    }

    console.log('[AudioCaptureWeb] ===== STARTING AUDIO CAPTURE (Web Audio API) =====');
    console.log('[AudioCaptureWeb] Sample rate:', this.sampleRate);
    console.log('[AudioCaptureWeb] Channels:', this.channels);

    try {
      // Request microphone access (uses system default device)
      console.log('[AudioCaptureWeb] Requesting microphone access...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: this.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('[AudioCaptureWeb] ✓ Microphone access granted');
      console.log('[AudioCaptureWeb] Audio tracks:', this.mediaStream.getAudioTracks().map(t => ({
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        settings: t.getSettings()
      })));

      // Create AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      console.log('[AudioCaptureWeb] AudioContext created, sample rate:', this.audioContext.sampleRate);

      // Create MediaStreamAudioSourceNode
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create ScriptProcessorNode for processing audio data
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // For newer browsers, we could use AudioWorklet, but this is simpler
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.bufferSize,
        this.channels,
        this.channels
      );

      // Process audio data
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isCapturing) return;

        // Get audio data from input buffer
        const inputBuffer = event.inputBuffer;
        const channelData = inputBuffer.getChannelData(0); // Mono channel

        // Convert Float32Array to Int16Array (PCM 16-bit, little-endian)
        const int16Buffer = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          // Clamp to [-1, 1] and convert to 16-bit integer (little-endian)
          const s = Math.max(-1, Math.min(1, channelData[i]));
          int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to Buffer (Node.js Buffer)
        // Use Uint8Array view to ensure proper byte order (little-endian)
        const uint8View = new Uint8Array(int16Buffer.buffer);
        const audioBuffer = Buffer.from(uint8View);

        // Check if data is all zeros
        let nonZeroCount = 0;
        const sampleSize = Math.min(audioBuffer.length, 100);
        for (let i = 0; i < sampleSize; i++) {
          if (audioBuffer[i] !== 0) nonZeroCount++;
        }
        const nonZeroPercent = sampleSize > 0 ? ((nonZeroCount / sampleSize) * 100).toFixed(1) : '0.0';

        if (parseFloat(nonZeroPercent) < 1) {
          console.log('[AudioCaptureWeb] ⚠️  WARNING: Audio data is mostly zeros (silence)!');
        }

        // Emit audio data
        this.emit('audioData', audioBuffer);
      };

      // Connect the nodes
      this.mediaStreamSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination); // Required for ScriptProcessorNode

      this.isCapturing = true;
      console.log('[AudioCaptureWeb] ✓ Audio capture started successfully');

    } catch (error) {
      console.error('[AudioCaptureWeb] ✗ Failed to start audio capture:', error);
      this.emit('error', `Microphone access denied or failed: ${error.message}`);
      
      // Clean up on error
      this.stop();
    }
  }

  stop() {
    if (!this.isCapturing) {
      return;
    }

    console.log('[AudioCaptureWeb] Stopping audio capture...');

    this.isCapturing = false;

    // Disconnect and clean up
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.audioContext) {
      this.audioContext.close().then(() => {
        console.log('[AudioCaptureWeb] AudioContext closed');
      }).catch(err => {
        console.error('[AudioCaptureWeb] Error closing AudioContext:', err);
      });
      this.audioContext = null;
    }

    if (this.mediaStream) {
      // Stop all tracks
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log('[AudioCaptureWeb] Stopped track:', track.label);
      });
      this.mediaStream = null;
    }

    console.log('[AudioCaptureWeb] ✓ Audio capture stopped');
  }
}

module.exports = { AudioCaptureWeb };

