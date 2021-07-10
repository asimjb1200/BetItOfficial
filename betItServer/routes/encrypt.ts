import crypto from 'crypto';
var CIPHER_ALGORITHM = 'aes-256-ctr';
const secretKey: string = process.env.ENCRYPTIONSECRETKEY as string;

const encrypt = (text: string) => {
  let sha256 = crypto.createHash('sha256');
  sha256.update(String.prototype.normalize(secretKey)); // this ensures the key is ALWAYS 256 bits
  
  // Initialization Vector
  let iv = crypto.randomBytes(16); // randomization to ensure no to crypted strings are the same
  let cipher = crypto.createCipheriv(CIPHER_ALGORITHM, sha256.digest(), iv);

  let buffer = Buffer.from(text);

  let ciphertext = cipher.update(buffer);
  let encrypted = Buffer.concat([iv, ciphertext, cipher.final()]);
  return encrypted.toString('base64');
};
  
const decrypt = (encrypted: string) => {
  let text = Buffer.from(encrypted, 'base64');
  let sha256 = crypto.createHash('sha256');
  sha256.update(String.prototype.normalize(secretKey)); 
  // Initialization Vector
  let iv = text.slice(0, 16);
  let decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, sha256.digest(), iv);

  let ciphertext = text.slice(16);
  const output = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return output.toString()
};

export { encrypt, decrypt };