import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import { authenticateApiKey } from '../utils/auth.js';
import {
  handleNewReward,
  handleNewTransaction,
  handleNewUser,
} from '../utils/webhook.js';

/**
 * This is a generic and extendable implementation of a webhook endpoint and pub/sub messages queue.
 * It can be used to catch any webhook event and push it to the queue for processing.
 *
 * Add new events to the switch statement in the messageHandler function.
 * Events that are not defined in switch statement will be acknowledged and removed from the queue by default.
 */

// Init pub/sub client
const pubSubClient = new PubSub();

// Get topic and subscription names from env
const topicName = process.env.PUBSUB_TOPIC_NAME;
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION_NAME;

const router = express.Router();

/**
 * POST /v1/webhook
 *
 * @summary Catch a webhook
 * @description Catches a webhook event and pushes it to the queue for processing.
 * @tags Webhook
 * @security BearerAuth
 * @param {object} request.body - The request body containing the event name and params
 * @return {object} 200 - Success response with message ID
 * @example request - 200 - Example request body
 * {
 *   "event": "event_name",
 *   "params": { "param1": "value1" }
 * }
 * @example response - 200 - Success response example
 * {
 *   "success": true,
 *   "messageId": "some-uuid"
 * }
 *
 * @example response - 500 - Error response example
 * {
 *   "success": false,
 *   "error": "error message"
 * }
 */
router.post('/', authenticateApiKey, async (req, res) => {
  try {
    const data = JSON.stringify(req.body);
    console.log(`Publishing message: ${data}`);
    const dataBuffer = Buffer.from(data);
    const messageId = await pubSubClient
      .topic(topicName)
      .publishMessage({ data: dataBuffer });
    if (messageId) {
      res.json({ success: true, messageId });
    } else {
      res.status(500).json({ success: false, error: "Event wasn't saved" });
    }
  } catch (error) {
    console.error(`Received error while publishing: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Subscribe to messages from Pub/Sub
const listenForMessages = () => {
  // get subscription
  const subscription = pubSubClient.subscription(subscriptionName);

  // Process and acknowledge pub/sub message
  const messageHandler = async (message) => {
    const messageDataString = message.data.toString();
    const messageData = JSON.parse(messageDataString);
    console.log('Received message:', JSON.stringify(messageData, null, 2));

    try {
      let processed = false; // Has event been processed. If not, message will be requeued.

      // Handle events below. If event is not specified, message will be acknowledged and removed from the queue.

      // Example events:
      switch (messageData.event) {
        // User initiated new transaction
        case 'new_transaction':
          processed = await handleNewTransaction(messageData.params);
          break;
        // User initiated new transaction batch
        case 'new_transaction_batch':
          for (let singleTransaction of messageData.params) {
            // Publishing each transaction as a new event
            const transactionEvent = {
              event: 'new_transaction',
              params: singleTransaction,
            };
            const transactionDataBuffer = Buffer.from(
              JSON.stringify(transactionEvent)
            );
            await pubSubClient
              .topic(topicName)
              .publishMessage({ data: transactionDataBuffer });
          }
          processed = true;
          break;
        // New user started the bot
        case 'new_user':
          processed = await handleNewUser(messageData.params);
          break;
        // New reward has been issued to user
        case 'new_reward':
          processed = await handleNewReward(messageData.params);
          break;
        default:
          processed = true;
          break;
      }

      if (!processed) {
        throw new Error('Error processing event');
      }

      console.log(
        'Acknowledged message:',
        JSON.stringify(messageData, null, 2)
      );
      message.ack(); // "Ack" (acknowledge receipt of) the message
    } catch (error) {
      console.error('messageHandler error:', error);
      message.nack(); // "Nack" (don't acknowledge receipt of) the message
    }
  };

  subscription.on('message', messageHandler);
};

// Start listening for pub/sub messages
//listenForMessages();

export default router;
