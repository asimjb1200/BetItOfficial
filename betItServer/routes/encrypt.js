const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
// passphrase used to generate key
const pwForSecretKey = process.env.ENCRYPTIONSECRETKEY;
const iv = Buffer.alloc(16, 0); // Initialization vector.

function encryptKey(key) {
    // create the cipher using the key
    try {
        let cipher = crypto.createCipheriv(algorithm, pwForSecretKey, iv);
        console.log(cipher)
        let encrypted = cipher.update(key, 'utf-8', 'hex');
        encrypted += cipher.final('hex');
        console.log(encrypted)
        return encrypted;
    } catch (e) {
        console.log(e);
    }
}

function decryptKey(key) {
    let decipher = crypto.createDecipheriv(algorithm, pwForSecretKey, iv);
    let decrypted = decipher.update(key, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

module.exports = {decryptKey, encryptKey};