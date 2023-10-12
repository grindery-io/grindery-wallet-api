import axios from 'axios';
import jwt_decode from 'jwt-decode';
import { webcrypto } from 'crypto';

export const checkToken = async (token, workspaceKey) => {
  try {
    await axios.post(
      'https://orchestrator.grindery.org',
      {
        jsonrpc: '2.0',
        method: 'or_listWorkflows',
        id: new Date(),
        params: {
          ...(typeof workspaceKey !== 'undefined' && { workspaceKey }),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (err) {
    throw new Error(
      (err && err.response && err.response.data && err.response.data.message) ||
        err.message ||
        'Invalid token'
    );
  }
};

export const isRequired = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({ message: 'No credentials sent' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: 'Wrong authentication method' });
  }

  const token = authHeader.substring(7, authHeader.length);
  try {
    await checkToken(token);
  } catch (err) {
    return res.status(401).json({
      message:
        (err &&
          err.response &&
          err.response.data &&
          err.response.data.message) ||
        err.message,
    });
  }
  const user = jwt_decode(token);
  res.locals.userId = user.sub;
  res.locals.workspaceId = user.workspace;

  next();
};

export const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).send({
      msg: 'Missing API key in headers',
    });
  }
  if (apiKey !== `Bearer ${process.env.API_KEY}`) {
    return res.status(401).send({
      msg: 'Invalid API key',
    });
  }
  next();
};

export const telegramHashIsValid = async (req, res, next) => {
  if (!process.env.BOT_TOKEN) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  const authorization = req.headers['authorization'];
  const hash = authorization.split(' ')[1];
  const data = Object.fromEntries(new URLSearchParams(hash));
  const encoder = new TextEncoder();
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash')
    .map((key) => `${key}=${data[key]}`)
    .sort()
    .join('\n');
  const secretKey = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const secret = await webcrypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(process.env.BOT_TOKEN)
  );
  const signatureKey = await webcrypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    signatureKey,
    encoder.encode(checkString)
  );
  const hex = Buffer.from(signature).toString('hex');
  const isValid = data.hash === hex;
  if (!isValid) {
    return res.status(403).json({ error: 'User is not authenticated' });
  }
  next();
};
