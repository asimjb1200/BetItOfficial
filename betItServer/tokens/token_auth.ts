"use strict";
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { tokenLogger, userLogger } from '../loggerSetup/logSetup.js';
import { dbOps } from '../database_connection/DatabaseOperations.js';
import { UserTokens } from '../models/dataModels.js';
const tokenSecret: string = process.env.ACCESSTOKENSECRET ? process.env.ACCESSTOKENSECRET : '';
const refreshTokenSecret: string = process.env.REFRESHTOKENSECRET ? process.env.REFRESHTOKENSECRET : '';

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {

    if (req.headers.authorization) {
        // grab the authorization header
        const authHeader: string = req.headers.authorization;
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, tokenSecret, (err: any, user: any) => {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                tokenLogger.warn("Invalid access token attempted: " + err)
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

export function generateTokens(username: string): UserTokens {
    // Generate an access & refresh token
    const accessToken: string = jwt.sign({ username: username }, tokenSecret, { expiresIn: '5m' });
    const refreshToken: string = jwt.sign({ username: username }, refreshTokenSecret, { expiresIn: '30m' });

    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken };
}

export async function refreshOldToken(oldToken: string): Promise<string | number> {
    if (!oldToken) {
        return 401;
    }
    try {
        // find the user's refresh token in the database
        const refresh_token = await dbOps.findRefreshToken(oldToken);
        if (!refresh_token) {
            return 403
        }
        const user: any = await jwt.verify(oldToken, refreshTokenSecret);
        const newAccessToken = jwt.sign({ username: user.username }, tokenSecret, { expiresIn: '30m' });
        try {
            // save the user's new access token to the db
            await dbOps.updateAccessToken(newAccessToken, oldToken);
            return newAccessToken
        } catch (err) {
            tokenLogger.error(`Problem updating access token for ${user.username}: ` + err);
            return 500
        }
    } catch (dbError) {
        return 500
    }
}