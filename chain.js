// Read-only chain access and unsigned purchase requests. Only the player's
// browser wallet can sign or broadcast a transaction.
import {
  createPublicClient, defineChain, encodeFunctionData, formatUnits, http,
  parseAbi, parseEther, zeroAddress,
} from 'viem';
import { config, WIND_TOKEN } from './config.js';

const chain = defineChain({
  id: config.chain.id, name: config.chain.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.chain.rpcUrl] } },
});
export const client = createPublicClient({ chain, transport: http(config.chain.rpcUrl, { timeout: 8000, retryCount: 1 }) });

const erc20 = parseAbi([
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);
const factoryAbi = parseAbi([
  'function isSeedifyToken(address) view returns (bool)',
  'function launchIdOfToken(address) view returns (uint256)',
  'function curveAt(uint256) view returns (address)',
]);
// Minimal interfaces from the launchpad's published ABI; see docs/wind-token.md.
const curveAbi = parseAbi([
  'function token() view returns (address)',
  'function factory() view returns (address)',
  'function quoteCurrency() view returns (address)',
  'function complete() view returns (bool)',
  'function graduated() view returns (bool)',
  'function quoteBuy(uint256 grossEth) view returns (uint256 tokenAmount, uint256 grossEthUsed, uint256 curveQuote, uint256 totalFee, uint256 refund)',
  'function buy(uint256 minTokensOut, uint256 deadline) payable returns (uint256 tokenAmount)',
]);
const legacyFactoryAbi = parseAbi(['function curveOf(address) view returns (address)']);
const legacyCurveAbi = parseAbi([
  'function pairCurrency() view returns (address)',
  'function complete() view returns (bool)',
  'function quoteBuyExactIn(uint256 pairIn) view returns (uint256 gross, uint256 net, uint256 cost, uint256 pairFee, uint256 refund)',
  'function buyExactIn(uint256 maxPairIn, uint256 minNetOut, address recipient, uint256 deadline) payable',
]);
const sameAddress = (a, b) => a.toLowerCase() === b.toLowerCase();

export function createChainGateway(rpc = client, settings = config) {
  const isWind = sameAddress(settings.tokenAddress, WIND_TOKEN);
  const token = {
    address: settings.tokenAddress, name: isWind ? 'WIND' : '游戏代币',
    symbol: isWind ? 'WIND' : '?', decimals: 18, metadataReady: false,
    logoUrl: isWind ? '/assets/wind-token.png' : null,
    curve: null, protocol: null, buyable: false, reason: 'LOADING',
  };
  const read = (address, abi, functionName, args = []) => rpc.readContract({ address, abi, functionName, args });

  async function curveStatus() {
    if (token.protocol === 'vibevibe') {
      const [pair, complete, graduated] = await Promise.all([
        read(token.curve, curveAbi, 'quoteCurrency'), read(token.curve, curveAbi, 'complete'), read(token.curve, curveAbi, 'graduated'),
      ]);
      if (!sameAddress(pair, zeroAddress)) return 'NOT_ETH_PAIRED';
      return graduated ? 'GRADUATED' : complete ? 'CURVE_COMPLETE' : null;
    }
    const [pair, complete] = await Promise.all([
      read(token.curve, legacyCurveAbi, 'pairCurrency'), read(token.curve, legacyCurveAbi, 'complete'),
    ]);
    return !sameAddress(pair, zeroAddress) ? 'NOT_ETH_PAIRED' : complete ? 'GRADUATED' : null;
  }

  async function loadToken() {
    Object.assign(token, { metadataReady: false, curve: null, protocol: null, buyable: false, reason: 'LOADING' });
    try {
      if (await rpc.getChainId() !== settings.chain.id) throw new Error('WRONG_CHAIN');
      const [symbol, decimals] = await Promise.all([
        read(token.address, erc20, 'symbol'), read(token.address, erc20, 'decimals'),
      ]);
      Object.assign(token, { symbol, decimals, metadataReady: true });
      token.name = await read(token.address, erc20, 'name').catch(() => symbol);
      if (await read(settings.launchFactory, factoryAbi, 'isSeedifyToken', [token.address])) {
        const id = await read(settings.launchFactory, factoryAbi, 'launchIdOfToken', [token.address]);
        token.curve = await read(settings.launchFactory, factoryAbi, 'curveAt', [id]);
        const [boundToken, boundFactory] = await Promise.all([
          read(token.curve, curveAbi, 'token'), read(token.curve, curveAbi, 'factory'),
        ]);
        if (!sameAddress(boundToken, token.address) || !sameAddress(boundFactory, settings.launchFactory)) throw new Error('CURVE_MISMATCH');
        token.protocol = 'vibevibe';
      } else {
        const curve = await read(settings.v6Factory, legacyFactoryAbi, 'curveOf', [token.address]);
        if (sameAddress(curve, zeroAddress)) { token.reason = 'UNSUPPORTED_TOKEN'; return token; }
        token.curve = curve; token.protocol = 'v6';
      }
      token.reason = await curveStatus(); token.buyable = !token.reason;
      return token;
    } catch (error) {
      token.buyable = false;
      token.reason = ['WRONG_CHAIN', 'CURVE_MISMATCH'].includes(error.message) ? error.message : 'RPC_UNAVAILABLE';
      throw error;
    }
  }

  async function tokenBalance(address) {
    // Never interpret a balance using guessed decimals after metadata failed.
    if (!token.metadataReady) throw new Error('TOKEN_METADATA_UNAVAILABLE');
    const raw = await read(token.address, erc20, 'balanceOf', [address]);
    return Number(formatUnits(raw, token.decimals));
  }

  async function buildBuyTx(ethAmount, recipient) {
    if (!token.buyable) throw new Error(token.reason ?? 'NOT_BUYABLE');
    // Recheck at quote time: a curve may complete after the server started.
    const reason = await curveStatus();
    if (reason) { token.reason = reason; token.buyable = false; throw new Error(reason); }
    const value = parseEther(ethAmount);
    if (value <= 0n) throw new Error('INVALID_AMOUNT');
    const current = token.protocol === 'vibevibe';
    const quote = await read(token.curve, current ? curveAbi : legacyCurveAbi, current ? 'quoteBuy' : 'quoteBuyExactIn', [value]);
    const amount = quote[current ? 0 : 1];
    if (amount <= 0n) throw new Error('EMPTY_QUOTE');
    const minOut = amount * BigInt(10_000 - settings.buySlippageBps) / 10_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    return {
      chainId: settings.chain.id, tokenAddress: token.address, from: recipient, to: token.curve,
      // Current buy() credits msg.sender; the wallet must send from this recipient.
      data: encodeFunctionData({ abi: current ? curveAbi : legacyCurveAbi, functionName: current ? 'buy' : 'buyExactIn', args: current ? [minOut, deadline] : [value, minOut, recipient, deadline] }),
      value: '0x' + value.toString(16),
      expectedTokens: Number(formatUnits(amount, token.decimals)),
      minimumTokens: Number(formatUnits(minOut, token.decimals)),
    };
  }

  const verifyLogin = (address, message, signature) => rpc.verifyMessage({ address, message, signature });
  return { token, loadToken, tokenBalance, verifyLogin, buildBuyTx };
}

export const { token, loadToken, tokenBalance, verifyLogin, buildBuyTx } = createChainGateway();
