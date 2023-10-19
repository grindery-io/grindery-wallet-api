import express from 'express';
import Web3 from 'web3';
import { CHAIN_MAPPING } from '../../utils/chains';
import BigNumber from 'bignumber.js';

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
  } catch (error: any) {
    console.error('Error:', JSON.stringify(error));
    res.status(500).json({ error: error?.message || '' });
  }
});

export default router;
