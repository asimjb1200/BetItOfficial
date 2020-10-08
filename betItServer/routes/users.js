let express = require('express');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const { pool } = require('../database_connection/pool');
const jwt = require('jsonwebtoken');
let tokenHandler = require('../tokens/token_auth');
const { userLogger } = require('../loggerSetup/logSetup');
const { query } = require('express');
const {authenticateToken} = require('../tokens/token_auth');
var router = express.Router();

/* GET users listing. */
router.get('/check-token', authenticateToken, function (req, res, next) {
  res.send({message: 'Access Token Valid', status: 200});
});

/* Register a user */
router.post('/register', async (req, res, next) => {
  const { username, password, email } = req.body;

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    try {
      // now post the user to the database
      const insertUserQuery = 'INSERT INTO users(username, password, email) VALUES($1, $2, $3) RETURNING *';
      const queryValues = [username, hash, email];

      const userInserted = await pool.query(insertUserQuery, queryValues);
      userLogger.info(`User created: ${username}`);
      return res.sendStatus(200);
    } catch (insertError) {
      userLogger.error("Couldn't save user: " + insertError)
      res.json({message: "Couldn't save user", status: 500})
    }
  } catch (error) {
    console.log('couldnt hash password')
    res.sendStatus(500)
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
      res.send("not a match")
    }
  } catch (loginError) {
    userLogger.error("Couldn't retrieve the user: " + loginError);
  }
});

router.post('/refresh-token', (req, res) => {
  const { token } = req.body;
  const result = tokenHandler.refreshOldToken(token)
  if (typeof newAccessToken === 'string') {
    res.json({
      result
    });
  } else {
    res.status(result)
  }
});

router.post('/logout', (req, res) => {
  const { token } = req.body;
  refreshTokens = refreshTokens.filter(t => t !== token);
  res.send("Logout successful");
});

module.exports = router;
