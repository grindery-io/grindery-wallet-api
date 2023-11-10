import Moralis from 'moralis';
import express from 'express';
import Web3 from 'web3';
import { CHAIN_MAPPING } from '../../utils/chains';
import BigNumber from 'bignumber.js';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { USERS_COLLECTION } from '../../utils/constants';

const ERC20 = require('../../abi/ERC20.json');
const router = express.Router();

/**
 * POST /v2/balance
 *
 * @summary Request user token balance
 * @description Gets bot user tokens balance from chain
 * @tags Balance
 * @security BearerAuth
 * @param {object} request.body - Request body
 * @return {object} 200 - Success response with balance
 * @example request - Example request body
 * {
 *   "chainId": "eip155:137",
 *   "contractAddress": "0x1234",
 *   "userAddress": "0x1234567"
 * }
 * @example response - 200 - Success response example
 * {
 *   "balanceWei": 1000000000000000000,
 *   "balanceEther": 1
 * }
 */
router.post('/', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    let balance: any = 0;
    let decimals = 18;
    if (
      !req.body.contractAddress ||
      req.body.contractAddress === '0x0' ||
      req.body.contractAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    ) {
      balance = await web3.eth.getBalance(req.body.userAddress);
    } else {
      const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

      balance = await contract.methods.balanceOf(req.body.userAddress).call();
      decimals = await contract.methods.decimals().call();
    }

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(BigNumber(10).pow(BigNumber(decimals)))
        .toString(),
    });
  } catch (error: any) {
    console.error('Error:', JSON.stringify(error));
    res.status(500).json({ error: error?.message || '' });
  }
});

/**
 * GET /v2/balance
 *
 * @summary Get user token balance
 * @description Gets balance of all user tokens
 * @tags Balance
 * @security BearerAuth
 * @param {string} chainId.query - Chain id
 * @return {object} 200 - Success response
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  if (!process.env.MORALIS_API_KEY) {
    return res.status(500).json({ error: 'Moralis API key not set' });
  }
  console.log(`User [${res.locals.userId}] requested tokens balance`);
  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    const address = user.patchwallet;
    const chain = `0x${Number(req.query.chainId).toString(16)}`;

    const [nativeBalance, tokenBalances] = await Promise.all([
      Moralis.EvmApi.balance.getNativeBalance({
        chain,
        address,
      }),
      Moralis.EvmApi.token.getWalletTokenBalances({
        chain,
        address,
      }),
    ]);

    /*

    const address = user.patchwallet;
    const chain = parseInt((req.query.chainId as string) || '1').toString(16);
    const response = await Moralis.EvmApi.token.getWalletTokenBalances({
      address,
      chain,
    });*/
    console.log(`User [${res.locals.userId}] tokens balance request completed`);
    return res.status(200).json({
      nativeBalance: nativeBalance.toJSON(),
      tokenBalances: tokenBalances.toJSON(),
    });
  } catch (error) {
    console.error(
      `Error getting balance for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).json({ error: 'An error occurred' });
  }
});

export default router;
