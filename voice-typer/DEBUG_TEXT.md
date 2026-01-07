# Debugging Text Insertion

## Quick Test

Test if text insertion works at all:
```bash
cd voice-typer
node test_text_insertion.js
```

This will try to insert "Hello from Voice Typer test" after 3 seconds.
**Make sure you have a text field focused** (like Notes, TextEdit, etc.)

## Common Issues

### 1. No Text Appearing

**macOS:**
- Check Accessibility permissions:
  - System Preferences → Security & Privacy → Privacy → Accessibility
  - Make sure "Voice Typer" or "Electron" is checked
  - If not listed, add it manually

**Windows:**
- Run the app as Administrator
- Check UAC settings

### 2. Check if Transcriptions are Being Received

The app now has enhanced logging. Check the console output when running:
```bash
npm start
```

Look for:
- `[ASRClient] Received transcription: ...`
- `[Main] Received transcription: ...`
- `[TextInserter] Attempting to insert text: ...`

### 3. Test Each Component

**Test 1: Text Insertion**
```bash
node test_text_insertion.js
```

**Test 2: ASR Connection**
```bash
node test_voice_typer.js
```

**Test 3: Full Flow**
1. Start bridge: `node ws_bridge.js`
2. Start MCP server: `./asr_mcp_stream_tcp`
3. Start voice-typer: `npm start`
4. Enable app and microphone
5. Speak and watch console logs

### 4. Check Console Logs

When running the app, you should see:
```
[ASRClient] Received transcription: <text>
[Main] Received transcription: <text>
[Main] Calling textInserter.insertText with: <text>
[TextInserter] Attempting to insert text: "<text>"
[TextInserter] ✓ Successfully inserted text
```

If any step is missing, that's where the problem is.

### 5. Manual Text Insertion Test

Open Terminal and test AppleScript directly:
```bash
osascript -e 'tell application "System Events" to keystroke "test"'
```

If this doesn't work, you need to grant Terminal accessibility permissions first.

## Debugging Steps

1. **Check if transcriptions are received:**
   - Look for `[ASRClient] Received transcription` in logs
   - Check the UI - does it show transcriptions in the app window?

2. **Check if text inserter is called:**
   - Look for `[TextInserter] Attempting to insert text` in logs

3. **Check permissions:**
   - macOS: System Preferences → Security & Privacy → Accessibility
   - Make sure the app is listed and enabled

4. **Test with simple text:**
   - Use `test_text_insertion.js` to test insertion independently

5. **Check for errors:**
   - Look for error messages in console
   - Check if AppleScript is failing

