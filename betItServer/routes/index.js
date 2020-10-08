let express = require('express');
const database = require('../database_connection/pool');
const {mainLogger} = require('../loggerSetup/logSetup');
const fclone = require('fclone');
const jwt = require('jsonwebtoken');
let router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('hey there');
});

module.exports = router;
