export {};
import { Request, Response } from 'express';
let express = require('express');
const fclone = require('fclone');
let bitcoin = require("bitcoinjs-lib");
// const bcrypt = require('bcrypt');
const saltRounds = 10;
const { pool } = require('../database_connection/pool');
const { btcLogger, mainLogger } = require('../loggerSetup/logSetup');
const currentNetwork = bitcoin.networks.testnet;
const axios = require('axios');
const apiMain = 'https://api.blockcypher.com/v1/btc/main';
const apiTest = 'https://api.blockcypher.com/v1/bcy/test';
const {encryptKey, decryptKey} = require('./encrypt');
let router = express.Router();

async function sendCoins(senderAddr: string, receiverAddr: string, senderPrivKey: string, amount: number) {
    // construct the transaction message
    let newtx = {
        inputs: [{ addresses: [senderAddr] }],
        outputs: [{ addresses: [receiverAddr], value: amount }]
    };

    // import private key of address I want to transfer coins from
    const keyBuffer = Buffer.from(senderPrivKey, 'hex')
    let keys = bitcoin.ECPair.fromPrivateKey(keyBuffer, currentNetwork)

    axios.post(`${apiTest}/txs/new`, JSON.stringify(newtx))
        .then((tmptx: any) => {
            // signing each of the hex-encoded string required to finalize the transaction
            tmptx.data.pubkeys = [];
            tmptx.data.signatures = tmptx.data.tosign.map(function (tosign: any, n: any) {
                tmptx.data.pubkeys.push(keys.publicKey.toString('hex'));

                return bitcoin.script.signature.encode(
                    keys.sign(Buffer.from(tosign, "hex")),
                    0x01,
                ).toString("hex").slice(0, -2);
            });

            // remove circular references in the object
            let circularsRemoved = fclone(tmptx)

            let sendtx = {
                tx: circularsRemoved.data.tx,
                tosign: circularsRemoved.data.tosign,
                signatures: circularsRemoved.data.signatures,
                pubkeys: circularsRemoved.data.pubkeys
            };

            // sending back the transaction with all the signatures to broadcast
            axios.post(`${apiTest}/txs/send`, JSON.stringify(sendtx)).then((finaltx: any) => {
                console.log(finaltx);
                return 'Transaction has Began'
            }).catch((err: any) => {
                console.log(err)
            });
        }).catch((err: any) => {
            console.log(err)
        });
}

router.post('/test-encryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const encryptedText = encryptKey(plainPrivateKey);
    res.send(encryptedText);
});

router.post('/test-decryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const decryptedText = decryptKey(plainPrivateKey);
    res.send(decryptedText);
});

router.post('/create-wallet/:userName', async (req: Request, res: Response) => {
    const name = req.params.userName;
    try {
        // first generate an address for the user and pull out the data
        let addrInfo = await axios.post(`${apiTest}/addrs`, '');

        // const { privateKey, publicKey, address, wif } = addrInfo.data;
        const privateKey = addrInfo.data.private;
        // dont need the public key if I have the address, serves the same purpose
        const { address } = addrInfo.data;

        // get the address ready to generate a wallet for the user
        let walletData = {
            name,
            addresses: [address]
        }
        // encrypt the private key so that it isn't stored in plain text in the database
        try {
            const walletInfo = await axios.post(`${apiTest}/wallets?token=${process.env.BLOCKCYPHER_TOKEN}`, walletData);
            const encryptedPrivateKey = encryptKey(privateKey)
            const insertWalletPK = 'UPDATE users SET wallet_address=$1, wallet_pk=$2 WHERE username=$3';
            const insertWalletPKValues = [address, encryptedPrivateKey, name];
            const result = await pool.query(insertWalletPK, insertWalletPKValues);
            btcLogger.info(`Wallet generated for ${name}`);
            res.json({ message: 'Wallet Successfully Created', status: 200 });
        } catch (err) {
            btcLogger.error(`Issue creating wallet: '${err.response.config.method}', '${err.response.config.data}',  '${err.response.config.url}',  '${err.response.data.error}'`);
            res.json({ message: "Issue creating wallet", error: err.message, status: 409 });
        }
    } catch (error) {
        btcLogger.error(`Error occurred while generating wallet: ${error}`);
        res.end('Error, try again later');
    }
})

router.get('/fund-master-wallet', (req: Request, res: Response) => {
    // Fund prior address with faucet
    let data = { "address": "12343", "amount": 100000 }
    axios.post(`${apiTest}/faucet?token=${process.env.BLOCKCYPHER_TOKEN}`, JSON.stringify(data))
        .then(function (d: any) {
            console.log(d)
            res.end('Wallet successfully funded')
        });
})

router.post('/send-to-escrow', async (req: Request, res: Response) => {
    const { user1, user2, wagerAmount } = req.body;

    try {
        // look up the user's private key in the database
        const lookupKeyQuery = 'SELECT wallet_address, wallet_pk FROM users WHERE username=$1 OR username=$2';
        const lookupValues = [user1, user2]
        const walletInfo = await pool.query(lookupKeyQuery, lookupValues);

        const user1_encryptedPrivateKey = walletInfo.rows[0].wallet_pk;
        const user1_walletAddr = walletInfo.rows[0].wallet_address;

        const user2_encryptedPrivateKey = walletInfo.rows[1].wallet_pk;
        const user2_walletAddr = walletInfo.rows[1].wallet_address;

        // undo the encryptions and then begin the transaction process
        const user1_plainPrivateKey = decryptKey(user1_encryptedPrivateKey);
        const user2_plainPrivateKey = decryptKey(user2_encryptedPrivateKey);
        // Asynchronously call the send coins function to begin the transaction for both wallets into escrow
        let result1 = await sendCoins(user1_walletAddr, 'BwkDigsf8pBsk2BwpPWD9KTMzoQGcxbxnA', user1_plainPrivateKey, wagerAmount);
        let result2 = await sendCoins(user2_walletAddr, 'BwkDigsf8pBsk2BwpPWD9KTMzoQGcxbxnA', user2_plainPrivateKey, wagerAmount);
        res.send('Transaction has began');
    } catch (error) {
        console.log(error);
        res.json({message: 'failed terribly'})
    }
});

router.get('/pay-winner/:user', (req: Request, res: Response) => {

})

router.get('/get-my-address/:user', (req: Request, res: Response) => {

})


module.exports = router;