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

async function sendWhatsAppMessage({ number, message }) { if (!number || !message) { const errorMsg = "Tool Error: I need both a valid phone number and a message to send."; logger.error(errorMsg); return JSON.stringify({ status: "Error", reason: errorMsg }); } const formattedNumber = formatPhoneNumber(number); if (!formattedNumber) { const errorMsg = `Tool Error: The phone number '${number}' seems to be in a wrong format.`; logger.error(errorMsg); return JSON.stringify({ status: "Error", reason: errorMsg }); } if (!sockInstance) { const errorMsg = "Tool Error: My connection to WhatsApp is down."; logger.error(errorMsg); return JSON.stringify({ status: "Error", reason: errorMsg }); } try { const jid = `${formattedNumber}@s.whatsapp.net`; await sockInstance.sendMessage(jid, { text: message }); logger.info(`SUCCESS: Message sent to ${formattedNumber}`); await addAuthorizedUser(formattedNumber); return JSON.stringify({ status: "Success", detail: `I successfully sent the message to ${formattedNumber}.` }); } catch (error) { const errorMsg = `Tool Error: I failed to send the message. Maybe the number is invalid on WhatsApp. Error: ${error.message}`; logger.error(errorMsg); return JSON.stringify({ status: "Error", reason: errorMsg }); } }
async function getConversationSummary({ number }) { const formattedNumber = formatPhoneNumber(number); if (!formattedNumber) { return JSON.stringify({ isFinal: true, content: `සොරි මචං, '${number}' කියන නම්බර් එකේ format එක අවුල් වගේ.` }); } const fullHistory = await readFullHistory(); const userJid = `${formattedNumber}@s.whatsapp.net`; if (!fullHistory[userJid] || fullHistory[userJid].length === 0) { return JSON.stringify({ isFinal: true, content: "මම එයත් එක්ක තාම කතා කරලා නෑ මචං." }); } const conversationText = fullHistory[userJid].map(msg => `${msg.role === 'user' ? 'They said' : 'I said'}: ${msg.content}`).join('\n'); const summaryPrompt = `From my perspective as Miami, briefly summarize the conversation I had with ${formattedNumber} in a casual Sinhala tone:\n\n${conversationText}`; return JSON.stringify({ needsSummarization: true, prompt: summaryPrompt }); }
async function listActiveChats() { const fullHistory = await readFullHistory(); const chatJids = Object.keys(fullHistory); if (chatJids.length <= 1) { return JSON.stringify({ content: "මම දැනට ඔයා එක්ක විතරයි මචං කතා කරන්නේ.", isFinal: true }); } const numbers = chatJids.map(jid => jid.split('@')[0]).filter(num => num !== config.ownerNumber); const responseText = `ඔයා ඇරුනම මම දැනට කතා කරමින් ඉන්න අය:\n- ${numbers.join('\n- ')}`; return JSON.stringify({ content: responseText, isFinal: true }); }

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

const tools = { functionDeclarations: [ { name: 'sendWhatsAppMessage', description: "Owner-only. Sends a WhatsApp message to a new number and authorizes them. Requires both a valid phone number and the exact message content.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' }, message: { type: 'STRING' } }, required: ['number', 'message'] }, }, { name: 'getConversationSummary', description: "Owner-only. Gets a summary of my conversation with a specific person.", parameters: { type: 'OBJECT', properties: { number: { type: 'STRING' } }, required: ['number'] }, }, { name: 'listActiveChats', description: "Owner-only. Lists all the people I am currently having conversations with, excluding the owner.", parameters: { type: 'OBJECT', properties: {} }, }, { name: 'deleteLastMessage', description: "Owner-only. Deletes the last message I sent. Use this if the owner says 'undo', 'delete that', 'oops', or something similar right after I've sent a message.", parameters: { type: 'OBJECT', properties: {} }, }, ] };

async function executeTool(functionCall, senderNumber) { const functionName = functionCall.name; const functionArgs = functionCall.args; logger.info(`Tool '${functionName}' requested by ${senderNumber}`); if (senderNumber !== config.ownerNumber) { logger.warn(`Unauthorized tool access attempt by ${senderNumber} for tool '${functionName}'`); const unauthorizedMsg = "සොරි මචං, ඒ වැඩේ කරන්න පුළුවන් මගේ owner ට විතරයි."; return JSON.stringify({ content: unauthorizedMsg, isFinal: true }); } logger.info(`Executing tool '${functionName}' for owner with args: ${JSON.stringify(functionArgs)}`); if (functionName === 'sendWhatsAppMessage') return await sendWhatsAppMessage(functionArgs); if (functionName === 'getConversationSummary') return await getConversationSummary(functionArgs); if (functionName === 'listActiveChats') return await listActiveChats(functionArgs); if (functionName === 'deleteLastMessage') return await deleteLastMessage(functionArgs); logger.warn(`Unknown tool called: ${functionName}`); return JSON.stringify({ status: "Error", reason: `Tool '${functionName}' not found.` }); }

module.exports = { tools, executeTool, setSocket, setLastMessageKey }; // Export the new function