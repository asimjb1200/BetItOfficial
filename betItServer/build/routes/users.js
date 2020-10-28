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
var bcrypt = require('bcrypt');
var isEmail = require('email-validator');
var saltRounds = 10;
var pool_1 = require("../database_connection/pool");
var tokenHandler = require('../tokens/token_auth');
var userLogger = require('../loggerSetup/logSetup').userLogger;
var token_auth_1 = require("../tokens/token_auth");
var router = express.Router();
/* check your token */
router.get('/check-token', token_auth_1.authenticateJWT, function (req, res, next) {
    res.send({ message: 'Access Token Valid', status: 200 });
});
/* Register a user */
router.post('/register', function (req, res, next) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, username, password, email, hash, insertUserQuery, queryValues, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, username = _a.username, password = _a.password, email = _a.email;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, , 7]);
                if (!isEmail.validate(email)) return [3 /*break*/, 4];
                return [4 /*yield*/, bcrypt.hash(password, saltRounds)];
            case 2:
                hash = _b.sent();
                insertUserQuery = 'INSERT INTO users(username, password, email) VALUES($1, $2, $3) RETURNING *';
                queryValues = [username, hash, email];
                return [4 /*yield*/, pool_1.pool.query(insertUserQuery, queryValues)];
            case 3:
                _b.sent();
                userLogger.info("User created: " + username);
                return [2 /*return*/, res.sendStatus(200)];
            case 4: throw new Error();
            case 5: return [3 /*break*/, 7];
            case 6:
                error_1 = _b.sent();
                userLogger.error("Error when trying to create hash of user's password: " + error_1);
                res.sendStatus(500);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
router.post('/login', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, username, password, findUserQuery, queryValues, user, isMatch, _b, accessToken, refreshToken, insertAccessTokenQuery, insertAccessTokenQueryValues, insertTokensResult, tokenSaveError_1, loginError_1;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = req.body, username = _a.username, password = _a.password;
                findUserQuery = 'SELECT password, username FROM users WHERE username = $1';
                queryValues = [username];
                _c.label = 1;
            case 1:
                _c.trys.push([1, 10, , 11]);
                return [4 /*yield*/, pool_1.pool.query(findUserQuery, queryValues)];
            case 2:
                user = _c.sent();
                return [4 /*yield*/, bcrypt.compare(password, user.rows[0].password)];
            case 3:
                isMatch = _c.sent();
                if (!isMatch) return [3 /*break*/, 8];
                _b = tokenHandler.generateTokens(user.rows[0].username), accessToken = _b.accessToken, refreshToken = _b.refreshToken;
                insertAccessTokenQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
                insertAccessTokenQueryValues = [accessToken, refreshToken, username];
                _c.label = 4;
            case 4:
                _c.trys.push([4, 6, , 7]);
                return [4 /*yield*/, pool_1.pool.query(insertAccessTokenQuery, insertAccessTokenQueryValues)];
            case 5:
                insertTokensResult = _c.sent();
                // return the access and refresh token to the client for usage later
                res.send({
                    accessToken: accessToken,
                    refreshToken: refreshToken
                });
                return [3 /*break*/, 7];
            case 6:
                tokenSaveError_1 = _c.sent();
                userLogger("Couldn't save the user's tokens: " + tokenSaveError_1);
                res.sendStatus(500);
                return [3 /*break*/, 7];
            case 7: return [3 /*break*/, 9];
            case 8:
                userLogger.error("Bad password attempted for user: " + username);
                res.send("not a match");
                _c.label = 9;
            case 9: return [3 /*break*/, 11];
            case 10:
                loginError_1 = _c.sent();
                userLogger.error("Couldn't log the user in: " + loginError_1);
                res.sendStatus(500);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); });
router.post('/refresh-token', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var token, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                token = req.body.token;
                return [4 /*yield*/, token_auth_1.refreshOldToken(token)];
            case 1:
                result = _a.sent();
                if (typeof result === 'string') {
                    res.json({
                        result: result
                    });
                }
                else {
                    res.sendStatus(result);
                }
                return [2 /*return*/];
        }
    });
}); });
router.post('/logout', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var token, deleteQuery, deleteQueryValues, queryComplete, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                token = req.body.token;
                deleteQuery = 'UPDATE users SET access_token=null, refresh_token=null WHERE refresh_token = $1';
                deleteQueryValues = [token];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, pool_1.pool.query(deleteQuery, deleteQueryValues)];
            case 2:
                queryComplete = _a.sent();
                res.json({ message: "User logged out", status: 200 });
                return [3 /*break*/, 4];
            case 3:
                error_2 = _a.sent();
                userLogger.error("Error when logging user out: " + error_2);
                res.json({ message: "User logged out", status: 200 });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
module.exports = router;
