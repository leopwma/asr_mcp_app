#!/usr/bin/env node

/**
 * Test text insertion functionality
 */

const { TextInserter } = require('./native/text-inserter');

console.log('Testing text insertion...\n');

const inserter = new TextInserter();

console.log('Test 1: Inserting test text...');
console.log('Make sure you have a text field focused (like Notes, TextEdit, etc.)');
console.log('Text will be inserted in 3 seconds...\n');

setTimeout(() => {
    console.log('Inserting: "Hello from Voice Typer test"');
    inserter.insertText('Hello from Voice Typer test');
    
    setTimeout(() => {
        console.log('\nDid the text appear?');
        console.log('If not, check:');
        console.log('1. Text field is focused');
        console.log('2. App has accessibility permissions (macOS)');
        console.log('3. No errors in console');
        process.exit(0);
    }, 2000);
}, 3000);

