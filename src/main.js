const logger = require('./logger');
const { connectToWhatsApp } = require('./baileys_handler');

logger.info('-----------------------------------');
logger.info('--- Starting Miami AI Bot ---');
logger.info('-----------------------------------');

connectToWhatsApp().catch(err => {
    logger.error('Failed to start WhatsApp connection:', err);
});