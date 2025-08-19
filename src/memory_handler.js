const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

const historyFilePath = path.join(__dirname, '..', 'data', 'chat_history.json');
const configPath = path.join(__dirname, '..', 'config.json');

// --- User Management ---
async function getAuthorizedUsers() {
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(data);
        return config.authorizedUsers || [];
    } catch (error) {
        logger.error('Failed to read authorized users from config:', error);
        return [];
    }
}

async function addAuthorizedUser(number) {
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        let config = JSON.parse(data);
        if (!config.authorizedUsers.includes(number)) {
            config.authorizedUsers.push(number);
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            logger.info(`New user ${number} added to authorized list.`);
        }
    } catch (error) {
        logger.error('Failed to add authorized user:', error);
    }
}

// --- Chat History Management ---
async function readFullHistory() {
    try {
        await fs.access(historyFilePath);
        const data = await fs.readFile(historyFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        logger.warn('chat_history.json not found. Starting new history object.');
        return {};
    }
}

async function writeFullHistory(fullHistory) {
    try {
        await fs.writeFile(historyFilePath, JSON.stringify(fullHistory, null, 2));
    } catch (error) {
        logger.error('Failed to write to chat history:', error);
    }
}

async function getHistoryForUser(userId) {
    const fullHistory = await readFullHistory();
    return fullHistory[userId] || [];
}

async function appendToHistory(userId, entry) {
    const fullHistory = await readFullHistory();
    if (!fullHistory[userId]) {
        fullHistory[userId] = [];
    }
    fullHistory[userId].push(entry);
    fullHistory[userId] = fullHistory[userId].slice(-50); // Keep history from getting too big
    await writeFullHistory(fullHistory);
}

module.exports = {
    getAuthorizedUsers,
    addAuthorizedUser,
    getHistoryForUser,
    appendToHistory,
    readFullHistory
};