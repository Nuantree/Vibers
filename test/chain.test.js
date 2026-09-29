import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, parseAbi, parseEther, zeroAddress } from 'viem';
import { createChainGateway } from '../chain.js';
import { config, WIND_TOKEN } from '../config.js';

const curve = '0x1405653aEDA20A35c7f1D9eA4e3F6Fb430743C83';
const wallet = '0x0000000000000000000000000000000000000001';
function fixture(overrides = {}, settings = config) {
  const calls = [];
  const values = {
    symbol: 'WIND', name: 'WIND', decimals: 18,
    isSeedifyToken: true, launchIdOfToken: 141941n, curveAt: curve,
    token: settings.tokenAddress, factory: settings.launchFactory,
    quoteCurrency: zeroAddress, complete: false, graduated: false,
    quoteBuy: [parseEther('600000'), parseEther('0.001'), 0n, 0n, 0n],
    balanceOf: parseEther('100000'), curveOf: curve, pairCurrency: zeroAddress,
    quoteBuyExactIn: [parseEther('700000'), parseEther('600000'), 0n, 0n, 0n],
    ...overrides,
  };
  const rpc = {
    getChainId: async () => 46630,
    readContract: async request => {
      calls.push(request);
      const value = values[request.functionName];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error(`Unexpected read: ${request.functionName}`);
      return value;
    },
    verifyMessage: async () => true,
  };
  return { gateway: createChainGateway(rpc, settings), rpc, values, calls };
}

test('WIND resolves its registered curve and builds the current buy ABI with minimum output and deadline', async () => {
  const { gateway: g, calls } = fixture();
  await g.loadToken();
  assert.equal(g.token.address, WIND_TOKEN);
  assert.equal(g.token.protocol, 'vibevibe');
  assert.equal(g.token.curve, curve);
  assert.equal(g.token.buyable, true);
  assert.equal(await g.tokenBalance(wallet), 100000);
  const tx = await g.buildBuyTx('0.001', wallet);
  const decoded = decodeFunctionData({ abi: parseAbi(['function buy(uint256 minTokensOut,uint256 deadline) payable returns(uint256)']), data: tx.data });
  assert.equal(tx.from, wallet); assert.equal(tx.to, curve); assert.equal(tx.chainId, 46630);
  assert.equal(tx.tokenAddress, WIND_TOKEN); assert.equal(BigInt(tx.value), parseEther('0.001'));
  assert.equal(decoded.functionName, 'buy'); assert.equal(decoded.args[0], parseEther('582000'));
  assert.ok(decoded.args[1] >= BigInt(Math.floor(Date.now()/1000) + 590));
  assert.equal(tx.expectedTokens, 600000); assert.equal(tx.minimumTokens, 582000);
  assert.equal(calls.find(c => c.functionName === 'balanceOf').address, WIND_TOKEN);
  assert.ok(!calls.some(c => c.functionName === 'curveOf'));
});

test('a factory curve bound to a different token or factory cannot enable purchases', async () => {
  for (const overrides of [{ token: wallet }, { factory: wallet }]) {
    const { gateway: g } = fixture(overrides);
    await assert.rejects(g.loadToken(), /CURVE_MISMATCH/);
    assert.equal(g.token.buyable, false);
    await assert.rejects(g.buildBuyTx('0.001', wallet), /CURVE_MISMATCH/);
  }
});

test('wrong RPC chain and missing metadata do not produce guessed balances', async () => {
  const f = fixture(); f.rpc.getChainId = async () => 4663;
  await assert.rejects(f.gateway.loadToken(), /WRONG_CHAIN/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.gateway.tokenBalance(wallet), /TOKEN_METADATA_UNAVAILABLE/);
  const { gateway: g } = fixture({ decimals: new Error('RPC down') });
  await assert.rejects(g.loadToken(), /RPC down/);
  assert.equal(g.token.reason, 'RPC_UNAVAILABLE');
  await assert.rejects(g.tokenBalance(wallet), /TOKEN_METADATA_UNAVAILABLE/);
});

test('unsupported tokens can still use verified balances, with correct decimals and no WIND branding', async () => {
  const settings = { ...config, tokenAddress: wallet };
  const { gateway: g } = fixture({ isSeedifyToken: false, curveOf: zeroAddress, symbol: 'ALT', decimals: 6, balanceOf: 123456789n }, settings);
  await g.loadToken();
  assert.equal(g.token.reason, 'UNSUPPORTED_TOKEN'); assert.equal(g.token.logoUrl, null);
  assert.equal(await g.tokenBalance(wallet), 123.456789);
  await assert.rejects(g.buildBuyTx('0.001', wallet), /UNSUPPORTED_TOKEN/);
});

test('completed, graduated and non-ETH curves block purchases', async () => {
  for (const [overrides, reason] of [[{ complete: true }, 'CURVE_COMPLETE'], [{ graduated: true }, 'GRADUATED'], [{ quoteCurrency: wallet }, 'NOT_ETH_PAIRED']]) {
    const { gateway: g } = fixture(overrides); await g.loadToken();
    assert.equal(g.token.buyable, false); assert.equal(g.token.reason, reason);
    await assert.rejects(g.buildBuyTx('0.001', wallet), new RegExp(reason));
  }
});

test('a curve completing after startup cannot yield an obsolete purchase request', async () => {
  const { gateway: g, values, calls } = fixture(); await g.loadToken();
  values.complete = true;
  await assert.rejects(g.buildBuyTx('0.001', wallet), /CURVE_COMPLETE/);
  assert.equal(g.token.buyable, false); assert.ok(!calls.some(c => c.functionName === 'quoteBuy'));
});

test('legacy V6 keeps its recipient argument and uses net quote output', async () => {
  const { gateway: g } = fixture({ isSeedifyToken: false }); await g.loadToken();
  assert.equal(g.token.protocol, 'v6');
  const tx = await g.buildBuyTx('0.001', wallet);
  const abi = parseAbi(['function buyExactIn(uint256,uint256,address,uint256) payable']);
  const decoded = decodeFunctionData({ abi, data: tx.data });
  assert.equal(decoded.functionName, 'buyExactIn');
  assert.equal(decoded.args[0], parseEther('0.001')); assert.equal(decoded.args[1], parseEther('582000'));
  assert.equal(decoded.args[2], wallet); assert.equal(tx.expectedTokens, 600000);
});

test('reload failures clear the previous purchase permission and empty quotes are rejected', async () => {
  const { gateway: g, values } = fixture(); await g.loadToken();
  values.quoteBuy = [0n, 0n, 0n, 0n, 0n];
  await assert.rejects(g.buildBuyTx('0.001', wallet), /EMPTY_QUOTE/);
  values.symbol = new Error('RPC unavailable');
  await assert.rejects(g.loadToken()); assert.equal(g.token.buyable, false);
  await assert.rejects(g.buildBuyTx('0.001', wallet), /RPC_UNAVAILABLE/);
});
