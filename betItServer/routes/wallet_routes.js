"use strict";
let express = require('express');
const fclone = require('fclone');
const jwt = require('jsonwebtoken');
let bitcoin = require("bitcoinjs-lib");
const bcrypt = require('bcrypt');
const { pool } = require('../database_connection/pool');
const { btcLogger, userLogger } = require('../loggerSetup/logSetup');
const currentNetwork = bitcoin.networks.testnet;
const axios = require('axios');
var apiMain = 'https://api.blockcypher.com/v1/btc/main'
var apiTest = 'https://api.blockcypher.com/v1/bcy/test'
let router = express.Router();

async function sendCoins(senderAddr, receiverAddr, senderPrivKey, amount) {
    // construct the transaction message
    let newtx = {
        inputs: [{ addresses: [senderAddr] }],
        outputs: [{ addresses: [receiverAddr], value: amount }]
    };

    // import private key of address I want to transfer coins from
    const keyBuffer = Buffer.from(senderPrivKey, 'hex')
    let keys = bitcoin.ECPair.fromPrivateKey(keyBuffer, currentNetwork)

    axios.post(`${apiTest}/txs/new`, JSON.stringify(newtx))
    .then((tmptx) => {
        // signing each of the hex-encoded string required to finalize the transaction
        tmptx.data.pubkeys = [];
        tmptx.data.signatures = tmptx.data.tosign.map(function (tosign, n) {
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
        axios.post(`${apiTest}/txs/send`, sendtx).then( finaltx => {
            console.log(finaltx);
            return 'Transaction has Began'
        }).catch(err => {
            console.log(err)
        });
    }).catch(err => {
        console.log(err)
    });
}

router.post('/create-wallet/:userName', async (req, res) => {
    const name = req.body.userName;
    try {
        // first generate an address for the user and pull out the data
        let addrInfo = await axios.post(`${apiTest}/addrs`, '');

        const { privateKey, publicKey, address, wif } = addrInfo.data;

        // get the address ready to generate a wallet for the user
        let walletData = {
            name,
            addresses: [address]
        }

        try {
            let walletInfo = await axios.post(`${apiTest}/wallets?token=${process.env.BLOCKCYPHER_TOKEN}`, JSON.stringify(walletData))

            // save the user's wallet info to the database for future reference
            const insertWalletPK = 'UPDATE users SET wallet_address=$1, wallet_pk=$2, wallet_public=$3 WHERE username=$4';
            const insertWalletPKValues = [address, privateKey, publicKey, name];
            const result = await pool.query(insertWalletPK, insertWalletPKValues);
            btcLogger.info(`Wallet generated for ${name}`);
            res.json({ message: 'Wallet Successfully Created', status: 200 }).end();
        } catch (err) {
            userLogger.error(`Wallet name already exists: ${err}`);
            res.json({ message: "That name is taken, choose another", error: err.message, status: 409 });
        }
    } catch (error) {
        btcLogger(`Network error occurred while generating wallet: ${error}`);
        res.end('Network error, try again later');
    }
})

router.get('/fund-master-wallet', (req, res) => {
    // Fund prior address with faucet
    var data = { "address": sendingWalletAddr, "amount": 100000 }
    axios.post(`${apiTest}/faucet?token=${process.env.BLOCKCYPHER_TOKEN}`, JSON.stringify(data))
        .then(function (d) {
            console.log(d)
            res.end('Wallet successfully funded')
        });
})

router.get('/send-to-escrow/:user1&:user2&:wagerAmount', async (req, res) => {
    // TODO: look up the user's private key in the database


    // TODO: take coins from both users once bet is made
    const firstSenderWallet = req.params.user1
    const secondSendWallet = req.params.user2

    // I will use this amount and convert it to satoshis to get the lastest value before transacting
    const wagerAmount = req.params.wagerAmount

    // TODO: Get the private keys of the two wallets I want to transfer the funds from
    const firstSenderWalletPrivateKey = ''
    const secondSenderWallet2PrivateKey = ''

    //TODO: Asynchronously call the send coins function to begin the transaction for both wallets into escrow
    let result1 = await sendCoins(firstSenderWallet, wagerAmount)
});

router.get('/pay-winner/:user', (req, res) => {

})

router.get('/get-my-address/:user', (req, res) => {

})


module.exports = router;