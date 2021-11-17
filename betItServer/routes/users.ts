import express from 'express';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import isEmail from 'email-validator';
const saltRounds = 10;
import { dbOps } from '../database_connection/DatabaseOperations.js';
import { userLogger } from '../loggerSetup/logSetup.js';
import { authenticateJWT, refreshOldToken } from '../tokens/token_auth.js';
import { LoginResponse } from '../models/dataModels.js';
import { emailHelper } from '../EmailNotifications/EmailWorker.js';
let router = express.Router();

/* check your token */
router.get('/check-token', authenticateJWT, function (req: Request, res: Response) {
  res.send({ message: 'Access Token Valid', status: 200 });
});

router.get('/test-emailer', async (req: Request, res: Response) => {
  try {
    let msgSent = await emailHelper.sendEmails();
    res.status(200).json({msgSent});
  } catch (err) {
    console.error
    res.status(500).json({msg: `${err}`});
  }
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
    res.json(result);
  } else {
    res.status(result).send("your refresh token has expired. Login again")
  }
});

router.post('/logout', authenticateJWT, async (req: Request, res: Response) => {
    // delete the user's refresh token from the database
    if (req.user?.username) {
      let loggedOut = await dbOps.logout(req.user.username);
      if (loggedOut) {
        res.status(200).send("User logged out");
      } else {
        res.status(404).send('Attempted token not found')
      }
    } else {
      userLogger.info("A user wasn't attached to the request object when trying to logout.");
      res.status(500).send("An error on the server occurred.")
    }
});

router.post('/change-password', authenticateJWT, async (req: Request, res: Response) => {

  if (req.body.hasOwnProperty("username") && req.body.hasOwnProperty("oldPassword") && req.body.hasOwnProperty("newPassword") &&
      typeof req.body.username == 'string' && typeof req.body.oldPassword == 'string' && typeof req.body.newPassword == 'string') {
        const {newPassword, oldPassword, username} = req.body;

        // grab the data that I have on file
        let passwordHashOnFile = await dbOps.findUserAndPassword(username);
        
        if (passwordHashOnFile) {
          const passwordsMatch = await bcrypt.compare(oldPassword, passwordHashOnFile);

          if (passwordsMatch) {
            // create a hash from the new password
            let newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
  
            // swap the passwords out
            const passwordIsChanged = await dbOps.swapPasswords(passwordHashOnFile, newPasswordHash);

            // send an email to the user
            let email = await dbOps.getUserEmail(username);
            await emailHelper.emailUser(email, "Your Password Has Been Updated", "If you didn't initiate this contact us immediately.");

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

router.post('/change-email', authenticateJWT, async (req: Request, res: Response) => {
  const {username, password, newEmail} = req.body;
  // make sure the password is the correct one for the user
  let passwordHashOnFile = await dbOps.findUserAndPassword(username);

  if (passwordHashOnFile) {
    const passwordsMatch = await bcrypt.compare(password, passwordHashOnFile);

    if (passwordsMatch) {
      const emailUpdated = await dbOps.updateEmail(username, newEmail);
      if (emailUpdated) {
        await emailHelper.emailUser(newEmail, "Your Email Address Has Been Updated", "If you didn't make this change contact us.");
        res.status(200).json({message: "Email updated."});
      } else {
        res.status(500).json({message: "There was an error updating the email."});
      }
    } else {
      res.status(403).json({message: "Wrong password for that account"});
    }
  } else {
    res.status(404).json({message: "That user doesn't exist."});
  }
});

export default router;
