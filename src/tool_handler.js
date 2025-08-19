const logger = require('./logger');
const { addAuthorizedUser, readFullHistory, getPrivacyFilteredHistory, getAnonymizedStats } = require('./memory_handler');
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
async function getConversationSummary({ number }, senderNumber) { 
    const formattedNumber = formatPhoneNumber(number); 
    if (!formattedNumber) { 
        return JSON.stringify({ isFinal: true, content: `Hmm, the number '${number}' doesn't look quite right 🤔 Could you check the format? I want to make sure I'm looking up the right person! 📞` }); 
    } 
    
    const requestingUserId = `${senderNumber}@s.whatsapp.net`;
    const targetUserId = `${formattedNumber}@s.whatsapp.net`;
    
    // Privacy check using the new privacy-protected function
    const history = await getPrivacyFilteredHistory(requestingUserId, targetUserId);
    
    if (history === null) {
        return JSON.stringify({ isFinal: true, content: `I keep all conversations private! 🤐💕 I can't share details about other people's chats. But I'd be happy to send them a message for you instead! What would you like me to say? 😊` });
    }
    
    if (!history || history.length === 0) { 
        return JSON.stringify({ isFinal: true, content: `Oh! 😮 I haven't had any conversations with ${formattedNumber} yet. Want me to send them a message to start one? I'd love to help you connect! 💬✨` }); 
    } 
    
    const conversationText = history.map(msg => `${msg.role === 'user' ? 'They said' : 'I said'}: ${msg.content}`).join('\n'); 
    const summaryPrompt = `Please provide a warm, friendly summary of my conversation with ${formattedNumber}. Make it personal and engaging:\n\n${conversationText}`; 
    
    return JSON.stringify({ needsSummarization: true, prompt: summaryPrompt }); 
}
async function listActiveChats() { 
    const fullHistory = await readFullHistory(); 
    const chatJids = Object.keys(fullHistory); 
    
    if (chatJids.length <= 1) { 
        return JSON.stringify({ content: "Right now it's just you and me chatting! 😊 Want me to send a message to someone to start a new conversation? I love helping you stay connected! 💕", isFinal: true }); 
    } 
    
    const numbers = chatJids.map(jid => jid.split('@')[0]).filter(num => num !== config.ownerNumber); 
    const responseText = `Look at our little social network! 🌐✨ I've been chatting with:\n- ${numbers.join('\n- ')}\n\nWant me to send a message to any of them? I'm always ready to help! 💬💕`; 
    
    return JSON.stringify({ content: responseText, isFinal: true }); 
}

