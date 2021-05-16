import log4js from "log4js";

// set up the logger to output errors for users to a file. 10mb, rolling and 2 backups
log4js.configure({
    appenders: {
        userErrors: { type: "file", filename: "build/logs/users/userErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        tokenErrors: { type: "file", filename: "build/logs/main/tokenErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        mainErrors: { type: "file", filename: "build/logs/main/mainErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        sportsErrors: { type: "file", filename: "build/logs/sports_api/sportsErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        btcErrors: { type: "file", filename: "build/logs/main/btcErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        xrpErrors: { type: "file", filename: "build/logs/main/xrpErrors.log", maxLogSize: 10485760, backups: 2, compress: true },
        console: { type: 'console' },
    },
    categories: {
        // userErrors: { appenders: ["userErrors"], level: "debug" },
        // mainErrors: { appenders: ["mainErrors"], level: "debug" },
        // sportsErrors: { appenders: ["sportsErrors"], level: "debug" },
        // btcErrors: { appenders: ["btcErrors"], level: "debug" },
        // xrpErrors: { appenders: ["xrpErrors"], level: "debug" },
        default: { appenders: 
                        ['console', 'userErrors', 'mainErrors', 
                            'sportsErrors', 'xrpErrors', 'tokenErrors'], 
                    level: 'trace'
                }
    },
});

const userLogger = log4js.getLogger("userErrors");
const mainLogger = log4js.getLogger("mainErrors");
const btcLogger = log4js.getLogger("btcErrors");
const xrpLogger = log4js.getLogger("xrpErrors");
const tokenLogger = log4js.getLogger("tokenErrors");

export {userLogger, mainLogger, btcLogger, xrpLogger, tokenLogger};