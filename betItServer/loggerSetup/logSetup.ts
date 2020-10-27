let log4js = require("log4js");

// set up the logger to output errors for users to a file. 10mb, rolling and 2 backups
log4js.configure({
    appenders: {
        userErrors: { type: "file", filename: "./logs/users/userErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        mainErrors: { type: "file", filename: "./logs/main/mainErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        sportsErrors: { type: "file", filename: "./logs/sports_api/sportsErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        btcErrors: { type: "file", filename: "./logs/main/btcErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        console: { type: 'console' },
    },
    categories: {
        userErrors: { appenders: ["userErrors"], level: "debug" },
        mainErrors: { appenders: ["mainErrors"], level: "debug" },
        sportsErrors: { appenders: ["sportsErrors"], level: "debug" },
        btcErrors: { appenders: ["btcErrors"], level: "debug" },
        default: { appenders: ['console'], level: 'trace'}
    },
});

const userLogger = log4js.getLogger("userErrors");
const mainLogger = log4js.getLogger("mainErrors");
const btcLogger = log4js.getLogger("btcErrors");

exports.userLogger = userLogger;
exports.mainLogger = mainLogger;
exports.btcLogger = btcLogger;
exports.sportsLogger = log4js.getLogger("sportsErrors");