// New Advanced Tools
async function sendToMultiple({ numbers, message }) {
    if (!numbers || !message) {
        const missing = [];
        if (!numbers) missing.push("phone numbers");
        if (!message) missing.push("message content");
        const errorMsg = `Oh! 😊 I need both the ${missing.join(' and ')} to send a broadcast message. Could you give me those details? I'm excited to help you reach everyone! 📢💕`;
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
    
    if (!sockInstance) {
        return JSON.stringify({ status: "Error", reason: "Aw, my WhatsApp connection is down! 😔 Give me a moment to reconnect and then we can send those messages! 🔄" });
    }
    
    const numbersList = Array.isArray(numbers) ? numbers : numbers.split(',').map(n => n.trim());
    const results = [];
    let successCount = 0;
    
    for (const number of numbersList) {
        const formattedNumber = formatPhoneNumber(number);
        if (!formattedNumber) {
            results.push(`❌ ${number}: Invalid format - could you double-check this one? 🤔`);
            continue;
        }
        
        try {
            const jid = `${formattedNumber}@s.whatsapp.net`;
            await sockInstance.sendMessage(jid, { text: message });
            await addAuthorizedUser(formattedNumber);
            results.push(`✅ ${formattedNumber}: Message sent! 🎉`);
            successCount++;
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            results.push(`❌ ${formattedNumber}: Couldn't send - ${error.message} 😔`);
        }
    }
    
    const summary = `Awesome! 🚀 I sent ${successCount}/${numbersList.length} messages successfully! Here's the breakdown:\n\n${results.join('\n')}\n\nI love helping you stay connected with everyone! 💕✨`;
    logger.info(`Bulk message sent: ${successCount}/${numbersList.length} successful`);
    return JSON.stringify({ status: "Success", detail: summary });
}

async function formatMessage({ message, style }) {
    if (!message) {
        return JSON.stringify({ status: "Error", reason: "Ooh, I need the message content to format it! ✨ What would you like me to style? I'm excited to make it look amazing! 🎨" });
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
        detail: `Ta-da! ✨ Here's your beautifully formatted message: ${formattedMessage}\n\nLooks fantastic! Ready to send it? 😊💕`,
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
    
    const averagePerUser = Math.round(totalMessages/totalUsers);
    
    const stats = `📊 *Miami Bot Statistics* - Look how active we are! 🎉

👥 **Total Friends**: ${totalUsers} amazing people!
💬 **Total Messages**: ${totalMessages} conversations and counting!
🤖 **My Messages**: ${myMessages} (I love chatting!)
👤 **Your Messages**: ${userMessages} 
📈 **Average per friend**: ${averagePerUser} messages

I absolutely love connecting with everyone! Thanks for making me feel so useful and appreciated! 💕✨

Want me to send a message to any of our friends? I'm always ready to help! 😊`;
    
    return JSON.stringify({ content: stats, isFinal: true });
}

// New Tool Implementation
async function deleteLastMessage() {
    if (!lastSentMessageKey) {
        const errorMsg = "Oops! 😅 I don't have a recent message to delete. But no worries - next time you want me to undo something, just let me know right after I send it! 💪";
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
    
    if (!sockInstance) {
        const errorMsg = "Oh no! 😰 My WhatsApp connection is down, so I can't delete the message right now. Let me try to reconnect! 🔄";
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
    
    try {
        await sockInstance.sendMessage(lastSentMessageKey.remoteJid, { delete: lastSentMessageKey });
        logger.info(`SUCCESS: Deleted message with key: ${lastSentMessageKey.id}`);
        const successMsg = "Done! ✨ Message deleted successfully! Don't worry, we all make mistakes sometimes! 😊💕";
        lastSentMessageKey = null;
        return JSON.stringify({ status: "Success", detail: successMsg });
    } catch (error) {
        const errorMsg = `Hmm, I had trouble deleting that message 😔 It might be too old or there could be a connection issue. Error: ${error.message}`;
        logger.error(errorMsg);
        return JSON.stringify({ status: "Error", reason: errorMsg });
    }
}

const tools = { functionDeclarations: [ { name: 'sendWhatsAppMessage', description: "Owner-only. Sends a WhatsApp message to a new number and authorizes them. Requires both a valid phone number and the exact message content.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' }, message: { type: 'STRING' } }, required: ['number', 'message'] }, }, { name: 'getConversationSummary', description: "Owner-only. Gets a summary of my conversation with a specific person.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' } }, required: ['number'] }, }, { name: 'listActiveChats', description: "Owner-only. Lists all the people I am currently having conversations with, excluding the owner.", parameters: { type: 'OBJECT', properties: {} }, }, { name: 'deleteLastMessage', description: "Owner-only. Deletes the last message I sent. Use this if the owner says 'undo', 'delete that', 'oops', or something similar right after I've sent a message.", parameters: { type: 'OBJECT', properties: {} }, }, { name: 'sendToMultiple', description: "Owner-only. Sends the same message to multiple phone numbers at once. Very useful for broadcasting messages.", parameters: { type: 'OBJECT', properties: { numbers: { type: 'STRING', description: "Comma-separated list of phone numbers or array of numbers" }, message: { type: 'STRING' } }, required: ['numbers', 'message'] }, }, { name: 'formatMessage', description: "Owner-only. Formats a message with special WhatsApp styling (bold, italic, etc.) before sending.", parameters: { type: 'OBJECT', properties: { message: { type: 'STRING' }, style: { type: 'STRING', description: "Style type: bold, italic, code, strikethrough, fancy, important, celebration" } }, required: ['message'] }, }, { name: 'getMessageStats', description: "Owner-only. Shows statistics about conversations, message counts, and bot usage.", parameters: { type: 'OBJECT', properties: {} }, }, ] };

async function executeTool(functionCall, senderNumber) { 
    const functionName = functionCall.name; 
    const functionArgs = functionCall.args; 
    
    logger.info(`Tool '${functionName}' requested by ${senderNumber}`); 
    
    if (senderNumber !== config.ownerNumber) { 
        logger.warn(`Unauthorized tool access attempt by ${senderNumber} for tool '${functionName}'`); 
        const unauthorizedMsg = "Hey there! 😊 I'd love to help, but these special tools are only for my owner. I'm programmed to be extra careful about security! Maybe you could ask them to help you instead? 🔒💕"; 
        return JSON.stringify({ content: unauthorizedMsg, isFinal: true }); 
    } 
    
    logger.info(`Executing tool '${functionName}' for owner with args: ${JSON.stringify(functionArgs)}`); 
    
    if (functionName === 'sendWhatsAppMessage') return await sendWhatsAppMessage(functionArgs); 
    if (functionName === 'getConversationSummary') return await getConversationSummary(functionArgs); 
    if (functionName === 'listActiveChats') return await listActiveChats(functionArgs); 
    if (functionName === 'deleteLastMessage') return await deleteLastMessage(functionArgs); 
    if (functionName === 'sendToMultiple') return await sendToMultiple(functionArgs); 
    if (functionName === 'formatMessage') return await formatMessage(functionArgs); 
    if (functionName === 'getMessageStats') return await getMessageStats(functionArgs); 
    
    logger.warn(`Unknown tool called: ${functionName}`); 
    return JSON.stringify({ status: "Error", reason: `Hmm, I don't recognize the tool '${functionName}' 🤔 That's weird! Let me check my systems... 🔍` }); 
}

module.exports = { tools, executeTool, setSocket, setLastMessageKey }; // Export the new function