import express from 'express';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import {
  SWAPS_COLLECTION,
  TRANSACTION_STATUS,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
} from '../../utils/constants';
import axios from 'axios';
import _ from 'lodash';
import { apiKeyIsValid } from '../../utils/apiKeyIsValid';

const router = express.Router();

type Transaction = {
  blockHash: string;
  blockNumber: string;
  blockchain: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  nonce: string;
  r: string;
  s: string;
  status: string;
  timestamp: string;
  to: string;
  transactionIndex: string;
  type: string;
  v: string;
  value: string;
};

type Transfer = {
  blockHeight: number;
  blockchain: string;
  contractAddress: string;
  fromAddress: string;
  thumbnail: string;
  timestamp: number;
  toAddress: string;
  tokenDecimals: number;
  tokenName: string;
  tokenSymbol: string;
  transactionHash: string;
  value: string;
  valueRawInteger: string;
};

type GetTransactionsByAddressResponseType = {
  id: number;
  jsonrpc: string;
  result: {
    transactions: Transaction[];
  };
};

type GetTokenTransfersResponseType = {
  id: number;
  jsonrpc: string;
  result: {
    transfers: Transfer[];
  };
};

type GetTokenPriceResponseType = {
  id: number;
  jsonrpc: string;
  result: {
    blockchain: string;
    contractAddress: string;
    usdPrice: string;
  };
};

type ExternalTransaction = {
  amount: string;
  contractAddress: string;
} & (Transaction | Transfer);

type TokenWithAmount = {
  amount: number;
  contractAddress: string;
};

