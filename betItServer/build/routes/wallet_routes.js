"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express = require('express');
var fclone = require('fclone');
var bitcoin = require("bitcoinjs-lib");
// const bcrypt = require('bcrypt');
var saltRounds = 10;
var pool = require('../database_connection/pool').pool;
var _a = require('../loggerSetup/logSetup'), btcLogger = _a.btcLogger, mainLogger = _a.mainLogger;
var currentNetwork = bitcoin.networks.testnet;
var axios = require('axios');
var apiMain = 'https://api.blockcypher.com/v1/btc/main';
var apiTest = 'https://api.blockcypher.com/v1/bcy/test';
var _b = require('./encrypt'), encryptKey = _b.encryptKey, decryptKey = _b.decryptKey;
var router = express.Router();
function sendCoins(senderAddr, receiverAddr, senderPrivKey, amount) {
    return __awaiter(this, void 0, void 0, function () {
        var newtx, keyBuffer, keys;
        return __generator(this, function (_a) {
            newtx = {
                inputs: [{ addresses: [senderAddr] }],
                outputs: [{ addresses: [receiverAddr], value: amount }]
            };
            keyBuffer = Buffer.from(senderPrivKey, 'hex');
            keys = bitcoin.ECPair.fromPrivateKey(keyBuffer, currentNetwork);
            axios.post(apiTest + "/txs/new", JSON.stringify(newtx))
                .then(function (tmptx) {
                // signing each of the hex-encoded string required to finalize the transaction
                tmptx.data.pubkeys = [];
                tmptx.data.signatures = tmptx.data.tosign.map(function (tosign, n) {
                    tmptx.data.pubkeys.push(keys.publicKey.toString('hex'));
                    return bitcoin.script.signature.encode(keys.sign(Buffer.from(tosign, "hex")), 0x01).toString("hex").slice(0, -2);
                });
                // remove circular references in the object
                var circularsRemoved = fclone(tmptx);
                var sendtx = {
                    tx: circularsRemoved.data.tx,
                    tosign: circularsRemoved.data.tosign,
                    signatures: circularsRemoved.data.signatures,
                    pubkeys: circularsRemoved.data.pubkeys
                };
                // sending back the transaction with all the signatures to broadcast
                axios.post(apiTest + "/txs/send", JSON.stringify(sendtx)).then(function (finaltx) {
                    console.log(finaltx);
                    return 'Transaction has Began';
                }).catch(function (err) {
                    console.log(err);
                });
            }).catch(function (err) {
                console.log(err);
            });
            return [2 /*return*/];
        });
    });
}
router.post('/test-encryption/:pw', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var plainPrivateKey, encryptedText;
    return __generator(this, function (_a) {
        plainPrivateKey = req.params.pw;
        encryptedText = encryptKey(plainPrivateKey);
        res.send(encryptedText);
        return [2 /*return*/];
    });
}); });
router.post('/test-decryption/:pw', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var plainPrivateKey, decryptedText;
    return __generator(this, function (_a) {
        plainPrivateKey = req.params.pw;
        decryptedText = decryptKey(plainPrivateKey);
        res.send(decryptedText);
        return [2 /*return*/];
    });
}); });
router.post('/create-wallet/:userName', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var name, addrInfo, privateKey, address, walletData, walletInfo, encryptedPrivateKey, insertWalletPK, insertWalletPKValues, result, err_1, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                name = req.params.userName;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 8, , 9]);
                return [4 /*yield*/, axios.post(apiTest + "/addrs", '')];
            case 2:
                addrInfo = _a.sent();
                privateKey = addrInfo.data.private;
                address = addrInfo.data.address;
                walletData = {
                    name: name,
                    addresses: [address]
                };
                _a.label = 3;
            case 3:
                _a.trys.push([3, 6, , 7]);
                return [4 /*yield*/, axios.post(apiTest + "/wallets?token=" + process.env.BLOCKCYPHER_TOKEN, walletData)];
            case 4:
                walletInfo = _a.sent();
                encryptedPrivateKey = encryptKey(privateKey);
                insertWalletPK = 'UPDATE users SET wallet_address=$1, wallet_pk=$2 WHERE username=$3';
                insertWalletPKValues = [address, encryptedPrivateKey, name];
                return [4 /*yield*/, pool.query(insertWalletPK, insertWalletPKValues)];
            case 5:
                result = _a.sent();
                btcLogger.info("Wallet generated for " + name);
                res.json({ message: 'Wallet Successfully Created', status: 200 });
                return [3 /*break*/, 7];
            case 6:
                err_1 = _a.sent();
                btcLogger.error("Issue creating wallet: '" + err_1.response.config.method + "', '" + err_1.response.config.data + "',  '" + err_1.response.config.url + "',  '" + err_1.response.data.error + "'");
                res.json({ message: "Issue creating wallet", error: err_1.message, status: 409 });
                return [3 /*break*/, 7];
            case 7: return [3 /*break*/, 9];
            case 8:
                error_1 = _a.sent();
                btcLogger.error("Error occurred while generating wallet: " + error_1);
                res.end('Error, try again later');
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
router.get('/fund-master-wallet', function (req, res) {
    // Fund prior address with faucet
    var data = { "address": "12343", "amount": 100000 };
    axios.post(apiTest + "/faucet?token=" + process.env.BLOCKCYPHER_TOKEN, JSON.stringify(data))
        .then(function (d) {
        console.log(d);
        res.end('Wallet successfully funded');
    });
});
router.post('/send-to-escrow', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, user1, user2, wagerAmount, lookupKeyQuery, lookupValues, walletInfo, user1_encryptedPrivateKey, user1_walletAddr, user2_encryptedPrivateKey, user2_walletAddr, user1_plainPrivateKey, user2_plainPrivateKey, result1, result2, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, user1 = _a.user1, user2 = _a.user2, wagerAmount = _a.wagerAmount;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 5, , 6]);
                lookupKeyQuery = 'SELECT wallet_address, wallet_pk FROM users WHERE username=$1 OR username=$2';
                lookupValues = [user1, user2];
                return [4 /*yield*/, pool.query(lookupKeyQuery, lookupValues)];
            case 2:
                walletInfo = _b.sent();
                user1_encryptedPrivateKey = walletInfo.rows[0].wallet_pk;
                user1_walletAddr = walletInfo.rows[0].wallet_address;
                user2_encryptedPrivateKey = walletInfo.rows[1].wallet_pk;
                user2_walletAddr = walletInfo.rows[1].wallet_address;
                user1_plainPrivateKey = decryptKey(user1_encryptedPrivateKey);
                user2_plainPrivateKey = decryptKey(user2_encryptedPrivateKey);
                return [4 /*yield*/, sendCoins(user1_walletAddr, 'BwkDigsf8pBsk2BwpPWD9KTMzoQGcxbxnA', user1_plainPrivateKey, wagerAmount)];
            case 3:
                result1 = _b.sent();
                return [4 /*yield*/, sendCoins(user2_walletAddr, 'BwkDigsf8pBsk2BwpPWD9KTMzoQGcxbxnA', user2_plainPrivateKey, wagerAmount)];
            case 4:
                result2 = _b.sent();
                res.send('Transaction has began');
                return [3 /*break*/, 6];
            case 5:
                error_2 = _b.sent();
                console.log(error_2);
                res.json({ message: 'failed terribly' });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
router.get('/pay-winner/:user', function (req, res) {
});
router.get('/get-my-address/:user', function (req, res) {
});
module.exports = router;
