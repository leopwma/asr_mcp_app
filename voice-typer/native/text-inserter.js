const { exec } = require('child_process');
const os = require('os');

// This is a placeholder implementation
// For production, you'll need native modules using:
// - macOS: AppleScript or CGEvent via node-addon-api
// - Windows: SendInput API via node-addon-api or robotjs

class TextInserter {
  constructor() {
    this.platform = process.platform;
  }

  insertText(text) {
    if (!text || !text.trim()) {
      return;
    }

    if (this.platform === 'darwin') {
      this.insertTextMac(text);
    } else if (this.platform === 'win32') {
      this.insertTextWindows(text);
    } else {
      console.error('Unsupported platform for text insertion');
    }
  }

  insertTextMac(text) {
    if (!text || !text.trim()) {
      console.log('[TextInserter] Empty text, skipping');
      return;
    }
    
    console.log(`[TextInserter] Attempting to insert text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Use AppleScript to type text at cursor position
    // Escape special characters for AppleScript
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    // Split into chunks to avoid AppleScript command length limits
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < escaped.length; i += chunkSize) {
      chunks.push(escaped.substring(i, i + chunkSize));
    }

    console.log(`[TextInserter] Sending ${chunks.length} chunk(s)`);

    // Send chunks sequentially
    let delay = 0;
    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        const script = `tell application "System Events" to keystroke "${chunk}"`;
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
          if (error) {
            console.error(`[TextInserter] Error inserting chunk ${index + 1}:`, error.message);
            if (stderr) {
              console.error('[TextInserter] stderr:', stderr);
              // Check for permission error
              if (stderr.includes('not allowed to send keystrokes') || stderr.includes('1002')) {
                console.error('[TextInserter] ⚠️  PERMISSION ERROR:');
                console.error('[TextInserter]    macOS requires accessibility permissions.');
                console.error('[TextInserter]    Go to: System Preferences → Security & Privacy → Privacy → Accessibility');
                console.error('[TextInserter]    Enable: Terminal (for testing) or Electron/Voice Typer (for app)');
              }
            }
          } else {
            if (index === 0) {
              console.log(`[TextInserter] ✓ Successfully inserted text`);
            }
          }
        });
      }, delay);
      delay += 10; // Small delay between chunks
    });
  }

  insertTextWindows(text) {
    // Use PowerShell to send keystrokes
    // Escape special characters for PowerShell
    const escaped = text
      .replace(/`/g, '``')
      .replace(/\$/g, '`$')
      .replace(/"/g, '`"')
      .replace(/'/g, "''");
    
    // Split into chunks to avoid command length limits
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < escaped.length; i += chunkSize) {
      chunks.push(escaped.substring(i, i + chunkSize));
    }

    // Send chunks sequentially
    let delay = 0;
    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        // Use Windows SendKeys via PowerShell
        const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${chunk}')`;
        exec(`powershell -Command "${script}"`, (error) => {
          if (error && index === 0) {
            console.error('Failed to insert text on Windows:', error);
          }
        });
      }, delay);
      delay += 10; // Small delay between chunks
    });
  }
}

module.exports = { TextInserter };