const getStakedAmount = async (req: any, res: any, userId: string) => {
  console.log(`User [${userId}] requested staked amount`);
  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: userId });

    if (
      !user ||
      (user.isBanned && user.isBanned !== 'false') ||
      !user?.patchwallet
    ) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const chainTransactionsRes =
      await axios.post<GetTransactionsByAddressResponseType>(
        `https://rpc.ankr.com/multichain/${process.env.ANKR_KEY || ''}`,
        {
          jsonrpc: '2.0',
          method: 'ankr_getTransactionsByAddress',
          params: {
            blockchain: req.query.chain || 'polygon',
            address: user.patchwallet,
          },
          id: new Date().toString(),
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

    const chainTransaction = (
      chainTransactionsRes.data?.result?.transactions || []
    ).filter(
      (chainTransaction: Transaction) =>
        chainTransaction.to.toLowerCase() === user.patchwallet.toLowerCase()
    );

    const chainTranfersRes = await axios.post<GetTokenTransfersResponseType>(
      `https://rpc.ankr.com/multichain/${process.env.ANKR_KEY || ''}`,
      {
        jsonrpc: '2.0',
        method: 'ankr_getTokenTransfers',
        params: {
          blockchain: req.query.chain || 'polygon',
          address: user.patchwallet,
          pageSize: 10000,
        },
        id: new Date().toString(),
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const chainTransfers = (
      chainTranfersRes.data?.result?.transfers || []
    ).filter(
      (chainTransfer: Transfer) =>
        chainTransfer.toAddress.toLowerCase() ===
          user.patchwallet.toLowerCase() && chainTransfer.tokenSymbol !== 'G1'
    );

    const dbTransactions = await db
      .collection(TRANSFERS_COLLECTION)
      .find({ recipientTgId: userId })
      .toArray();

    const transactionsNotInDb: ExternalTransaction[] = [
      ...chainTransaction.filter(
        (chainTransaction: Transaction) =>
          !dbTransactions.find(
            (dbTransaction: any) =>
              dbTransaction?.transactionHash?.toLowerCase() ===
              chainTransaction.hash.toLowerCase()
          )
      ),
      ...chainTransfers.filter(
        (chainTransfer: Transfer) =>
          !dbTransactions.find(
            (dbTransaction: any) =>
              dbTransaction.transactionHash?.toLowerCase() ===
              chainTransfer.transactionHash.toLowerCase()
          )
      ),
    ].map((t: Transaction | Transfer) => ({
      ...t,
      amount: t.value.includes('0x')
        ? String(parseInt(t.value, 16) / 10 ** 18)
        : t.value,
      contractAddress:
        (t as Transfer).contractAddress ||
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // set WMATIC address for native token, to get MATIC price.
    }));

    const tokensWithAmounts: TokenWithAmount[] = _.uniqBy(
      transactionsNotInDb,
      'contractAddress'
    ).map((t: ExternalTransaction) => ({
      contractAddress: t.contractAddress,
      amount: transactionsNotInDb
        .filter(
          (t2: ExternalTransaction) => t2.contractAddress === t.contractAddress
        )
        .reduce(
          (a: number, b: ExternalTransaction) => a + parseFloat(b.amount),
          0
        ),
    }));

    const userSwaps = await db
      .collection(SWAPS_COLLECTION)
      .find({
        userTelegramID: userId,
        chainId: 'eip155:137',
        status: TRANSACTION_STATUS.SUCCESS,
      })
      .toArray();

    const swapTokensWithAmounts: TokenWithAmount[] = _.uniqBy(
      userSwaps,
      'tokenOut'
    ).map((s: any) => ({
      contractAddress: s.tokenOut,
      amount: userSwaps
        .filter((s2: any) => s2.tokenOut === s.tokenOut)
        .reduce((a: any, b: any) => a + parseFloat(b.amountOut), 0),
    }));

    const allTokensWithAmounts: TokenWithAmount[] = _.uniqBy(
      [...tokensWithAmounts, ...swapTokensWithAmounts],
      'contractAddress'
    );

    const swapTokensPromises = [];

    for (const swapToken of swapTokensWithAmounts) {
      swapTokensPromises.push(
        axios.get(
          `https://li.quest/v1/token?chain=137&token=${swapToken.contractAddress}`
        )
      );
    }

    const tokenPricePromises = [];

    for (const tokenWithAmount of allTokensWithAmounts) {
      tokenPricePromises.push(
        axios.post<GetTokenPriceResponseType>(
          `https://rpc.ankr.com/multichain/${process.env.ANKR_KEY || ''}`,
          {
            jsonrpc: '2.0',
            method: 'ankr_getTokenPrice',
            params: {
              blockchain: req.query.chain || 'polygon',
              contractAddress: tokenWithAmount.contractAddress,
            },
            id: new Date().toString(),
          },
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }

    const pricesRes = await Promise.all(tokenPricePromises);
    const tokensRes = await Promise.all(swapTokensPromises);

    const prices = pricesRes.map((p) => p.data?.result);
    const decimals = tokensRes.map((t) => t.data);

    const totalExternal = tokensWithAmounts
      .map(
        (t: TokenWithAmount) =>
          t.amount *
          parseFloat(
            prices.find((p) => p.contractAddress === t.contractAddress)
              ?.usdPrice || '0'
          )
      )
      .reduce((a: number, b: number) => a + b, 0)
      .toFixed(2);

    const totalSwaps = swapTokensWithAmounts
      .map(
        (t: TokenWithAmount) =>
          (t.amount /
            10 **
              parseInt(
                decimals.find(
                  (d: any) =>
                    d.address.toLowerCase() === t.contractAddress.toLowerCase()
                )?.decimals || '18'
              )) *
          parseFloat(
            prices.find((p) => p.contractAddress === t.contractAddress)
              ?.usdPrice || '0'
          )
      )
      .reduce((a: number, b: number) => a + b, 0)
      .toFixed(2);

    const totalStaked = (
      parseFloat(totalExternal) - parseFloat(totalSwaps)
    ).toFixed(2);

    console.log(`User [${userId}] staked amount request completed`);
    return res.status(200).send({ amount: totalStaked || '0.00' });
  } catch (error) {
    console.error(
      `Error getting staked amount for user ${userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
};

/**
 * GET /v2/stake
 *
 * @summary Get staked USD amount
 * @description Gets staked USD amount
 * @tags Stake
 * @security BearerAuth
 * @param {string} [chain.query] - Chain name (default: polygon)
 * @return {object} 200 - Success response
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  return await getStakedAmount(req, res, res.locals.userId);
});

/**
 * GET /v2/stake/{userId}
 *
 * @summary Get staked USD amount by user id
 * @description Gets staked USD amount by user id
 * @tags Stake
 * @security BearerAuth
 * @param {string} userId.path - User id
 * @param {string} [chain.query] - Chain name (default: polygon)
 * @return {object} 200 - Success response
 */
router.get('/:userId', apiKeyIsValid, async (req, res) => {
  if (!req.params.userId) {
    return res.status(400).send({ msg: 'Invalid user id' });
  }
  return await getStakedAmount(req, res, req.params.userId);
});

export default router;
