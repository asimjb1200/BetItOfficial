"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
var _a = require('pg'), Pool = _a.Pool, Client = _a.Client;
// connecting to the server
// pooling helps to minimize new connections which are memory intensive, and will instead used cached connections
exports.pool = new Pool();
// module.exports = {pool};
