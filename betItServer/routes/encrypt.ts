export {};
import crypto from 'crypto';
const algorithm = 'aes-256-gcm';
// passphrase used to generate key
const pwForSecretKey: string = process.env.ENCRYPTIONSECRETKEY ? process.env.ENCRYPTIONSECRETKEY : '';
const iv: Buffer = Buffer.alloc(16, 0); // Initialization vector.

function encryptKey(key: any) {
    // create the cipher using the key
    try {
        let cipher = crypto.createCipheriv(algorithm, pwForSecretKey, iv);

        let encrypted = cipher.update(key, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (e) {
        console.log(e);
    }
}

function decryptKey(key: any) {
    let decipher = crypto.createDecipheriv(algorithm, pwForSecretKey, iv);
    let decrypted = decipher.update(key, 'hex', 'utf8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

export {decryptKey, encryptKey};