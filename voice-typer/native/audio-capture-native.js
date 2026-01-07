const EventEmitter = require('events');
const { spawn } = require('child_process');
const os = require('os');

/**
 * Native audio capture using platform-specific tools
 * 
 * Requirements:
 * - macOS: sox (brew install sox) or ffmpeg (brew install ffmpeg)
 * - Windows: ffmpeg (download from https://ffmpeg.org)
 * 
 * For production, consider using:
 * - node-record-lpcm16 (cross-platform, uses sox/arecord/rec)
 * - Or native addons with CoreAudio (macOS) / WASAPI (Windows)
 */
class AudioCaptureNative extends EventEmitter {
  constructor(options = {}) {
    super();
    this.isCapturing = false;
    this.process = null;
    this.platform = process.platform;
    
    // Audio format options
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bitDepth = options.bitDepth || 16;
    this.chunkSize = options.chunkSize || 4096; // bytes
  }

  start() {
    if (this.isCapturing) {
      console.log('[AudioCapture] Already capturing, ignoring start()');
      return;
    }

    console.log('[AudioCapture] ===== STARTING AUDIO CAPTURE =====');
    console.log('[AudioCapture] Platform:', this.platform);
    console.log('[AudioCapture] Sample rate:', this.sampleRate);
    console.log('[AudioCapture] Channels:', this.channels);
    console.log('[AudioCapture] Bit depth:', this.bitDepth);

    this.isCapturing = true;
    this.startCapture();
  }

  stop() {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    this.stopCapture();
  }

  startCapture() {
    if (this.platform === 'darwin') {
      this.startMacCapture();
    } else if (this.platform === 'win32') {
      this.startWindowsCapture();
    } else if (this.platform === 'linux') {
      this.startLinuxCapture();
    } else {
      this.emit('error', 'Unsupported platform');
    }
  }

  startMacCapture() {
    // Prefer ffmpeg (more reliable device selection), fallback to sox
    // ffmpeg allows explicit device selection (:1 for MacBook Pro Microphone)
    console.log('[AudioCapture] Starting macOS capture...');
    console.log('[AudioCapture] Trying ffmpeg first (supports device selection)...');
    if (!this.tryFFmpegMac()) {
      console.log('[AudioCapture] ⚠️  ffmpeg failed, trying sox...');
      console.log('[AudioCapture] ⚠️  WARNING: sox uses default device and may not work correctly!');
      if (!this.trySoxMac()) {
        console.error('[AudioCapture] ✗ Both ffmpeg and sox failed!');
        this.emit('error', 'Failed to start audio capture: both ffmpeg and sox failed');
      }
    }
  }

