let express = require('express');
const database = require('../database_connection/pool');
const fclone = require('fclone');
const jwt = require('jsonwebtoken');
let router = express.Router();

const authenticateJWT = (req, res, next) => {
  // grab the authorization header
  const authHeader = req.headers.authorization;

  if (authHeader) {
      // if it exists, split it on the space to get the tokem
      const token = authHeader.split(' ')[1];

      jwt.verify(token, accessTokenSecret, (err, user) => {
          // if the token isn't valid, send them a forbidden code
          if (err) {
              return res.sendStatus(403);
          }
          // if the token is valid, attach the user and continue the request
          req.user = user;
          next();
      });
  } else {
      // if no auth header, show an unauthorized code
      res.sendStatus(401);
  }
};

module.exports = router;