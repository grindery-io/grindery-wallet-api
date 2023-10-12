import Web3 from 'web3';
import express from 'express';
import 'dotenv/config';
import ERC20 from './abi/ERC20.json' assert { type: 'json' };
import BigNumber from 'bignumber.js';
import { CHAIN_MAPPING } from '../utils/chains.js';
import axios from 'axios';
import { authenticateApiKey } from '../utils/auth.js';

const router = express.Router();
const g1PolygonAddress = '0xe36BD65609c08Cd17b53520293523CF4560533d0';

/**
 * POST /v1/data/
 *
 * @summary Encode Function Call to ERC20 ABI Data
 * @description Convert a function call and its arguments into an ABI-encoded data for ERC20 smart contracts.
 * @tags Data
 * @param {object} request.body - The request body containing necessary information.
 * @return {object} 200 - Success response
 * @return {object} 400 - Error response
 * @example request - 200 - Example request body
 * {
 *   "contractAddress": "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1",
 *   "function": "transfer",
 *   "inputs": ["0x5c9fAf85F1bCFF9aE11F1f60ADEeBD1f851469a5", "1"]
 * }
 * @example response - 200 - Success response example
 * {
 *   "encodedData": "0x..."
 * }
 * @example response - 400 - Error response example
 * {
 *   "error": "Function not found in contract ABI."
 * }
 */
router.post('/', async (req, res) => {
  try {
    const web3 = new Web3();
    const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

    const targetFunction = contract.methods[req.body.function];
    if (!targetFunction) {
      res.status(400).json({ error: 'Function not found in contract ABI.' });
      return;
    }

    const inputArguments = req.body.inputs || [];

    res
      .status(200)
      .json({ encodedData: targetFunction(...inputArguments).encodeABI() });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/balance', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

    const balance = await contract.methods
      .balanceOf(req.body.userAddress)
      .call();

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(
          BigNumber(10).pow(BigNumber(await contract.methods.decimals().call()))
        )
        .toString(),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/balance', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

    const balance = await contract.methods
      .balanceOf(req.body.userAddress)
      .call();

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(
          BigNumber(10).pow(BigNumber(await contract.methods.decimals().call()))
        )
        .toString(),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/patchwallet', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

    const patchWalletAddress = (
      await axios.post('https://paymagicapi.com/v1/resolver', {
        userIds: `grindery:${req.body.tgId}`,
      })
    ).data.users[0].accountAddress;

    const balance = await contract.methods.balanceOf(patchWalletAddress).call();

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(
          BigNumber(10).pow(BigNumber(await contract.methods.decimals().call()))
        )
        .toString(),
      patchWalletAddress,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/sendTokens', authenticateApiKey, async (req, res) => {
  try {
    const accessToken = (
      await axios.post(
        'https://paymagicapi.com/v1/auth',
        {
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
        },
        {
          timeout: 100000,
        }
      )
    ).data.access_token;

    const web3 = new Web3();
    const contract = new web3.eth.Contract(ERC20, g1PolygonAddress);

    const to = (
      await axios.post(
        'https://paymagicapi.com/v1/resolver',
        {
          userIds: `grindery:${req.body.toTgId}`,
        },
        {
          timeout: 100000,
        }
      )
    ).data.users[0].accountAddress;

    const tokenTransferResponse = await axios.post(
      'https://paymagicapi.com/v1/kernel/tx',
      {
        userId: `grindery:${req.body.tgId}`,
        chain: 'matic',
        to: [g1PolygonAddress],
        value: ['0x00'],
        data: [
          contract.methods['transfer'](
            to,
            Web3.utils.toWei(req.body.amount)
          ).encodeABI(),
        ],
        auth: '',
      },
      {
        timeout: 100000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.status(200).json(tokenTransferResponse.data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
