"use strict";
const jwt = require('jsonwebtoken');
const {pool} = require('../database_connection/pool');

function authenticateJWT(req, res, next) {
    // grab the authorization header
    const authHeader = req.headers.authorization;

    if (authHeader) {
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.ACCESSTOKENSECRET, (err, user) => {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                console.log(err)
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

function generateTokens(username) {
    // Generate an access & refresh token
    const accessToken = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET, { expiresIn: '5m' });
    const refreshToken = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET, { expiresIn: '30m' });

    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken }
}

async function refreshOldToken(token) {
    if (!token) {
        return 401;
    }
    // find the user's refresh token in the database
    const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
    const findRefreshValues = [token]
    try {
        const {refresh_token} = (await pool.query(findRefresh, findRefreshValues)).rows[0];
        if (!refresh_token) {
            return 403
        }
        const user = await jwt.verify(token, process.env.REFRESHTOKENSECRET);
        const accessToken = jwt.sign({ username: user.username }, process.env.ACCESSTOKENSECRET, { expiresIn: '10m' });
        // save the user's new access token to the db
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1 WHERE refresh_token=$2';
        const insertAccessTokenQueryValues = [accessToken, token];
        try {
            const tokenInserted = await pool.query(insertAccessTokenQuery, insertAccessTokenQueryValues);
            console.log(tokenInserted)
            return accessToken
        } catch(err) {
            console.log(err)
            return 500
        }
    } catch(dbError) {
        return 500
    }
}




exports.authenticateToken = authenticateJWT;
exports.generateTokens = generateTokens;
exports.refreshOldToken = refreshOldToken;