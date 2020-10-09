const jwt = require('jsonwebtoken');
const {pool} = require('../database_connection/pool');
let refreshTokens = [];

function authenticateJWT(req, res, next) {
    // grab the authorization header
    const authHeader = req.headers.authorization;

    if (authHeader) {
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.ACCESSTOKENSECRET, (err, user) => {
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

function generateTokens(username) {
    console.log(username)
    // Generate an access & refresh token
    const accessToken = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET, { expiresIn: '3m' });
    const refreshToken = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET, { expiresIn: '10m' });

    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken }
}

function refreshOldToken(token) {
    if (!token) {
        return 401;
    }

    if (!refreshTokens.includes(token)) {
        return 403;
    }
    // find the user's refresh token in the database
    jwt.verify(token, process.env.REFRESHTOKENSECRET, (err, user) => {
        if (err) {
            return 403;
        } else {

            const accessToken = jwt.sign({ username: user.username }, process.env.ACCESSTOKENSECRET, { expiresIn: '1m' });

            return accessToken
        }
    });
}




exports.authenticateToken = authenticateJWT;
exports.generateTokens = generateTokens;
exports.refreshOldToken = refreshOldToken;