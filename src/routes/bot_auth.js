import express from 'express';
import 'dotenv/config';
import axios from 'axios';
import base64url from 'base64url';

const router = express.Router();

/**
 * GET /v1/bot-auth/init
 *
 * @summary Init authentication
 * @description Inits Grindery authentication for bot user.
 * @tags Authentication
 * @param {string} responsepath.query.required - FlowXO chat response path
 * @param {string} user_id.query.required - Telegram user id
 * @param {string} redirect_uri.query - Optional success redirect url
 */
router.get('/init', async (req, res) => {
  try {
    const encodedState = base64url.encode(
      JSON.stringify({
        response_path: req.query.responsepath || '',
        user_id: req.query.user_id || '',
        redirect_uri: req.query.redirect_uri || '',
      })
    );
    const currentDomain = `${req.protocol}://${req.get('host')}`;
    res.redirect(
      `https://orchestrator.grindery.org/oauth/authorize/?redirect_uri=${encodeURIComponent(
        `${currentDomain}/v1/bot-auth/callback`
      )}&response_type=code&state=${encodedState}`
    );
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/bot-auth/callback
 *
 * @summary Complete authentication
 * @description Completes Grindery authentication for Telegram user. Saves response path, user id and patchwallet address if not exists.
 * @tags Authentication
 * @param {string} code.query.required - Grindery authentication code.
 * @param {string} state.query.required - Encoded state. Contains response path, user id and redirect uri.
 */
router.get('/callback', async (req, res) => {
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://orchestrator.grindery.org/oauth/token',
      {
        code: req.query.code,
        grant_type: 'authorization_code',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const access_token = tokenResponse.data.access_token;

    // Get user email using the access token
    const userPropsResponse = await axios.post(
      'https://orchestrator.grindery.org',
      {
        jsonrpc: '2.0',
        method: 'or_getUserProps',
        id: new Date(),
        params: {
          props: [
            'email',
            'telegram_user_id',
            'patchwallet_telegram',
            'response_path',
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const decodeState = JSON.parse(base64url.decode(String(req.query.state)));

    if (
      !userPropsResponse.data.result ||
      !userPropsResponse.data.result.email
    ) {
      return res.status(400).json({ error: 'Email is missing' });
    }

    if (
      userPropsResponse.data.result.patchwallet_telegram &&
      userPropsResponse.data.result.telegram_user_id &&
      userPropsResponse.data.result.response_path
    ) {
      return res.redirect(
        decodeState.redirect_uri || `https://app.grindery.io/`
      );
    }

    // Get user PatchWallet address
    const patchWalletResponse = await axios.post(
      'https://paymagicapi.com/v1/resolver',
      {
        userIds: `grindery:${decodeState.user_id}`,
      }
    );

    const patchwalletAddress = patchWalletResponse.data.users[0].accountAddress;

    // Update user informations
    const updateUserResponse = await axios.post(
      'https://orchestrator.grindery.org',
      {
        jsonrpc: '2.0',
        method: 'or_updateUserProps',
        id: new Date(),
        params: {
          props: {
            email: userPropsResponse.data.result.email || null,
            response_path: decodeState.response_path,
            telegram_user_id: decodeState.user_id,
            patchwallet_telegram: patchwalletAddress,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (updateUserResponse.data.result) {
      res.redirect(decodeState.redirect_uri || `https://app.grindery.io/`);
    } else {
      res.status(400).json({ error: 'Hubspot information update failed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
