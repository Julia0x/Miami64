const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(info => `${info.timestamp} [${info.level}]: ${info.message}`)
            )
        }),
        new winston.transports.File({ filename: 'logs/app.log' }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
    ]
});

module.exports = logger;