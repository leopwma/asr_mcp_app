# Fixing macOS Accessibility Permissions

## The Error

```
osascript is not allowed to send keystrokes. (1002)
```

This means the application doesn't have permission to control your computer.

## Solution

### For Testing (Terminal/Node.js)

1. Open **System Preferences** (or **System Settings** on macOS Ventura+)
2. Go to **Security & Privacy** → **Privacy** → **Accessibility**
3. Click the **lock icon** and enter your password
4. **Check the box** next to **Terminal** (or add it if not listed)
5. If using iTerm2 or another terminal, add that instead

### For the Voice Typer App

When running the Electron app (`npm start`), you need to grant permissions to:

1. **Electron** (the framework running the app)
   - Look for "Electron" in the Accessibility list
   - Check the box to enable it

2. **Voice Typer** (if you build the app)
   - After building, the app will ask for permissions
   - Or manually add it in System Preferences

### Steps (macOS Ventura/Sonoma)

1. Open **System Settings**
2. Go to **Privacy & Security** → **Accessibility**
3. Toggle on the app you need:
   - **Terminal** (for testing)
   - **Electron** (for development)
   - **Voice Typer** (for production app)

### Steps (macOS Monterey and earlier)

1. Open **System Preferences**
2. Click **Security & Privacy**
3. Click the **Privacy** tab
4. Select **Accessibility** from the left sidebar
5. Click the **lock icon** to make changes
6. Check the box next to the app

## Verify It Works

After granting permissions, test again:

```bash
cd voice-typer
node test_text_insertion.js
```

You should see:
```
[TextInserter] ✓ Successfully inserted text
```

And the text should appear in your focused text field.

## Alternative: Use a Different Method

If AppleScript continues to have issues, we can switch to:
- **CGEvent** (requires native module)
- **robotjs** library (cross-platform, easier)

But AppleScript should work once permissions are granted.

