import express from 'express';
import { base } from '../../utils/airtableClient';
import telegramHashIsValid from '../../utils/telegramHashIsValid';

const router = express.Router();

/**
 * GET /v2/config
 *
 * @summary Get wallet config
 * @description Gets wallet config and dynamic data from Airtable
 * @tags Config
 * @security BearerAuth
 * @return {object} 200 - Success response with an array of raw airtable records
 * @return {object} 404 - Error response
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested config`);
  const configRecords: any[] = [];
  base('Config')
    .select({
      maxRecords: 100,
      view: 'API',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        records.forEach(function (record) {
          configRecords.push(record._rawJson);
        });
        fetchNextPage();
      },
      function done(error) {
        if (error) {
          console.error(
            `Error getting user ${res.locals.userId} config`,
            JSON.stringify(error)
          );
          return res.status(500).send({ msg: 'An error occurred', error });
        }
        console.log(`User [${res.locals.userId}] config request completed`);
        return res.status(200).json({ config: configRecords });
      }
    );
});

export default router;
