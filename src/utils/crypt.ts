import crypto from 'crypto';

export const encrypt = (text: any, algo = 'aes-256-cbc', format = 'base64') => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    algo,
    Buffer.from(process.env.TELEGRAM_API_HASH || ''),
    iv
  );
  // @ts-ignore
  let encrypted = cipher.update(text, 'utf-8', format);
  // @ts-ignore
  encrypted += cipher.final(format);
  // @ts-ignore
  const ivString = iv.toString(format);
  return `${ivString}.${encrypted}`;
};

export const decrypt = (text: any, algo = 'aes-256-cbc', format = 'base64') => {
  const textParts = text.split('.');
  if (textParts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }
  // @ts-ignore
  const iv = Buffer.from(textParts[0], format);
  const encryptedText = textParts[1];
  const decipher = crypto.createDecipheriv(
    algo,
    Buffer.from(process.env.TELEGRAM_API_HASH || ''),
    iv
  );
  // @ts-ignore
  let decrypted = decipher.update(encryptedText, format, 'utf-8');
  // @ts-ignore
  decrypted += decipher.final('utf-8');
  return decrypted;
};
