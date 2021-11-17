import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { tokenLogger, userLogger } from '../loggerSetup/logSetup.js';
import { dbOps } from '../database_connection/DatabaseOperations.js';
import { JWTUser, UserTokens } from '../models/dataModels.js';

export function authenticateJWT(req: Request, res: Response, next: NextFunction){

    if (req.headers.authorization) {
        // grab the authorization header
        const authHeader: string = req.headers.authorization;
        // if it exists, split it on the space to get the tokem
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.ACCESSTOKENSECRET!, (err: any, user: any) => {
            // if the token isn't valid, send them a forbidden code
            if (err) {
                tokenLogger.warn("Invalid access token attempted: " + err)
                return res.sendStatus(403);
            }
            // if the token is valid, attach the user and continue the request
            req.user = user as JWTUser;
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
    const accessToken: string = jwt.sign({ username: username }, process.env.ACCESSTOKENSECRET!, { expiresIn: "1h" });
    const refreshToken: string = jwt.sign({ username: username }, process.env.REFRESHTOKENSECRET!, { expiresIn: "7h" });
    // return the access and refresh tokens to the client
    return { "accessToken": accessToken, "refreshToken": refreshToken };
}

/** This function takes in the user's refresh token, verifies it and then issues a new access token to them */
export async function refreshOldToken(oldToken: string): Promise<string | number> {
    if (!oldToken) {
        return 401;
    }
    try {
        // find the user's refresh token in the database to make sure it is a VALID one
        const refresh_token = await dbOps.findRefreshToken(oldToken);
        if (!refresh_token) {
            return 403
        }
        
        // keep it this way, if their refresh token has expired they'll just have to login again and create a new one
        const user: any = jwt.verify(oldToken, process.env.REFRESHTOKENSECRET!);
        const newAccessToken = jwt.sign({ username: user.username }, process.env.ACCESSTOKENSECRET!, { expiresIn: '1h' });
        try {
            return newAccessToken
        } catch (err) {
            tokenLogger.error(`Problem updating access token for ${user.username}: ` + err);
            return 500
        }
    } catch (dbError) {
        return 401 // this could arise if the token is no longer valid, in the case the user needs to login again
    }
}