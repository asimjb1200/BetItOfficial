import crypto from 'crypto';
let CIPHER_ALGORITHM = 'aes-256-ctr';
const secretKey: string = process.env.ENCRYPTIONSECRETKEY as string;

/** using ctr encryption, therefore the plain text message doesn't
 * have to be any particular size (in bytes) for it to work.
 */
const encrypt = (text: string) => {
  let sha256 = crypto.createHash('sha256');
  sha256.update(secretKey.normalize()); // this ensures the key is ALWAYS 256 bits
  
  // Initialization Vector
  let iv = crypto.randomBytes(16); // randomization to ensure no to crypted strings are the same
  let cipher = crypto.createCipheriv(CIPHER_ALGORITHM, sha256.digest(), iv);

  let buffer = Buffer.from(text);

  let ciphertext = cipher.update(buffer);
  let encrypted = Buffer.concat([iv, ciphertext, cipher.final()]);
  return encrypted.toString('base64'); // turn the binary data into a text string for storage
};
  
const decrypt = (encrypted: string) => {
  let text = Buffer.from(encrypted, 'base64'); // turn the text string back into binary data
  let sha256 = crypto.createHash('sha256');
  sha256.update(secretKey.normalize()); 
  // Initialization Vector
  const iv = text.slice(0, 16);
  let decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, sha256.digest(), iv);

  let ciphertext = text.slice(16);
  const output = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return output.toString()
};

export { encrypt, decrypt };