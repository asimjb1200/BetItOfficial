export { };
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { DatabaseUserModel, UserModel } from '../models/dataModels.js';
import bcrypt from 'bcrypt';
import isEmail from 'email-validator';
const saltRounds = 10;
import { dbOps } from '../database_connection/DatabaseOperations.js';
import * as tokenHandler from '../tokens/token_auth.js';
import { userLogger } from '../loggerSetup/logSetup.js';
import { authenticateJWT, refreshOldToken } from '../tokens/token_auth.js';
let router = express.Router();

/* check your token */
router.get('/check-token', authenticateJWT, function (req: Request, res: Response) {
  res.send({ message: 'Access Token Valid', status: 200 });
});

/* Register a user */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  const { username, password, email } = req.body;

  try {
    if (isEmail.validate(email)) {
      const hash = await bcrypt.hash(password, saltRounds);
      // now post the user to the database
      dbOps.insertNewUser(username, hash, email);
      return res.sendStatus(200);
    } else {
      throw new Error()
    }
  } catch (error) {
    userLogger.error("Error when trying to register user:  " + error);
    res.sendStatus(500);
  }
});

router.post('/login', async (req: Request, res: Response) => {
  // Read username and password from request body
  const { username, password } = req.body;
  try {
    let loginInfo = await dbOps.login(username, password);
    if (loginInfo.validUser && loginInfo.tokens) {
      res.send({"accessToken": loginInfo.tokens.accessToken, "refreshToken": loginInfo.tokens.refreshToken});
    }
  } catch (loginError) {
    res.send({"message": `Could not log user in: ${loginError}`, "status":500});
  }
});

router.post('/refresh-token', async (req: Request, res: Response) => {
  const { token } = req.body;
  const result = await refreshOldToken(token);
  if (typeof result === 'string') {
    res.json({
      result
    });
  } else {
    res.sendStatus(result)
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const { token } = req.body;

  try {
    // delete the user's refresh token and access token from the database
    await dbOps.logout(token);
    res.json({ message: "User logged out", status: 200 });
  } catch (error) {
    userLogger.error(`Error when logging user out: ${error}`);
    res.json({ message: "User logged out", status: 200 });
  }
});

export default router;
