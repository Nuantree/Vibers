// Everything that touches Robinhood Chain Testnet: token reads, signature
// checks and building the in-game buy transaction against the V6 curve.
import {
  createPublicClient, defineChain, encodeFunctionData, formatUnits, http,
  parseAbi, parseEther, zeroAddress,
} from 'viem';
import { config } from './config.js';

const chain = defineChain({
  id: config.chain.id,
  name: config.chain.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.chain.rpcUrl] } },
});

export const client = createPublicClient({ chain, transport: http(config.chain.rpcUrl, { timeout: 8000, retryCount: 1 }) });

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);
const factoryAbi = parseAbi(['function curveOf(address) view returns (address)']);
const curveAbi = parseAbi([
  'function pairCurrency() view returns (address)',
  'function complete() view returns (bool)',
  'function quoteBuyExactIn(uint256 pairIn) view returns (uint256 gross, uint256 net, uint256 cost, uint256 pairFee, uint256 refund)',
  'function buyExactIn(uint256 maxPairIn, uint256 minNetOut, address recipient, uint256 deadline) payable',
]);

export const token = { address: config.tokenAddress, symbol: '?', decimals: 18, curve: null, buyable: false, reason: 'LOADING' };

export async function loadToken() {
  const address = config.tokenAddress;
  [token.symbol, token.decimals] = await Promise.all([
    client.readContract({ address, abi: erc20, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20, functionName: 'decimals' }),
  ]);
  const curve = await client.readContract({ address: config.v6Factory, abi: factoryAbi, functionName: 'curveOf', args: [address] });
  if (curve === zeroAddress) {
    token.reason = 'NOT_V6';
  } else {
    token.curve = curve;
    const [pair, complete] = await Promise.all([
      client.readContract({ address: curve, abi: curveAbi, functionName: 'pairCurrency' }),
      client.readContract({ address: curve, abi: curveAbi, functionName: 'complete' }),
    ]);
    if (pair !== zeroAddress) token.reason = 'NOT_ETH_PAIRED';
    else if (complete) token.reason = 'GRADUATED';
    else token.buyable = true;
  }
  if (token.buyable) token.reason = null;
  return token;
}

// Whole-token balance as a Number (fine for tier checks and display).
export async function tokenBalance(address) {
  const raw = await client.readContract({ address: token.address, abi: erc20, functionName: 'balanceOf', args: [address] });
  return Number(formatUnits(raw, token.decimals));
}

export function verifyLogin(address, message, signature) {
  // publicClient.verifyMessage also accepts ERC-1271 smart-contract wallets.
  return client.verifyMessage({ address, message, signature });
}

// Returns an unsigned tx for the player's wallet to send.
export async function buildBuyTx(ethAmount, recipient) {
  if (!token.buyable) throw new Error(token.reason ?? 'NOT_BUYABLE');
  const value = parseEther(ethAmount);
  const [, net] = await client.readContract({ address: token.curve, abi: curveAbi, functionName: 'quoteBuyExactIn', args: [value] });
  const minNetOut = net * BigInt(10_000 - config.buySlippageBps) / 10_000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  return {
    to: token.curve,
    data: encodeFunctionData({ abi: curveAbi, functionName: 'buyExactIn', args: [value, minNetOut, recipient, deadline] }),
    value: '0x' + value.toString(16),
    expectedTokens: Number(formatUnits(net, token.decimals)),
  };
}
