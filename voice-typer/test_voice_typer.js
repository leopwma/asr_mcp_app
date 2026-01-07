#!/usr/bin/env node

/**
 * Test script to verify voice-typer client connection and audio sending
 */

const { ASRClient } = require('./asr-client');
const net = require('net');

console.log('=== Voice Typer Client Test ===\n');

// Test 1: Check MCP server is running
console.log('Test 1: Checking MCP server connection...');
const testServer = new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
        console.log('✓ MCP server is running on port 8080\n');
        socket.destroy();
        resolve(true);
    });
    
    socket.on('error', (err) => {
        console.log('✗ MCP server not running:', err.message);
        console.log('  → Start it with: ./asr_mcp_stream_tcp\n');
        resolve(false);
    });
    
    socket.on('timeout', () => {
        console.log('✗ Connection timeout\n');
        socket.destroy();
        resolve(false);
    });
    
    socket.connect(8080, 'localhost');
});

// Test 2: Test ASRClient connection
const testClient = new Promise((resolve) => {
    setTimeout(() => {
        console.log('Test 2: Testing ASRClient connection...');
        const client = new ASRClient();
        let connected = false;
        let initialized = false;
        
        client.on('connected', () => {
            connected = true;
            console.log('  ✓ Client connected');
        });
        
        client.on('error', (error) => {
            console.log('  ✗ Client error:', error);
            resolve(false);
        });
        
        client.connect('localhost', 8080);
        
        setTimeout(() => {
            if (connected) {
                console.log('  ✓ Connection successful\n');
                client.disconnect();
                resolve(true);
            } else {
                console.log('  ✗ Connection failed\n');
                resolve(false);
            }
        }, 2000);
    }, 500);
});

// Test 3: Test audio sending format
const testAudioFormat = new Promise((resolve) => {
    setTimeout(() => {
        console.log('Test 3: Testing audio format...');
        const testBuffer = Buffer.alloc(1024, 0x7F); // Test audio data
        
        // Check if it's being base64 encoded
        const client = new ASRClient();
        const originalSend = client.sendAudio.bind(client);
        let audioSent = false;
        let formatCorrect = false;
        
        // Mock the socket to capture what's sent
        client.socket = {
            destroyed: false,
            write: function(data) {
                audioSent = true;
                const str = data.toString();
                console.log(`  Sent ${data.length} bytes`);
                
                // Check if it's JSON with base64
                if (str.startsWith('{') && str.includes('"method":"stream_audio"')) {
                    if (str.includes('"data":')) {
                        console.log('  ✓ Audio sent as base64-encoded JSON');
                        formatCorrect = true;
                    } else {
                        console.log('  ✗ Audio format incorrect (missing data field)');
                    }
                } else {
                    console.log('  ✗ Audio format incorrect (not JSON)');
                }
            }
        };
        
        client.isConnected = true;
        client.transcriptionStarted = true;
        
        client.sendAudio(testBuffer);
        
        setTimeout(() => {
            if (audioSent && formatCorrect) {
                console.log('  ✓ Audio format is correct\n');
                resolve(true);
            } else {
                console.log('  ✗ Audio format issue\n');
                resolve(false);
            }
        }, 500);
    }, 1000);
});

// Run all tests
Promise.all([testServer, testClient, testAudioFormat]).then((results) => {
    console.log('=== Test Summary ===');
    console.log(`MCP server: ${results[0] ? '✓' : '✗'}`);
    console.log(`Client connection: ${results[1] ? '✓' : '✗'}`);
    console.log(`Audio format: ${results[2] ? '✓' : '✗'}`);
    console.log('');
    
    if (results.every(r => r)) {
        console.log('✓ All voice-typer tests passed!');
    } else {
        console.log('✗ Some tests failed.');
        console.log('');
        console.log('Common issues:');
        if (!results[0]) {
            console.log('- MCP server not running');
        }
        if (!results[1]) {
            console.log('- Client connection issue');
        }
        if (!results[2]) {
            console.log('- Audio format mismatch (check asr-client.js sendAudio method)');
        }
    }
    
    process.exit(results.every(r => r) ? 0 : 1);
});

