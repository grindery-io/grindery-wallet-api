import 'dotenv/config';

const ANKR = (name) => [
  `wss://rpc.ankr.com/${name}/ws/${process.env.ANKR_KEY || ''}`,
  `https://rpc.ankr.com/${name}/${process.env.ANKR_KEY || ''}`,
];
const ALCHEMY = (name) => [
  `wss://${name}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  `https://${name}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
];
const GETBLOCK = (name, netType = 'mainnet') => [
  `wss://${name}.getblock.io/${process.env.GETBLOCK_API_KEY}/${netType}/`,
  `https://${name}.getblock.io/${process.env.GETBLOCK_API_KEY}/${netType}/`,
];
const LAVANET = (wsPath, httpsPath) => [
  `wss://g.w.lavanet.xyz:443/gateway/${wsPath}/${process.env.LAVANET_API_KEY}`,
  `https://g.w.lavanet.xyz:443/gateway/${httpsPath}/${process.env.LAVANET_API_KEY}`,
];
const CHAINSTACK = (nodeId, key) => [
  `wss://ws-${nodeId}.p2pify.com/${key || process.env.CHAINSTACK_API_KEY}`,
  `https://${nodeId}.p2pify.com/${key || process.env.CHAINSTACK_API_KEY}`,
];

export const CHAIN_MAPPING = {
  'eip155:1': ANKR('eth'),
  eth: ANKR('eth'),
  'eip155:42161': ANKR('arbitrum'),
  arb1: ANKR('arbitrum'),
  gno: ANKR('gnosis'),
  'eip155:100': ANKR('gnosis'),
  'eip155:137': ANKR('polygon'),
  matic: ANKR('polygon'),
  'eip155:42220': ANKR('celo'),
  'eip155:43114': ANKR('avalanche'),
  'eip155:56': ANKR('bsc'),
  'eip155:250': ANKR('fantom'),
  'eip155:1666600000': ANKR('harmony'),
  'eip155:25': GETBLOCK('cro'),
  'eip155:1101': ANKR('polygon_zkevm'),
  'eip155:1284': ANKR('moonbeam'),
  'eip155:80001': ANKR('polygon_mumbai'),
  maticmum: ANKR('polygon_mumbai'),
  'eip155:5': ALCHEMY('eth-goerli'),
  'eip155:11155111': ANKR('eth_sepolia'),
  'eip155:97': CHAINSTACK('nd-519-425-794', process.env.CHAINSTACK_API_KEY_2),
  'eip155:4002': ANKR('fantom_testnet'),
  'eip155:1442': ANKR('polygon_zkevm_testnet'),
  'eip155:338': CHAINSTACK('nd-326-373-985'),
  'eip155:44787': LAVANET('alfajores/rpc', 'alfajores/rpc-http'),
  'eip155:9000': LAVANET('evmost/json-rpc', 'evmost/json-rpc-http'),
};
