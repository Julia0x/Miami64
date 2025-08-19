require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const config = require('../config.json');
const logger = require('./logger');
const { getHistoryForUser, appendToHistory } = require('./memory_handler');
const { tools, executeTool } = require('./tool_handler');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// We only need ONE model now. The main, powerful brain.
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    systemInstruction: config.systemInstruction,
    tools: tools,
});

const safetySettings = [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE, }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE, }, ];
const convertHistoryForGemini = (history) => { return history.map(item => ({ role: item.role === 'assistant' ? 'model' : item.role, parts: [{ text: item.content }] })); };
async function getSummaryFromAI(prompt) { const modelForSummary = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); const result = await modelForSummary.generateContent(prompt); return result.response.text(); }

async function getAIResponse(userMessage, userId, senderNumber) {
    try {
        await appendToHistory(userId, { role: 'user', content: userMessage });
        const currentHistory = await getHistoryForUser(userId);
        const geminiHistory = convertHistoryForGemini(currentHistory);
        const chat = model.startChat({ history: geminiHistory, safetySettings });

        logger.info(`Sending initial request to Gemini for user: ${senderNumber}`);
        let result = await chat.sendMessage(userMessage);

        // Enhanced Verification and Context Analysis Layer
        while (result.response.functionCalls() && result.response.functionCalls().length > 0) {
            const call = result.response.functionCalls()[0];
            const args = call.args;
            let feedbackMsg = '';

            // --- Enhanced Verification Layer with Emotions ---
            if (call.name === 'sendWhatsAppMessage' && (!args.number || !args.message)) {
                let missingInfo = !args.number ? "phone number" : "message content";
                feedbackMsg = `Oops! 😅 I'm excited to send a message, but I need the ${missingInfo} first! Could you give me that info? I want to make sure everything's perfect! 💌`;
            } else if (call.name === 'getConversationSummary' && !args.number) {
                feedbackMsg = `I'd love to get that conversation summary for you! 📋✨ But I need to know which phone number you want me to check. Whose chat history should I look at? 🤔`;
            } else if (call.name === 'sendToMultiple' && (!args.numbers || !args.message)) {
                let missing = [];
                if (!args.numbers) missing.push("phone numbers list");
                if (!args.message) missing.push("message content");
                feedbackMsg = `Ooh, mass messaging! I love being efficient! 🚀 But I need the ${missing.join(' and ')} first. Could you give me those details? I'm excited to help you reach everyone! 📢💕`;
            } else if (call.name === 'formatMessage' && !args.message) {
                feedbackMsg = `I'm so ready to make that message look amazing! ✨🎨 But I need the message content first - what would you like me to format and style? 😊`;
            }
            
            // Context-based smart suggestions with emotions
            if (!feedbackMsg && call.name === 'sendWhatsAppMessage') {
                const messageText = userMessage.toLowerCase();
                if (messageText.includes('everyone') || messageText.includes('all') || messageText.includes('multiple') || messageText.includes('group') || (args.number && args.number.includes(','))) {
                    feedbackMsg = `Ooh! 🤩 Looks like you want to send this to multiple people! I have a special tool for that - sendToMultiple - which is perfect for broadcasting! Should I use that instead? It's so much more efficient! 🚀💕`;
                }
            }
            // --- End Enhanced Verification Layer ---

            // If verification fails, send feedback to the AI to correct itself
            if (feedbackMsg) {
                logger.warn(`Verification failed for tool ${call.name}. Re-prompting AI.`);
                result = await chat.sendMessage(feedbackMsg);
                continue; // Skip the rest of the loop and let the AI ask the user
            }

            // If verification passes, execute the tool
            const toolResultContent = await executeTool(call, senderNumber);
            const toolResult = JSON.parse(toolResultContent);

            if (toolResult.isFinal) {
                await appendToHistory(userId, { role: 'assistant', content: toolResult.content });
                return toolResult.content;
            }

            if (toolResult.needsSummarization) {
                const summary = await getSummaryFromAI(toolResult.prompt);
                await appendToHistory(userId, { role: 'assistant', content: summary });
                return summary;
            }

            // Send the successful tool result back to the AI to generate a final response
            logger.info('Sending successful tool results back to Gemini...');
            result = await chat.sendMessage([{ functionResponse: { name: call.name, response: { content: toolResultContent } } }]);
        }

        const finalResponse = result.response.text();
        await appendToHistory(userId, { role: 'assistant', content: finalResponse });
        return finalResponse;

    } catch (error) {
        logger.error('Error in getAIResponse:', error);
        return "අඩෝ සොරි මචං, මගේ system එකේ මොකක්දෝ අවුලක් ගියා. පොඩ්ඩක් ඉඳලා try කරමුද?";
    }
}

module.exports = { getAIResponse };