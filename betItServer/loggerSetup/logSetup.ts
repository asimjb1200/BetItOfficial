import log4js from "log4js";

// set up the logger to output errors for users to a file. 10mb, rolling and 2 backups
log4js.configure({
    appenders: {
        userErrors: { type: "file", filename: "build/logs/users/userErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        wagerErrors: { type: "file", filename: "build/logs/wagers/wagerErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        tokenErrors: { type: "file", filename: "build/logs/main/tokenErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        mainErrors: { type: "file", filename: "build/logs/main/mainErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        sportsErrors: { type: "file", filename: "build/logs/sports_api/sportsErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        xrpErrors: { type: "file", filename: "build/logs/main/xrpErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        console: { type: 'console' },
    },
    categories: {
        userErrors: { appenders: ["userErrors"], level: "debug" },
        wagerErrors: { appenders: ["wagerErrors"], level: "debug" },
        tokenErrors: { appenders: ["tokenErrors"], level: "debug" },
        mainErrors: { appenders: ["mainErrors"], level: "debug" },
        sportsErrors: { appenders: ["sportsErrors"], level: "debug" },
        xrpErrors: { appenders: ["xrpErrors"], level: "debug" },
        default: { appenders: ['console'], level: 'trace' }
    },
});

const userLogger = log4js.getLogger("userErrors");
const mainLogger = log4js.getLogger("mainErrors");
const btcLogger = log4js.getLogger("btcErrors");
const sportsLogger = log4js.getLogger("sportsErrors");
const xrpLogger = log4js.getLogger("xrpErrors");
const tokenLogger = log4js.getLogger("tokenErrors");
const wagerLogger = log4js.getLogger("wagerErrors");

export {
    userLogger, mainLogger,
    btcLogger, xrpLogger,
    tokenLogger, wagerLogger,
    sportsLogger
};