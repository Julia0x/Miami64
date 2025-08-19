const logger = require('./logger');
const { addAuthorizedUser, readFullHistory } = require('./memory_handler');
const config = require('../config.json');

let sockInstance = null;
let lastSentMessageKey = null; // Memory for the last message key

const setSocket = (sock) => {
    sockInstance = sock;
    logger.info('Socket instance set for tool handler.');
};

// New function to receive the key from baileys_handler
const setLastMessageKey = (key) => {
    lastSentMessageKey = key;
};

function formatPhoneNumber(number) { if (!number || typeof number !== 'string') return null; let cleaned = number.replace(/\D/g, ''); if (cleaned.startsWith('07')) return '94' + cleaned.substring(1); if (cleaned.startsWith('7') && cleaned.length === 9) return '94' + cleaned; if (cleaned.startsWith('94') && cleaned.length === 11) return cleaned; return null; }

async function sendWhatsAppMessage({ number, message }) { 
    if (!number || !message) { 
        const missingInfo = !number ? "phone number" : "message content";
        const errorMsg = `Oops! 😅 I need both a phone number and the message content to send it. Could you give me the ${missingInfo}? I'm excited to help! 💌`; 
        logger.error(`Tool Error: Missing ${missingInfo}`); 
        return JSON.stringify({ status: "Error", reason: errorMsg }); 
    } 
    
    const formattedNumber = formatPhoneNumber(number); 
    if (!formattedNumber) { 
        const errorMsg = `Hmm, the phone number '${number}' doesn't look quite right to me 🤔 Could you double-check the format? I want to make sure your message gets delivered! 📱`; 
        logger.error(errorMsg); 
        return JSON.stringify({ status: "Error", reason: errorMsg }); 
    } 
    
    if (!sockInstance) { 
        const errorMsg = "Oh no! 😰 My WhatsApp connection is down right now. Give me a moment to reconnect! 🔄"; 
        logger.error(errorMsg); 
        return JSON.stringify({ status: "Error", reason: errorMsg }); 
    } 
    
    try { 
        const jid = `${formattedNumber}@s.whatsapp.net`; 
        await sockInstance.sendMessage(jid, { text: message }); 
        logger.info(`SUCCESS: Message sent to ${formattedNumber}`); 
        await addAuthorizedUser(formattedNumber); 
        return JSON.stringify({ status: "Success", detail: `Yay! 🎉 Message sent successfully to ${formattedNumber}! They're going to love hearing from you! 💕` }); 
    } catch (error) { 
        const errorMsg = `Aw man! 😔 Something went wrong when I tried to send the message. The number might not be on WhatsApp, or there might be a connection issue. Error: ${error.message}`; 
        logger.error(errorMsg); 
        return JSON.stringify({ status: "Error", reason: errorMsg }); 
    } 
}
async function getConversationSummary({ number }) { 
    const formattedNumber = formatPhoneNumber(number); 
    if (!formattedNumber) { 
        return JSON.stringify({ isFinal: true, content: `Hmm, the number '${number}' doesn't look quite right 🤔 Could you check the format? I want to make sure I'm looking up the right person! 📞` }); 
    } 
    
    const fullHistory = await readFullHistory(); 
    const userJid = `${formattedNumber}@s.whatsapp.net`; 
    
    if (!fullHistory[userJid] || fullHistory[userJid].length === 0) { 
        return JSON.stringify({ isFinal: true, content: `Oh! 😮 I haven't had any conversations with ${formattedNumber} yet. Want me to send them a message to start one? I'd love to help you connect! 💬✨` }); 
    } 
    
    const conversationText = fullHistory[userJid].map(msg => `${msg.role === 'user' ? 'They said' : 'I said'}: ${msg.content}`).join('\n'); 
    const summaryPrompt = `Please provide a warm, friendly summary of my conversation with ${formattedNumber}. Make it personal and engaging:\n\n${conversationText}`; 
    
    return JSON.stringify({ needsSummarization: true, prompt: summaryPrompt }); 
}
async function listActiveChats() { const fullHistory = await readFullHistory(); const chatJids = Object.keys(fullHistory); if (chatJids.length <= 1) { return JSON.stringify({ content: "මම දැනට ඔයා එක්ක විතරයි මචං කතා කරන්නේ.", isFinal: true }); } const numbers = chatJids.map(jid => jid.split('@')[0]).filter(num => num !== config.ownerNumber); const responseText = `ඔයා ඇරුනම මම දැනට කතා කරමින් ඉන්න අය:\n- ${numbers.join('\n- ')}`; return JSON.stringify({ content: responseText, isFinal: true }); }

// New Advanced Tools
async function sendToMultiple({ numbers, message }) {
    if (!numbers || !message) {
        return JSON.stringify({ status: "Error", reason: "Tool Error: I need both numbers list and message content." });
    }
    
    if (!sockInstance) {
        return JSON.stringify({ status: "Error", reason: "Tool Error: WhatsApp connection is down." });
    }
    
    const numbersList = Array.isArray(numbers) ? numbers : numbers.split(',').map(n => n.trim());
    const results = [];
    let successCount = 0;
    
    for (const number of numbersList) {
        const formattedNumber = formatPhoneNumber(number);
        if (!formattedNumber) {
            results.push(`❌ ${number}: Invalid format`);
            continue;
        }
        
        try {
            const jid = `${formattedNumber}@s.whatsapp.net`;
            await sockInstance.sendMessage(jid, { text: message });
            await addAuthorizedUser(formattedNumber);
            results.push(`✅ ${formattedNumber}: Sent`);
            successCount++;
            
            // Small delay between messages to avoid spam detection
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            results.push(`❌ ${formattedNumber}: Failed - ${error.message}`);
        }
    }
    
    const summary = `හරි මචං! ${successCount}/${numbersList.length} messages sent successfully:\n${results.join('\n')}`;
    logger.info(`Bulk message sent: ${successCount}/${numbersList.length} successful`);
    return JSON.stringify({ status: "Success", detail: summary });
}

