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

// --- Privacy Protection Functions ---
async function isOwnerRequest(requestingUserId, targetUserId) {
    const config = require('../config.json');
    const requestingNumber = requestingUserId.split('@')[0];
    return requestingNumber === config.ownerNumber;
}

async function canAccessUserData(requestingUserId, targetUserId) {
    // Only owner can access other people's data, everyone can access their own
    if (requestingUserId === targetUserId) {
        return true; // Can access own data
    }
    return await isOwnerRequest(requestingUserId, targetUserId);
}

async function getPrivacyFilteredHistory(requestingUserId, targetUserId) {
    const canAccess = await canAccessUserData(requestingUserId, targetUserId);
    
    if (!canAccess) {
        logger.warn(`Privacy violation attempt: ${requestingUserId} tried to access ${targetUserId}'s data`);
        return null;
    }
    
    return await getHistoryForUser(targetUserId);
}

async function getUserCount() {
    const fullHistory = await readFullHistory();
    return Object.keys(fullHistory).length;
}

async function getAnonymizedStats() {
    // Returns stats without revealing personal information
    const fullHistory = await readFullHistory();
    const chatJids = Object.keys(fullHistory);
    const totalUsers = chatJids.length;
    
    let totalMessages = 0;
    let myMessages = 0;
    let userMessages = 0;
    
    chatJids.forEach(jid => {
        const history = fullHistory[jid];
        totalMessages += history.length;
        myMessages += history.filter(msg => msg.role === 'assistant').length;
        userMessages += history.filter(msg => msg.role === 'user').length;
    });
    
module.exports = {
    getAuthorizedUsers,
    addAuthorizedUser,
    getHistoryForUser,
    appendToHistory,
    readFullHistory,
    isOwnerRequest,
    canAccessUserData,
    getPrivacyFilteredHistory,
    getUserCount,
    getAnonymizedStats
};