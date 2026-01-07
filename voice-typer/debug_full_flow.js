#!/usr/bin/env node

/**
 * Full flow debugging script
 * Tests the complete chain: MCP → Transcription → Text Insertion
 */

const { ASRClient } = require('./asr-client');
const { TextInserter } = require('./native/text-inserter');
const net = require('net');

console.log('=== Full Flow Debugging ===\n');

let step = 0;

function logStep(message) {
    step++;
    console.log(`[Step ${step}] ${message}`);
}

// Test 1: Check MCP server
logStep('Checking MCP server connection...');
const checkServer = new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
        console.log('  ✓ MCP server is running\n');
        socket.destroy();
        resolve(true);
    });
    socket.on('error', () => {
        console.log('  ✗ MCP server not running\n');
        resolve(false);
    });
    socket.connect(8080, 'localhost');
});

// Test 2: Test ASR client
const testClient = new Promise((resolve) => {
    setTimeout(() => {
        logStep('Testing ASR client connection...');
        const client = new ASRClient();
        let receivedTranscription = false;
        
        client.on('connected', () => {
            console.log('  ✓ Client connected to MCP server');
        });
        
        client.on('transcription', (text) => {
            console.log(`  ✓ Received transcription: "${text}"`);
            receivedTranscription = true;
        });
        
        client.on('error', (error) => {
            console.log(`  ✗ Client error: ${error}`);
        });
        
        client.connect('localhost', 8080);
        
        setTimeout(() => {
            if (receivedTranscription) {
                console.log('  ✓ Transcription flow working\n');
            } else {
                console.log('  ⚠ No transcription received yet (this is normal if no audio is being sent)\n');
            }
            client.disconnect();
            resolve(true);
        }, 3000);
    }, 500);
});

// Test 3: Test text insertion
const testInsertion = new Promise((resolve) => {
    setTimeout(() => {
        logStep('Testing text insertion...');
        console.log('  Make sure a text field is focused (Notes, TextEdit, etc.)');
        console.log('  Inserting test text in 2 seconds...\n');
        
        setTimeout(() => {
            const inserter = new TextInserter();
            console.log('  Attempting to insert: "TEST FROM DEBUG SCRIPT"');
            inserter.insertText('TEST FROM DEBUG SCRIPT');
            
            setTimeout(() => {
                console.log('\n  Did the text appear?');
                console.log('  If not, check accessibility permissions\n');
                resolve(true);
            }, 2000);
        }, 2000);
    }, 2000);
});

// Test 4: Simulate full flow
const testFullFlow = new Promise((resolve) => {
    setTimeout(() => {
        logStep('Simulating full transcription flow...');
        const client = new ASRClient();
        const inserter = new TextInserter();
        
        client.on('transcription', (text) => {
            console.log(`  Simulated transcription received: "${text}"`);
            console.log('  Calling textInserter.insertText...');
            inserter.insertText(text);
        });
        
        // Simulate receiving a transcription
        setTimeout(() => {
            console.log('  Emitting test transcription event...');
            client.emit('transcription', 'This is a test transcription');
            
            setTimeout(() => {
                console.log('  ✓ Full flow test complete\n');
                client.disconnect();
                resolve(true);
            }, 2000);
        }, 500);
    }, 4000);
});

Promise.all([checkServer, testClient, testInsertion, testFullFlow]).then(() => {
    console.log('=== Debug Summary ===\n');
    console.log('Check the logs above to see where the issue is:');
    console.log('1. MCP server connection');
    console.log('2. ASR client receiving transcriptions');
    console.log('3. Text insertion working');
    console.log('4. Full flow end-to-end');
    console.log('\nIf text insertion fails, check:');
    console.log('- System Preferences → Security & Privacy → Accessibility');
    console.log('- Make sure the app (Electron/Voice Typer) is enabled');
    console.log('- Try the manual test: osascript -e \'tell application "System Events" to keystroke "test"\'');
    process.exit(0);
});

