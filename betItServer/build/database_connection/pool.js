"use strict";
var _a = require('pg'), Pool = _a.Pool, Client = _a.Client;
// connecting to the server
// pooling helps to minimize new connections which are memory intensive, and will instead used cached connections
var pool = new Pool();
module.exports = { pool: pool };
