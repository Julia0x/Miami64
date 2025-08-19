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

        // The Verification and Execution Loop
        while (result.response.functionCalls() && result.response.functionCalls().length > 0) {
            const call = result.response.functionCalls()[0];
            const args = call.args;
            let feedbackMsg = '';

            // --- Verification Layer ---
            if (call.name === 'sendWhatsAppMessage' && (!args.number || !args.message)) {
                let missingInfo = !args.number ? "phone number" : "message content";
                feedbackMsg = `You tried to send a message, but you forgot the ${missingInfo}. Ask the user for it friendly.`;
            } else if (call.name === 'getConversationSummary' && !args.number) {
                feedbackMsg = `You tried to get a summary, but you forgot the phone number. Ask the user whose summary they want.`;
            }
            // --- End Verification Layer ---

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