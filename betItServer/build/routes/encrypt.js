"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var crypto = require('crypto');
var algorithm = 'aes-256-cbc';
// passphrase used to generate key
var pwForSecretKey = process.env.ENCRYPTIONSECRETKEY;
var iv = Buffer.alloc(16, 0); // Initialization vector.
function encryptKey(key) {
    // create the cipher using the key
    try {
        var cipher = crypto.createCipheriv(algorithm, process.env.ENCRYPTIONSECRETKEY, iv);
        var encrypted = cipher.update(key, 'utf-8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    catch (e) {
        console.log(e);
    }
}
function decryptKey(key) {
    var decipher = crypto.createDecipheriv(algorithm, process.env.ENCRYPTIONSECRETKEY, iv);
    var decrypted = decipher.update(key, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}
module.exports = { decryptKey: decryptKey, encryptKey: encryptKey };