async function formatMessage({ message, style }) {
    if (!message) {
        return JSON.stringify({ status: "Error", reason: "Tool Error: Message content is required." });
    }
    
    let formattedMessage = message;
    
    switch (style?.toLowerCase()) {
        case 'bold':
            formattedMessage = `*${message}*`;
            break;
        case 'italic':
            formattedMessage = `_${message}_`;
            break;
        case 'code':
            formattedMessage = `\`\`\`${message}\`\`\``;
            break;
        case 'strikethrough':
            formattedMessage = `~${message}~`;
            break;
        case 'fancy':
            formattedMessage = `✨ ${message} ✨`;
            break;
        case 'important':
            formattedMessage = `🚨 *${message}* 🚨`;
            break;
        case 'celebration':
            formattedMessage = `🎉🎊 ${message} 🎊🎉`;
            break;
        default:
            formattedMessage = `📝 ${message}`;
    }
    
    return JSON.stringify({ 
        status: "Success", 
        detail: `Formatted message ready: ${formattedMessage}`,
        formattedText: formattedMessage
    });
}

async function getMessageStats() {
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
    
    const stats = `📊 *Miami Bot Statistics:*
👥 Total Users: ${totalUsers}
💬 Total Messages: ${totalMessages}
🤖 My Messages: ${myMessages}
👤 User Messages: ${userMessages}
📈 Average per user: ${Math.round(totalMessages/totalUsers)} messages`;
    
    return JSON.stringify({ content: stats, isFinal: true });
}

// New Tool Implementation
async function deleteLastMessage() {
    if (!lastSentMessageKey) {
        const errorMsg = "Tool Error: There's no recent message sent by me to delete.";
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
    if (!sockInstance) {
        const errorMsg = "Tool Error: My connection to WhatsApp is down.";
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
    try {
        await sockInstance.sendMessage(lastSentMessageKey.remoteJid, { delete: lastSentMessageKey });
        logger.info(`SUCCESS: Deleted message with key: ${lastSentMessageKey.id}`);
        const successMsg = "Successfully deleted my last message.";
        lastSentMessageKey = null; // Clear the key after deleting
        return JSON.stringify({ status: "Success", detail: successMsg });
    } catch (error) {
        const errorMsg = `Tool Error: I failed to delete the message. Error: ${error.message}`;
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
}

const tools = { functionDeclarations: [ { name: 'sendWhatsAppMessage', description: "Owner-only. Sends a WhatsApp message to a new number and authorizes them. Requires both a valid phone number and the exact message content.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' }, message: { type: 'STRING' } }, required: ['number', 'message'] }, }, { name: 'getConversationSummary', description: "Owner-only. Gets a summary of my conversation with a specific person.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' } }, required: ['number'] }, }, { name: 'listActiveChats', description: "Owner-only. Lists all the people I am currently having conversations with, excluding the owner.", parameters: { type: 'OBJECT', properties: {} }, }, { name: 'deleteLastMessage', description: "Owner-only. Deletes the last message I sent. Use this if the owner says 'undo', 'delete that', 'oops', or something similar right after I've sent a message.", parameters: { type: 'OBJECT', properties: {} }, }, { name: 'sendToMultiple', description: "Owner-only. Sends the same message to multiple phone numbers at once. Very useful for broadcasting messages.", parameters: { type: 'OBJECT', properties: { numbers: { type: 'STRING', description: "Comma-separated list of phone numbers or array of numbers" }, message: { type: 'STRING' } }, required: ['numbers', 'message'] }, }, { name: 'formatMessage', description: "Owner-only. Formats a message with special WhatsApp styling (bold, italic, etc.) before sending.", parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' }, style: { type: 'STRING', description: "Style type: bold, italic, code, strikethrough, fancy, important, celebration" } }, required: ['message'] }, }, { name: 'getMessageStats', description: "Owner-only. Shows statistics about conversations, message counts, and bot usage.", parameters: { type: 'OBJECT', properties: {} }, }, ] };

async function executeTool(functionCall, senderNumber) { const functionName = functionCall.name; const functionArgs = functionCall.args; logger.info(`Tool '${functionName}' requested by ${senderNumber}`); if (senderNumber !== config.ownerNumber) { logger.warn(`Unauthorized tool access attempt by ${senderNumber} for tool '${functionName}'`); const unauthorizedMsg = "සොරි මචං, ඒ වැඩේ කරන්න පුළුවන් මගේ owner ට විතරයි."; return JSON.stringify({ content: unauthorizedMsg, isFinal: true }); } logger.info(`Executing tool '${functionName}' for owner with args: ${JSON.stringify(functionArgs)}`); if (functionName === 'sendWhatsAppMessage') return await sendWhatsAppMessage(functionArgs); if (functionName === 'getConversationSummary') return await getConversationSummary(functionArgs); if (functionName === 'listActiveChats') return await listActiveChats(functionArgs); if (functionName === 'deleteLastMessage') return await deleteLastMessage(functionArgs); if (functionName === 'sendToMultiple') return await sendToMultiple(functionArgs); if (functionName === 'formatMessage') return await formatMessage(functionArgs); if (functionName === 'getMessageStats') return await getMessageStats(functionArgs); logger.warn(`Unknown tool called: ${functionName}`); return JSON.stringify({ status: "Error", reason: `Tool '${functionName}' not found.` }); }

module.exports = { tools, executeTool, setSocket, setLastMessageKey }; // Export the new function