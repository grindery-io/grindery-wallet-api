import 'dotenv/config';
import axios from 'axios';
import Web3 from 'web3';
import ERC20 from '../routes/abi/ERC20.json' assert { type: 'json' };

export async function getPatchWalletAccessToken() {
  return (
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
}

export async function getPatchWalletAddressFromTgId(tgId) {
  return (
    await axios.post(
      'https://paymagicapi.com/v1/resolver',
      {
        userIds: `grindery:${tgId}`,
      },
      {
        timeout: 100000,
      }
    )
  ).data.users[0].accountAddress;
}

export async function sendTokens(
  senderTgId,
  recipientwallet,
  amountEther,
  patchWalletAccessToken
) {
  const g1Contract = new new Web3().eth.Contract(
    ERC20,
    process.env.G1_POLYGON_ADDRESS
  );
  return await axios.post(
    'https://paymagicapi.com/v1/kernel/tx',
    {
      userId: `grindery:${senderTgId}`,
      chain: 'matic',
      to: [process.env.G1_POLYGON_ADDRESS],
      value: ['0x00'],
      data: [
        g1Contract.methods['transfer'](
          recipientwallet,
          Web3.utils.toWei(amountEther)
        ).encodeABI(),
      ],
      auth: '',
    },
    {
      timeout: 100000,
      headers: {
        Authorization: `Bearer ${patchWalletAccessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}
