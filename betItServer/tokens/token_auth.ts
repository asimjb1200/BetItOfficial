"use strict";
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../database_connection/pool.js';
import { userLogger } from '../loggerSetup/logSetup.js';
const tokenSecret: string = process.env.ACCESSTOKENSECRET ? process.env.ACCESSTOKENSECRET : '';
const refreshTokenSecret: string = process.env.REFRESHTOKENSECRET ? process.env.REFRESHTOKENSECRET : '';

export function authenticateJWT(req: any, res: Response, next: NextFunction): void {
    // grab the authorization header
    const authHeader: string = req.headers.authorization;

    if (authHeader) {
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, tokenSecret, (err: any, user: any) => {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                userLogger.warn("Invalid access token attempted: " + err)
                return res.sendStatus(403);
            }
            // if the token is valid, attach the user and continue the request
            req.user = user;
            next();
        });
    } else {
        // if no auth header, show an unauthorized code
        userLogger.error("Unauthorized access attempted. No auth header present");
        res.sendStatus(401);
    }
};

export function generateTokens(username: string): {accessToken: string, refreshToken: string} {
    // Generate an access & refresh token
    const accessToken: string = jwt.sign({ username: username }, tokenSecret, { expiresIn: '5m' });
    const refreshToken: string = jwt.sign({ username: username }, refreshTokenSecret, { expiresIn: '30m' });

    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken }
}

export async function refreshOldToken(oldToken: string): Promise<string|number> {
    if (!oldToken) {
        return 401;
    }
    // find the user's refresh token in the database
    const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
    const findRefreshValues = [oldToken]
    try {
        const {refresh_token} = (await pool.query(findRefresh, findRefreshValues)).rows[0];
        if (!refresh_token) {
            return 403
        }
        const user: any = await jwt.verify(oldToken, refreshTokenSecret);
        const newAccessToken = jwt.sign({ username: user.username }, tokenSecret, { expiresIn: '30m' });
        // save the user's new access token to the db
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1 WHERE refresh_token=$2';
        const insertAccessTokenQueryValues = [newAccessToken, oldToken];
        try {
            const tokenInserted = await pool.query(insertAccessTokenQuery, insertAccessTokenQueryValues);
            console.log(tokenInserted)
            return newAccessToken
        } catch(err) {
            console.log(err)
            return 500
        } 
    } catch(dbError) {
        return 500
    }
}