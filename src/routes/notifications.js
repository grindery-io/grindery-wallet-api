import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import grinderyClient from 'grindery-nexus-client';
import { generateWorkflow } from '../utils/generateWorkflow.js';

const NexusClient = grinderyClient.default;

const router = express.Router();

const GRINDERY_ACCOUNT_REFRESH_TOKEN =
    process.env.GRINDERY_ACCOUNT_REFRESH_TOKEN,
  GRINDERY_ACCOUNT_WORKSPACE_KEY = process.env.GRINDERY_ACCOUNT_WORKSPACE_KEY,
  WALLET_NOTIFICATION_WEBHOOK_URL = process.env.WALLET_NOTIFICATION_WEBHOOK_URL;

/**
 * POST /v1/notifications/wallet
 *
 * @summary Create wallet notification
 * @description Creates a webhook workflows with wallet and erc20 transactions triggers.
 * @tags Notifications
 * @param {object} request.body - The request body containing necessary information.
 * @return {object} 200 - Success response
 * @return {object} 400 - Error response
 * @return {object} 500 - Error response
 * @example request - 200 - Example request body
 * {
 *   "webhook": "https://example.com",
 *   "responsepath": "response_path",
 *   "address": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5",
 *   "phone": "1234567"
 * }
 * @example response - 200 - Success response example
 * {
 *   "success": true,
 *   "message": "Notification created"
 * }
 * @example response - 400 - Error response example
 * {
 *   "error": "webhook is required"
 * }
 * @example response - 500 - Error response example
 * {
 *   "error": "Server error"
 * }
 */
router.post('/wallet', async (req, res) => {
  if (!req.body.webhook) {
    return res.status(400).json({ error: "'webhook' is required" });
  }
  if (!req.body.responsepath) {
    return res.status(400).json({ error: "'responsepath' is required" });
  }
  if (!req.body.address && !req.body.phone) {
    return res.status(400).json({ error: "'address' or 'phone' is required" });
  }

  try {
    // get access token for grindery account
    const getAccessToken = await axios.post(
      'https://orchestrator.grindery.org/oauth/token',
      {
        refresh_token: GRINDERY_ACCOUNT_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      },
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const accessToken = getAccessToken.data.access_token;

    // authenticate grindery client
    const client = new NexusClient(accessToken);

    // get creator user id
    const creator = client.user.get().id;

    // get list of evm chains
    const chains = await client.chain.list({
      type: 'evm',
      environment: 'production',
    });

    let address = req.body.address;
    if (!address) {
      const patchWalletResponse = await axios.post(
        'https://paymagicapi.com/v1/resolver',
        {
          userIds: `tel:${req.body.phone}`,
        }
      );
      address = patchWalletResponse.data.users[0].accountAddress;
    }

    // generate workflows
    const walletWorkflow = generateWorkflow({
      address,
      webhook: req.body.webhook,
      responsepath: req.body.responsepath,
      trigger: 'evmWallet',
      chains: chains.map((chain) => chain.value),
      creator,
    });
    const erc20Workflow = generateWorkflow({
      address,
      webhook: req.body.webhook,
      responsepath: req.body.responsepath,
      trigger: 'erc20',
      chains: chains.map((chain) => chain.value),
      creator,
    });

    const workflows = await client.workflow.list({
      workspaceKey: GRINDERY_ACCOUNT_WORKSPACE_KEY,
    });

    const walletWorkflowExists = workflows.find(
      (workflow) => workflow.workflow.title === walletWorkflow.title
    );
    const erc20WorkflowExists = workflows.find(
      (workflow) => workflow.workflow.title === erc20Workflow.title
    );

    // check if workflow already exists
    if (Boolean(walletWorkflowExists) || Boolean(erc20WorkflowExists)) {
      return res.json({
        success: true,
        message: 'Notification already enabled',
      });
    }

    // save workflows
    await client.workflow.create({
      workflow: walletWorkflow,
      workspaceKey: GRINDERY_ACCOUNT_WORKSPACE_KEY,
    });
    await client.workflow.create({
      workflow: erc20Workflow,
      workspaceKey: GRINDERY_ACCOUNT_WORKSPACE_KEY,
    });

    return res.json({ success: true, message: 'Notification created' });
  } catch (error) {
    console.error(JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /v1/notifications/webhook
 *
 * @summary Catch notification webhook
 * @description Catches notification workflow webhook and redirects it. Redirect URL is set by environment.
 * @tags Notifications
 * @param {object} request.body - The request body
 * @return {object} 200 - Success response
 * @return {object} 400 - Error response
 * @return {object} 500 - Error response
 * @example request - 200 - Example request body
 * {
 *   "responsepath": "response_path",
 *   "from": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5",
 *   "to": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5",
 *   "value": "1",
 *   "chain": "eip155:1",
 *   "hash": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5",
 *   "blockHash": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5",
 *   "blockNumber": "1",
 *   "txfees": "1",
 *   "contract": "0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5"
 * }
 * @example response - 200 - Success response example
 * {
 *   "status": "success"
 * }
 * @example response - 400 - Error response example
 * {
 *   "error": "Error message"
 * }
 * @example response - 500 - Error response example
 * {
 *   "error": "Error message"
 * }
 */
router.post('/webhook', async (req, res) => {
  res.redirect(307, WALLET_NOTIFICATION_WEBHOOK_URL);
});

export default router;