  trySoxMac() {
    try {
      // sox command for macOS
      // -d: default audio device
      // -t raw: raw audio format
      // -r 16000: sample rate 16kHz
      // -c 1: mono channel
      // -b 16: 16-bit
      // -e signed-integer: signed integer encoding
      const args = [
        '-d',
        '-t', 'raw',
        '-r', this.sampleRate.toString(),
        '-c', this.channels.toString(),
        '-b', this.bitDepth.toString(),
        '-e', 'signed-integer'
      ];

      this.process = spawn('sox', args);
      
      this.process.stdout.on('data', (data) => {
        if (this.isCapturing) {
          console.log('[AudioCapture] Captured audio chunk:', data.length, 'bytes');
          this.emit('audioData', data);
        }
      });

      this.process.stderr.on('data', (data) => {
        // sox outputs info to stderr, ignore unless it's an error
        const str = data.toString();
        if (str.toLowerCase().includes('error')) {
          console.error('sox error:', str);
        }
      });

      this.process.on('error', (error) => {
        if (error.code === 'ENOENT') {
          // sox not found, try ffmpeg
          return false;
        }
        this.emit('error', error);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          // Try ffmpeg if sox fails
          if (!this.tryFFmpegMac()) {
            this.emit('error', `sox exited with code ${code}`);
          }
        }
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  tryFFmpegMac() {
    try {
      // ffmpeg command for macOS using AVFoundation
      // -f avfoundation: use AVFoundation framework
      // -i ":1": MacBook Pro Microphone (device 1)
      //   Use ":0" for default device (Plantronics)
      //   Use ":1" for MacBook Pro Microphone
      // -ar 16000: sample rate
      // -ac 1: mono
      // -f s16le: signed 16-bit little-endian PCM
      const deviceIndex = process.env.AUDIO_DEVICE_INDEX || '1'; // Default to MacBook Pro Microphone
      console.log('[AudioCapture] Using ffmpeg with AVFoundation device:', deviceIndex);
      console.log('[AudioCapture] Device 0 = Plantronics (default)');
      console.log('[AudioCapture] Device 1 = MacBook Pro Microphone');
      
      const args = [
        '-f', 'avfoundation',
        '-i', `:${deviceIndex}`,
        '-ar', this.sampleRate.toString(),
        '-ac', this.channels.toString(),
        '-f', 's16le',
        '-'
      ];

      console.log('[AudioCapture] Spawning ffmpeg with args:', args.join(' '));
      this.process = spawn('ffmpeg', args);
      
      this.process.on('spawn', () => {
        console.log('[AudioCapture] ✓ ffmpeg process spawned successfully');
      });
      
      this.process.stdout.on('data', (data) => {
        if (this.isCapturing) {
          // Check if data is all zeros
          let nonZeroCount = 0;
          const sampleSize = Math.min(data.length, 100);
          for (let i = 0; i < sampleSize; i++) {
            if (data[i] !== 0) nonZeroCount++;
          }
          const nonZeroPercent = sampleSize > 0 ? ((nonZeroCount / sampleSize) * 100).toFixed(1) : '0.0';
          
          console.log('[AudioCapture] Captured audio chunk:', data.length, 'bytes, non-zero:', nonZeroPercent + '%');
          if (parseFloat(nonZeroPercent) < 1) {
            console.log('[AudioCapture] ⚠️  WARNING: Audio data is mostly zeros (silence)!');
            console.log('[AudioCapture] First 20 bytes (hex):', data.slice(0, 20).toString('hex'));
          }
          this.emit('audioData', data);
        }
      });

      this.process.stderr.on('data', (data) => {
        // ffmpeg outputs progress to stderr
        const str = data.toString();
        // Log errors and important messages
        if (str.toLowerCase().includes('error') || str.toLowerCase().includes('permission') || str.toLowerCase().includes('device')) {
          console.error('[AudioCapture] ffmpeg stderr:', str);
        }
      });

      this.process.on('error', (error) => {
        console.error('[AudioCapture] ✗ ffmpeg spawn error:', error.message);
        this.emit('error', `ffmpeg error: ${error.message}`);
      });

      this.process.on('exit', (code, signal) => {
        console.log('[AudioCapture] ffmpeg exited with code:', code, 'signal:', signal);
        if (code !== 0 && code !== null) {
          console.error('[AudioCapture] ✗ ffmpeg exited with error code:', code);
        }
      });

      return true;
    } catch (error) {
      this.emit('error', 'Neither sox nor ffmpeg found. Please install one of them.');
      return false;
    }
  }

  startWindowsCapture() {
    try {
      // ffmpeg command for Windows using dshow (DirectShow)
      // -f dshow: use DirectShow
      // -i audio="<device>": audio input device (use default)
      // -ar 16000: sample rate
      // -ac 1: mono
      // -f s16le: signed 16-bit little-endian PCM
      const args = [
        '-f', 'dshow',
        '-i', 'audio="default"',
        '-ar', this.sampleRate.toString(),
        '-ac', this.channels.toString(),
        '-f', 's16le',
        '-'
      ];

      this.process = spawn('ffmpeg', args);
      
      this.process.stdout.on('data', (data) => {
        if (this.isCapturing) {
          console.log('[AudioCapture] Captured audio chunk:', data.length, 'bytes');
          this.emit('audioData', data);
        }
      });

      this.process.stderr.on('data', (data) => {
        // ffmpeg outputs progress to stderr
      });

      this.process.on('error', (error) => {
        if (error.code === 'ENOENT') {
          this.emit('error', 'ffmpeg not found. Please install ffmpeg from https://ffmpeg.org');
        } else {
          this.emit('error', `ffmpeg error: ${error.message}`);
        }
      });

    } catch (error) {
      this.emit('error', `Failed to start audio capture: ${error.message}`);
    }
  }

  startLinuxCapture() {
    try {
      // Use arecord (ALSA) on Linux
      const args = [
        '-f', 'S16_LE',
        '-r', this.sampleRate.toString(),
        '-c', this.channels.toString(),
        '-'
      ];

      this.process = spawn('arecord', args);
      
      this.process.stdout.on('data', (data) => {
        if (this.isCapturing) {
          console.log('[AudioCapture] Captured audio chunk:', data.length, 'bytes');
          this.emit('audioData', data);
        }
      });

      this.process.stderr.on('data', (data) => {
        // arecord outputs info to stderr
      });

      this.process.on('error', (error) => {
        if (error.code === 'ENOENT') {
          this.emit('error', 'arecord not found. Please install alsa-utils');
        } else {
          this.emit('error', `arecord error: ${error.message}`);
        }
      });

    } catch (error) {
      this.emit('error', `Failed to start audio capture: ${error.message}`);
    }
  }

  stopCapture() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = { AudioCaptureNative };

