import express from 'express';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import isEmail from 'email-validator';
const saltRounds = 10;
import { dbOps } from '../database_connection/DatabaseOperations.js';
import { userLogger } from '../loggerSetup/logSetup.js';
import { authenticateJWT, refreshOldToken } from '../tokens/token_auth.js';
import { LoginResponse } from '../models/dataModels.js';
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
      if (typeof username == 'string' && typeof password == 'string') {
        const hash = await bcrypt.hash(password, saltRounds);
        // now post the user to the database
        await dbOps.insertNewUser(username, hash, email);
        return res.sendStatus(201);
      } else {
        throw new Error('username or password was not a string');
      }
    } else {
      throw new Error('Invalid email address attempted.')
    }
  } catch (error) {
    console.log(error)
    userLogger.error("Error when trying to register user:  " + error);
    res.sendStatus(500);
  }
});

router.post('/login', async (req: Request, res: Response) => {
  // Read username and password from request body
  const { username, password } = req.body;
  try {
    const loginInfo: LoginResponse = await dbOps.login(username, password);
    if (loginInfo.validUser && loginInfo.tokens && loginInfo.user) {
      res.status(200).json(loginInfo.user);
    } else {
      res.status(401).send('Invalid login info');
    }
  } catch (loginError) {
    res.status(500).send('Could not log user in')
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
    // delete the user's refresh token and access token from the database
    let loggedOut = await dbOps.logout(token);
    if (loggedOut) {
      res.status(200).send("User logged out");
    } else {
      res.status(404).send('Attempted token not found')
    }
});

router.post('/change-password', authenticateJWT, async (req: Request, res: Response) => {

  if (req.body.hasOwnProperty("username") && req.body.hasOwnProperty("oldPassword") && req.body.hasOwnProperty("newPassword") &&
      typeof req.body.username == 'string' && typeof req.body.oldPassword == 'string' && typeof req.body.newPassword == 'string') {
        const {newPassword, oldPassword, username} = req.body;

        // grab the data that I have on file
        let passwordOnFile = await dbOps.findUserAndPassword(username);
        
        if (passwordOnFile) {
          const passwordsMatch = await bcrypt.compare(oldPassword, passwordOnFile);

          if (passwordsMatch) {
            // create a hash from the new password
            let newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
  
            // swap the passwords out
            const passwordIsChanged = await dbOps.swapPasswords(passwordOnFile, newPasswordHash);
  
            res.status(200).json({message: "Password updated"});
          } else {
            res.status(403).json({message: 'That password was incorrect'});
          }
        } else {
          res.status(404).json({message: "That password wasn't in our records."})
        }

      } else {
        res.status(400);
      }
});

export default router;
