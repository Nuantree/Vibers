// All tunables live here. Override with environment variables, e.g.
//   TOKEN_ADDRESS=0x... LORD_MIN=100000 npm start
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8790),

  // Wallets need the public testnet endpoint, never the private backend RPC URL.
  walletRpcUrl: 'https://rpc.testnet.chain.robinhood.com',
  chain: {
    id: 46630,
    name: 'Robinhood Chain Testnet',
    rpcUrl: env.RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    faucet: 'https://faucet.testnet.chain.robinhood.com',
  },

  // The game token. Defaults to an existing V6 launch so the demo runs before
  // you launch your own; replace it with your token's address.
  tokenAddress: env.TOKEN_ADDRESS ?? '0x2B558EFDA4c473e9aE8f0437604B72312778B79c',

  // vibe/vibe V6 factory, used to find the token's bonding curve for in-game buys.
  v6Factory: '0xcA9B3Af4aA4E4CC4C887c5E6b4906F8A309687A6',

  // Whole tokens a wallet must hold to be a Lord (can build a house, faster skill gain).
  lordMin: Number(env.LORD_MIN ?? 100000),

  // House cost in gathered resources.
  houseCost: { log: Number(env.HOUSE_LOG ?? 10), ore: Number(env.HOUSE_ORE ?? 5) },

  // How often connected wallets are re-read on chain (ms), and how long a house
  // may sit decaying after its owner drops below lordMin before it collapses.
  recheckMs: 60_000,
  decayMs: 5 * 60_000,

  // Slippage for the in-game buy, in basis points.
  buySlippageBps: 300,
  buyOptionsEth: ['0.001', '0.005', '0.01'],

  dataFile: env.DATA_FILE ?? 'data.json',
};
