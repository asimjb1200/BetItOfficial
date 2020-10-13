"use strict";
let express = require('express');
const bcrypt = require('bcrypt');
const isEmail = require('email-validator');
const saltRounds = 10;
const { pool } = require('../database_connection/pool');
let tokenHandler = require('../tokens/token_auth');
const { userLogger } = require('../loggerSetup/logSetup');
const {authenticateToken} = require('../tokens/token_auth');
let router = express.Router();

/* check your token */
router.get('/check-token', authenticateToken, function (req, res, next) {
  res.send({message: 'Access Token Valid', status: 200});
});

/* Register a user */
router.post('/register', async (req, res, next) => {
  const { username, password, email } = req.body;

  try {
    if (isEmail.validate(email)) {
      const hash = await bcrypt.hash(password, saltRounds);
      // now post the user to the database
      const insertUserQuery = 'INSERT INTO users(username, password, email) VALUES($1, $2, $3) RETURNING *';
      const queryValues = [username, hash, email];

      await pool.query(insertUserQuery, queryValues);
      userLogger.info(`User created: ${username}`);
      return res.sendStatus(200);
    } else {
      throw e
    }
  } catch (error) {
    userLogger.error("Error when trying to create hash of user's password: " + error);
    res.sendStatus(500);
  }
});

router.post('/login', async (req, res) => {
  // Read username and password from request body
  const { username, password } = req.body;
  const findUserQuery = 'SELECT password, username FROM users WHERE username = $1';
  const queryValues = [username];

  try {
    // can't do anything without the pw so I'll wait on it
    const user = await pool.query(findUserQuery, queryValues);
    // compare the pw to the hash I have in the db
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (isMatch) {
      const { accessToken, refreshToken } = tokenHandler.generateTokens(user.rows[0].username);
      // now save the access and refresh tokens to the user's data base
      const insertAccessTokenQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
      const insertAccessTokenQueryValues = [accessToken, refreshToken, username];
      try {
        const insertTokensResult = await pool.query(insertAccessTokenQuery, insertAccessTokenQueryValues);
        // return the access and refresh token to the client for usage later
        res.send({
          accessToken,
          refreshToken
        });
      } catch (tokenSaveError) {
        userLogger("Couldn't save the user's tokens: " + tokenSaveError)
        res.sendStatus(500)
      }
    } else {
      userLogger.error(`Bad password attempted for user: ${username}`);
      res.send("not a match")
    }
  } catch (loginError) {
    userLogger.error("Couldn't log the user in: " + loginError);
    res.sendStatus(500);
  }
});

router.post('/refresh-token', async (req, res) => {
  const { token } = req.body;
  const result = await tokenHandler.refreshOldToken(token);
  if (typeof result === 'string') {
    res.json({
      result
    });
  } else {
    res.sendStatus(result)
  }
});

router.post('/logout', async (req, res) => {
  const { token } = req.body;
  // delete the user's refresh token and access token from the database
  const deleteQuery = 'UPDATE users SET access_token=null, refresh_token=null WHERE refresh_token = $1';
  const deleteQueryValues = [token];

  try {
    const queryComplete = await pool.query(deleteQuery, deleteQueryValues);
    res.json({message: "User logged out", status: 200});
  } catch (error) {
    userLogger.error(`Error when logging user out: ${error}`);
    res.json({message: "User logged out", status: 200});
  }
});

module.exports = router;
