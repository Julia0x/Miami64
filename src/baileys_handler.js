const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const { getAIResponse } = require('./ai_handler');
const { setSocket, setLastMessageKey } = require('./tool_handler');
const { getAuthorizedUsers } = require('./memory_handler');

let connectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 5;

async function connectToWhatsApp() {
    try {
        connectionAttempts++;
        
        if (connectionAttempts > MAX_RECONNECTION_ATTEMPTS) {
            logger.error('Maximum reconnection attempts reached. Stopping bot.');
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState('data/session');
        
        const sock = makeWASocket({ 
            auth: state,
            logger: require('pino')({ level: 'silent' }),
            // Remove deprecated printQRInTerminal option
            markOnlineOnConnect: true,
            syncFullHistory: false,
            defaultQueryTimeoutMs: 60000,
        });

        setSocket(sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logger.info('QR code received, scan it to connect!');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                
                logger.error(`Connection closed: ${lastDisconnect?.error}, Status Code: ${statusCode}`);
                
                if (statusCode === DisconnectReason.multideviceMismatch) {
                    logger.error('Multi-device mismatch. Please delete session and scan QR again.');
                    return;
                }
                
                if (statusCode === DisconnectReason.forbidden) {
                    logger.error('WhatsApp account banned. Cannot reconnect.');
                    return;
                }
                
                if (shouldReconnect && connectionAttempts <= MAX_RECONNECTION_ATTEMPTS) {
                    logger.info(`Reconnecting... Attempt ${connectionAttempts}/${MAX_RECONNECTION_ATTEMPTS}`);
                    setTimeout(() => {
                        connectToWhatsApp();
                    }, 5000); // Wait 5 seconds before reconnecting
                } else {
                    logger.error('Not reconnecting. Either logged out or max attempts reached.');
                }
                
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp connection opened successfully!');
                connectionAttempts = 0; // Reset counter on successful connection
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderJid = msg.key.remoteJid;
            const senderNumber = senderJid.split('@')[0];

            const authorizedUsers = await getAuthorizedUsers();
            if (!authorizedUsers.includes(senderNumber)) {
                logger.warn(`Ignoring message from unauthorized user: ${senderNumber}`);
                return;
            }

            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!messageText) return;

            logger.info(`Received message from ${senderNumber}: "${messageText}"`);

            try {
                await sock.sendPresenceUpdate('composing', senderJid);
                const aiResponse = await getAIResponse(messageText, senderJid, senderNumber);

                const sentMsg = await sock.sendMessage(senderJid, { text: aiResponse }, { quoted: msg });

                if (sentMsg) {
                    setLastMessageKey(sentMsg.key);
                    logger.info('Stored key for the last sent message.');
                }

                await sock.sendPresenceUpdate('available', senderJid);
            } catch (error) {
                logger.error('Error processing message:', error);
                await sock.sendMessage(senderJid, { text: 'Oh no! 😔 Something unexpected happened on my end. I\'m so sorry! Could you try that again? I promise I\'ll do better! 💕🔧' });
            }
        });

    } catch (error) {
        logger.error('Error in connectToWhatsApp:', error);
        if (connectionAttempts <= MAX_RECONNECTION_ATTEMPTS) {
            setTimeout(() => {
                connectToWhatsApp();
            }, 10000); // Wait 10 seconds before retrying
        }
    }
}

module.exports = { connectToWhatsApp };