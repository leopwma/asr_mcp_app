// Use the native implementation
const { AudioCaptureNative } = require('./audio-capture-native');

// Export as AudioCapture for compatibility
class AudioCapture extends AudioCaptureNative {
  constructor() {
    super({
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      chunkSize: 4096
    });
  }
}

module.exports = { AudioCapture };

