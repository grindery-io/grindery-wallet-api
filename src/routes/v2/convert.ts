import express from 'express';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
const router = express.Router();

/**
 * GET /v2/convert
 *
 * @summary Get GX convert quote
 * @description Gets GX token convertion quote
 * @tags Convert
 * @security BearerAuth
 * @param {string} convert.query - amount of g1 tokenbs to convert
 * @param {string} add.query - usd amount to add
 * @return {object} 200 - Success response
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested convert quote`);
  try {
    // TODO: calculate convertion quote
    const result = '0';
    console.log(`User [${res.locals.userId}] convert quote request completed`);
    return res.status(200).send({ result });
  } catch (error) {
    console.error(
      `Error getting g1 convertion quote for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
