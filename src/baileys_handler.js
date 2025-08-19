const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const { getAIResponse } = require('./ai_handler');
const { setSocket, setLastMessageKey } = require('./tool_handler'); // Import setLastMessageKey
const { getAuthorizedUsers } = require('./memory_handler');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('data/session');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true, logger: require('pino')({ level: 'silent' }) });

    setSocket(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            logger.info('QR code received, scan it!');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.error(`Connection closed: ${lastDisconnect.error}, reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            logger.info('WhatsApp connection opened successfully!');
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
            await sock.sendMessage(senderJid, { text: 'Sorry, an internal error occurred.' });
        }
    });
}

module.exports = { connectToWhatsApp };