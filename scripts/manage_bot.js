#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const sessionPath = path.join(__dirname, '..', 'data', 'session');

function clearSession() {
    console.log('🧹 Clearing WhatsApp session...');
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✅ Session cleared! You will need to scan QR code again.');
    } else {
        console.log('ℹ️  No session found to clear.');
    }
}

function killExistingProcess() {
    console.log('🔄 Stopping any existing bot processes...');
    return new Promise((resolve) => {
        exec('pkill -f "node src/main.js"', (error) => {
            if (error) {
                console.log('ℹ️  No existing processes found.');
            } else {
                console.log('✅ Existing processes stopped.');
            }
            resolve();
        });
    });
}

async function restartBot() {
    console.log('🚀 Restarting Miami Bot...');
    await killExistingProcess();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the bot
    const { spawn } = require('child_process');
    const botProcess = spawn('node', ['src/main.js'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
    });
    
    console.log('✅ Miami Bot restarted with PID:', botProcess.pid);
}

function showHelp() {
    console.log(`
🤖 Miami Bot Management Tool

Commands:
  clear-session    Clear WhatsApp session (requires QR scan)
  restart         Stop and restart the bot
  kill           Stop the bot
  help           Show this help message

Usage:
  node scripts/manage_bot.js <command>
  
Examples:
  node scripts/manage_bot.js clear-session
  node scripts/manage_bot.js restart
    `);
}

// Main execution
const command = process.argv[2];

switch (command) {
    case 'clear-session':
        clearSession();
        break;
    case 'restart':
        restartBot();
        break;
    case 'kill':
        killExistingProcess();
        break;
    case 'help':
    default:
        showHelp();
        break;
}