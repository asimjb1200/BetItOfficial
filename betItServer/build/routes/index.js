"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require('express');
var database = require('../database_connection/pool');
var mainLogger = require('../loggerSetup/logSetup').mainLogger;
var fclone = require('fclone');
var jwt = require('jsonwebtoken');
var router = express.Router();
/* GET home page. */
router.get('/', function (req, res, next) {
    res.send('hey there');
});
module.exports = router;
