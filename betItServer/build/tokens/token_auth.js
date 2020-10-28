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
exports.refreshOldToken = exports.generateTokens = exports.authenticateJWT = void 0;
var jwt = require('jsonwebtoken');
var pool_1 = require("../database_connection/pool");
var userLogger = require('../loggerSetup/logSetup').userLogger;
var unsubscribe = require('../routes/users').unsubscribe;
function authenticateJWT(req, res, next) {
    // grab the authorization header
    var authHeader = req.headers.authorization;
    if (authHeader) {
        // if it exists, split it on the space to get the tokem
        var token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.ACCESSTOKENSECRET, function (err, user) {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                userLogger.warn("Invalid access token attempted: " + err);
                return res.sendStatus(403);
            }
            // if the token is valid, attach the user and continue the request
            req.user = user;
            next();
        });
    }
    else {
        // if no auth header, show an unauthorized code
        userLogger.error("Unauthorized access attempted. No auth header present");
        res.sendStatus(401);
    }
}
exports.authenticateJWT = authenticateJWT;
;
function generateTokens(username) {
    // Generate an access & refresh token
    var accessToken = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET, { expiresIn: '5m' });
    var refreshToken = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET, { expiresIn: '30m' });
    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken };
}
exports.generateTokens = generateTokens;
function refreshOldToken(token) {
    return __awaiter(this, void 0, void 0, function () {
        var findRefresh, findRefreshValues, refresh_token, user, accessToken, insertAccessTokenQuery, insertAccessTokenQueryValues, tokenInserted, err_1, dbError_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!token) {
                        return [2 /*return*/, 401];
                    }
                    findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
                    findRefreshValues = [token];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, pool_1.pool.query(findRefresh, findRefreshValues)];
                case 2:
                    refresh_token = (_a.sent()).rows[0].refresh_token;
                    if (!refresh_token) {
                        return [2 /*return*/, 403];
                    }
                    return [4 /*yield*/, jwt.verify(token, process.env.REFRESHTOKENSECRET)];
                case 3:
                    user = _a.sent();
                    accessToken = jwt.sign({ username: user.username }, process.env.ACCESSTOKENSECRET, { expiresIn: '30m' });
                    insertAccessTokenQuery = 'UPDATE users SET access_token=$1 WHERE refresh_token=$2';
                    insertAccessTokenQueryValues = [accessToken, token];
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, pool_1.pool.query(insertAccessTokenQuery, insertAccessTokenQueryValues)];
                case 5:
                    tokenInserted = _a.sent();
                    console.log(tokenInserted);
                    return [2 /*return*/, accessToken];
                case 6:
                    err_1 = _a.sent();
                    console.log(err_1);
                    return [2 /*return*/, 500];
                case 7: return [3 /*break*/, 9];
                case 8:
                    dbError_1 = _a.sent();
                    return [2 /*return*/, 500];
                case 9: return [2 /*return*/];
            }
        });
    });
}
exports.refreshOldToken = refreshOldToken;
