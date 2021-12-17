import express from 'express';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import isEmail from 'email-validator';
const saltRounds = 10;
import { dbOps, sportOps } from '../database_connection/DatabaseOperations.js';
import { mainLogger, userLogger } from '../loggerSetup/logSetup.js';
import { authenticateJWT, refreshOldToken } from '../tokens/token_auth.js';
import { LoginResponse } from '../models/dataModels.js';
import { emailHelper } from '../EmailNotifications/EmailWorker.js';
import { body, check, validationResult } from 'express-validator';
import axios from 'axios';
let router = express.Router();

/* check your token */
router.get('/check-token', authenticateJWT, function (req: Request, res: Response) {
  res.send({ message: 'Access Token Valid', status: 200 });
});

/* Register a user */
router.post('/register',
  [
    check('email').isEmail().normalizeEmail(),
    check('username').isAlphanumeric().notEmpty().trim().escape(),
    check('password').notEmpty().isLength({min: 8, max: 16}).trim().escape()
  ], 
  async (req: Request, res: Response) => {
    // validationResult function checks whether errors occurs or not and return an object
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() })
    }
    const { username, password, email } = req.body;

    try {
      const hash = await bcrypt.hash(password, saltRounds);
      
      // now post the user to the database
      await dbOps.insertNewUser(username, hash, email);
      return res.sendStatus(201);
    } catch (error) {
      userLogger.error("Error when trying to register user:  " + error);
      res.sendStatus(500);
    }
});

router.post(
  '/login',
  [
    check('username').notEmpty().isAlphanumeric().trim().escape(),
    check('password').notEmpty().isLength({min: 8, max: 16}).trim().escape()
  ], 
  async (req: Request, res: Response) => {
    const errors = validationResult(req);

    // TODO: remove the attempted password from the errors array that is returned
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() })
    }
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

router.post(
  '/change-password',
  [
    authenticateJWT,
    check('username', 'Please use only text and alphanumeric characters').exists().isString().isAlphanumeric().notEmpty().trim().escape(),
    check('oldPassword', 'Please use only alphanumeric characters and make the length between 8-16 chars').exists().isString().isAlphanumeric().notEmpty().trim().isLength({min: 8, max: 16}).escape(),
    check('newPassword', 'Please use only alphanumeric characters and make the length between 8-16 chars').exists().isString().isAlphanumeric().notEmpty().trim().isLength({min: 8, max: 16}).escape()
  ], 
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() })
    }
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

        return res.status(200).json({message: "Password updated"});
      } else {
        return res.status(403).json({message: 'That password was incorrect'});
      }
    } else {
      return res.status(404).json({message: "That password wasn't in our records."})
    }
});

router.post(
  '/email-support',
  [
    authenticateJWT,
      check('subject', 'Please use only alphanumeric characters').exists().isAlphanumeric().notEmpty().trim().escape(),
      check('message', 'Please use only alphanumeric characters').exists().notEmpty().isAlphanumeric().trim().escape()
  ], 
  async (req: Request, res: Response) => {
  // grab the details from the request
  let {subject, message} = req.body;

  // grab the user's email
  let emailAddress = await dbOps.getUserEmail(req.user?.username!);

  // pre-pend the user's email to the message
  const newMessage = `<p><strong>Message From User: ${req.user?.username} (${emailAddress})</strong> <br>${message}</p>`;
  
  try {
    // send the email to the support email
    await emailHelper.emailSupport("support@bet-it-casino.com", subject, newMessage);
    return res.status(200).json("support request received.");
  } catch (err) {
    mainLogger.error("Something went wrong when trying to deliver a support email: " + err);
    return res.status(500).json("failed to deliver email");
  }
});

// router.get('/load-db', async (req: Request, res: Response) => {
//   const gamesLoaded = await sportOps.insertAllGamesForSeason();
//    if (gamesLoaded == "Done") {
//      return res.status(200).json("games loaded");
//    } else {
//      return res.status(500).json("an error occurred");
//    }
// });

router.post(
  '/change-email', 
  [
    authenticateJWT,
    check('username').exists().notEmpty().isAlphanumeric(),
    check('password').exists().notEmpty().isAlphanumeric().isLength({min: 8, max: 16}),
    check('newEmail').exists().notEmpty().isEmail().normalizeEmail()
  ], 
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() })
    }
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