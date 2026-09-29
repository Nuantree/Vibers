// Viber demo server: static files, two small HTTP endpoints and the game over WebSocket.
import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { getAddress, isAddress } from 'viem';
import { config } from './config.js';
import { W, H, SPAWN, MERCHANT, inTown, generateWorld } from './world.js';
import { hydrate, progress, createGameplay } from './gameplay.js';
import { POIS, STATIONS, CHESTS, TRAINING, GARDENS, CLOAKS, decorAt, maxHealth, levelFor } from './public/catalog.js';
import { token, loadToken, tokenBalance, verifyLogin, buildBuyTx } from './chain.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = resolve(ROOT, config.dataFile);

// ---------- persistent state (wallet progress + houses) ----------
let saved = { wallets: {}, houses: [], guests: {} };
if (existsSync(DATA)) saved = JSON.parse(readFileSync(DATA, 'utf8'));
saved.guests ??= {};
let saving = Promise.resolve();
const save = () => {
  const body = JSON.stringify(saved, null, 1);
  saving = saving.then(async () => { await writeFile(DATA + '.tmp', body); await rename(DATA + '.tmp', DATA); }).catch(e => console.error('save failed', e.message));
  return saving;
};
setInterval(save, 20_000);

// ---------- world ----------
const world = generateWorld();
const resAt = new Map(world.resources.map((r) => [r.y * W + r.x, r]));
const YIELD = { tree: 4, rock: 3, herb: 2 };
const SKILL_OF = { tree: 'lumberjacking', rock: 'mining', herb: 'herbalism' };
const ITEM_OF = { tree: 'log', rock: 'ore', herb: 'herb' };
const SKILL_NAME = { lumberjacking: '伐木', mining: '采矿', herbalism: '草药学' };

const houseAt = (x, y) => saved.houses.find((h) => x >= h.x && x < h.x + 3 && y >= h.y && y < h.y + 3);

function walkable(x, y, p) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  if ((x === TRAINING.x && y === TRAINING.y) || world.tiles[y][x] === 'w' || decorAt(x, y)) return false;
  if (GARDENS.some(s=>s.x===x&&s.y===y)||STATIONS.some(s => s.x === x && s.y === y)) return false;
  if (CHESTS.some(c => c.x === x && c.y === y)) return false;
  const r = resAt.get(y * W + x);
  if (r?.alive) return false;
  const h = houseAt(x, y);
  return !h || h.owner === p.wallet;
}

// ---------- players ----------
const players = new Map(); // id -> player
let nextId = 1;
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);
const tierOf = (p) => (!p.wallet ? 'wanderer' : p.balance >= config.lordMin ? 'lord' : 'citizen');
const pub = (p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, tier: p.tier, wallet: short(p.wallet), color: p.color, level: levelFor(p.xp), equipment: p.equipment, companion:{kind:p.companion.kind,name:p.companion.name,bond:p.companion.bond}, facing:p.facing });

function send(p, msg) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
function broadcast(msg) { const s = JSON.stringify(msg); for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
const sys = (p, text, kind = 'sys') => send(p, { t: 'sys', text, kind });
const sendYou = (p) => send(p, {
  t: 'you', garden:p.garden,seeds:p.seeds,harvests:p.harvests,companion:p.companion,stamina:p.stamina??100, serverTime:Date.now(), dashReady:p.dashReady??0, skillReady:p.skillReady??0, id: p.id, name: p.name, tier: p.tier, wallet: p.wallet, balance: p.balance, balanceStatus: p.balanceStatus,
  skills: p.skills, inv: p.inv, hp: p.hp, maxHp: maxHealth(p.xp), xp: p.xp, gold: p.gold, level: levelFor(p.xp),
  stats: p.stats, equipment: p.equipment, claimed: p.claimed, discovered: p.discovered, opened: p.opened, color: p.color,
  hasHouse: saved.houses.some((h) => h.owner === p.wallet && p.wallet),
});

function persist(p) {
  if (p.wallet) saved.wallets[p.wallet] = progress(p);
  else if (p.session) saved.guests[p.session] = progress(p);
}

async function refreshBalance(p) {
  if (!p.wallet || process.env.OFFLINE === '1') return;
  if (p.checkingBalance || Date.now() - (p.lastBalanceCheck ?? 0) < 3000) return;
  p.checkingBalance = true; p.lastBalanceCheck = Date.now();
  try {
    const wallet = p.wallet;
    const balance = await tokenBalance(wallet);
    if (p.wallet !== wallet) return;
    p.balance = balance; p.balanceStatus = 'fresh';
  } catch (e) {
    p.balanceStatus = 'unavailable'; sendYou(p);
    sys(p, '测试网持仓读取失败，稍后可手动重试。', 'bad');
    return;
  } finally { p.checkingBalance = false; }
  const before = p.tier;
  p.tier = tierOf(p);
  if (before !== p.tier) {
    broadcast({ t: 'pu', player: pub(p) });
    if (p.tier === 'lord') sys(p, `你已成为领主！持有 ${fmt(p.balance)} ${token.symbol}。现在可以建造房屋，技能成长 +50%。`, 'good');
    else if (before === 'lord') sys(p, `你的持仓低于 ${fmt(config.lordMin)} ${token.symbol}，失去了领主头衔。`, 'bad');
  }
  sendYou(p);
}
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

const game = createGameplay({ world, players, send, broadcast, sys, sendYou, persist, walkable });
setInterval(() => game.tick(), 100);

// ---------- actions ----------
function onMove(p, { dx, dy }) {
  const now = Date.now();
  if (now - p.lastMove < 110) return;
  dx = Math.sign(dx | 0); dy = Math.sign(dy | 0);
  if (!dx && !dy) return;
  const nx = p.x + dx, ny = p.y + dy;
  // No corner-cutting through blocked diagonals.
  if (!walkable(nx, ny, p) || (dx && dy && (!walkable(p.x + dx, p.y, p) || !walkable(p.x, p.y + dy, p)))) return;
  game.cancelFishing(p);
  p.x = nx; p.y = ny; p.lastMove = now; p.facing={x:dx,y:dy};
  game.discover(p);
  broadcast({ t: 'pm', id: p.id, x: nx, y: ny, facing:p.facing });
}

function onGather(p, { x, y }) {
  const now = Date.now();
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= W || y < 0 || y >= H) return;
  const r = resAt.get(y * W + x);
  if (!r || !r.alive) return;
  if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 1) return sys(p, '太远了。');
  if (now - p.lastGather < 900) return;
  p.lastGather = now;
  const skill = SKILL_OF[r.type];
  const lvl = p.skills[skill];
  broadcast({ t: 'fx', id: p.id, x, y, kind: r.type });

  if (Math.random() < 0.85 + lvl / 700) {
    const amount = p.equipment.axe ? 2 : 1;
    p.inv[ITEM_OF[r.type]] += amount;
    p.stats[ITEM_OF[r.type]] += amount;
    if (r.type === 'rock' && Math.random() < .08) {
      p.inv.crystal++; send(p, { t: 'fx', x, y, kind: 'reward', text: '+1 星辉碎片' });
    }
    game.gain(p, 6);
    send(p, { t: 'fx', x, y, kind: 'reward', text: `+${amount} ${r.type === 'tree' ? '橡木' : r.type === 'rock' ? '铁矿' : '月光草'}` });

    if (++r.hits >= YIELD[r.type]) {
      r.alive = false; r.hits = 0; r.respawnAt = now + 40_000;
      broadcast({ t: 'res', r });
    }
  } else {
    sys(p, '再努力一下，资源就快采集到了。');
  }

  // UO-style use-based gain: slower as the skill rises, Lords gain 50% faster.
  const chance = Math.max(0.1, ((100 - lvl) / 100) * 0.8) * (p.tier === 'lord' ? 1.5 : 1);
  if (lvl < 100 && Math.random() < chance) {
    p.skills[skill] = Math.round((lvl + 0.1) * 10) / 10;
    sys(p, `你的${SKILL_NAME[skill]}技能提升了 0.1，现在是 ${p.skills[skill].toFixed(1)}。`, 'skill');
  }
  persist(p);
  sendYou(p);
}

function onBuild(p) {
  if (p.tier !== 'lord') return sys(p, `只有领主才能建房。持有 ≥ ${fmt(config.lordMin)} ${token.symbol} 即可成为领主（去小镇中央找商人）。`, 'bad');
  if (saved.houses.some((h) => h.owner === p.wallet)) return sys(p, '你已经有一座房子了。', 'bad');
  const { log, ore } = config.houseCost;
  if (p.inv.log < log || p.inv.ore < ore) return sys(p, `建房需要 ${log} 木头 + ${ore} 矿石。`, 'bad');
  // Use the nearest free 3x3 patch of plain grass within a few tiles of the player.
  const free = (x, y) => !decorAt(x, y) && !CHESTS.some(c => c.x === x && c.y === y) && !POIS.some(c => Math.max(Math.abs(c.x-x),Math.abs(c.y-y)) < 3) && ![...players.values()].some(p => p.x === x && p.y === y) && x > 0 && y > 0 && x < W - 1 && y < H - 1 && world.tiles[y][x] === 'g'
    && !resAt.has(y * W + x) && !houseAt(x, y) && !inTown(x, y);
  const spots = [];
  for (let dy = -5; dy <= 3; dy++) for (let dx = -5; dx <= 3; dx++) spots.push([p.x + dx, p.y + dy]);
  spots.sort((a, b) => Math.hypot(a[0] + 1 - p.x, a[1] + 1 - p.y) - Math.hypot(b[0] + 1 - p.x, b[1] + 1 - p.y));
  const spot = spots.find(([hx, hy]) => {
    for (let y = hy; y < hy + 3; y++) for (let x = hx; x < hx + 3; x++) if (!free(x, y)) return false;
    return true;
  });
  if (!spot) return sys(p, '附近没有 3×3 的空草地（不能有树、石头、水、道路或小镇），换个开阔的地方再试。', 'bad');
  const [hx, hy] = spot;
  p.inv.log -= log; p.inv.ore -= ore;
  const house = { id: randomBytes(4).toString('hex'), owner: p.wallet, ownerName: p.name, x: hx, y: hy, decayingSince: null };
  saved.houses.push(house);
  persist(p); save();
  broadcast({ t: 'house', house });
  broadcast({ t: 'sys', text: `领主 ${p.name} 建造了一座房屋！`, kind: 'good' });
  sendYou(p);
}

function onChat(p, { text }) {
  text = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (Date.now() - p.lastChat < 800) return;
  p.lastChat = Date.now();
  if (text) broadcast({ t: 'chat', id: p.id, name: p.name, tier: p.tier, text });
}

function onAuthStart(p, { address }) {
  if (process.env.OFFLINE === '1') return sys(p, '当前为离线模式，钱包功能未启用。', 'bad');
  if (p.wallet) return sys(p, '已经登录；更换钱包请刷新页面后重新连接。');
  if (Date.now() - (p.lastAuthStart ?? 0) < 3000) return;
  p.lastAuthStart = Date.now();
  if (!isAddress(address ?? '')) return;
  p.pendingAddress = getAddress(address);
  p.authMessage = `Viber 演示登录\n\n钱包: ${p.pendingAddress}\n随机码: ${randomBytes(8).toString('hex')}\n\n此签名仅用于登录，不会发起交易或花费任何资产。`;
  send(p, { t: 'authMsg', message: p.authMessage });
}

async function onAuth(p, { signature }) {
  if (!p.authMessage) return;
  const address = p.pendingAddress, message = p.authMessage;
  p.authMessage = null;
  let ok = false;
  try { ok = await verifyLogin(address, message, signature); } catch {}
  if (!ok) return sys(p, '签名验证失败。', 'bad');

  // One live session per wallet.
  for (const other of players.values()) if (other !== p && other.wallet === address) {
    persist(other); other.wallet = null; other.session = null;
    sys(other, '该钱包在别处登录，你已被断开。', 'bad'); other.ws.close(4001, 'session replaced');
  }
  persist(p);
  if (p.session) delete saved.guests[p.session];
  p.session = null;
  p.wallet = address; p.balance = null; p.balanceStatus = 'loading';
  const prev = saved.wallets[address];
  if (prev) { hydrate(p, prev); sys(p, `欢迎回来，${prev.name}。已读取你的技能和背包。`, 'good'); }
  persist(p);
  await refreshBalance(p);
  p.tier = tierOf(p);
  broadcast({ t: 'pu', player: pub(p) });
  sendYou(p);
  sys(p, `钱包已连接：${short(address)}。${p.balanceStatus === 'fresh' ? `持有 ${fmt(p.balance)} ${token.symbol}。` : '持仓暂未读取成功。'}`, 'good');
}

const handlers = {
  ...game.handlers,
  move: onMove, gather: onGather, build: onBuild, chat: onChat,
  authStart: onAuthStart, auth: onAuth, recheck: (p) => refreshBalance(p),
};

// ---------- periodic: respawns and on-chain rechecks ----------
setInterval(() => {
  const now = Date.now();
  for (const r of world.resources) if (!r.alive && now >= r.respawnAt) {
    // Don't respawn under a player.
    if ([...players.values()].some((p) => p.x === r.x && p.y === r.y)) continue;
    r.alive = true; broadcast({ t: 'res', r });
  }
}, 2000);

setInterval(async () => {
  if (process.env.OFFLINE === '1') return;
  for (const p of players.values()) await refreshBalance(p);
  // Houses decay when their owner (online or not) is no longer a Lord.
  const now = Date.now();
  for (const h of [...saved.houses]) {
    let bal;
    try { bal = await tokenBalance(h.owner); } catch { continue; }
    if (bal >= config.lordMin) {
      if (h.decayingSince) { h.decayingSince = null; broadcast({ t: 'house', house: h }); }
    } else if (!h.decayingSince) {
      h.decayingSince = now; broadcast({ t: 'house', house: h });
    } else if (now - h.decayingSince > config.decayMs) {
      saved.houses = saved.houses.filter((x) => x !== h);
      broadcast({ t: 'houseGone', id: h.id });
      broadcast({ t: 'sys', text: `${h.ownerName} 的房屋年久失修，倒塌了。`, kind: 'bad' });
    }
  }
  save();
}, config.recheckMs);

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/preview') return json(res, 200, { W, H, tiles: world.tiles, resources: world.resources });
  if (url.pathname === '/api/config') {
    return json(res, 200, {
      chain: { ...config.chain, rpcUrl: config.walletRpcUrl }, token, lordMin: config.lordMin, houseCost: config.houseCost,
      buyOptionsEth: config.buyOptionsEth, vibeUrl: `https://testnet.vibevibe.fun/token/${token.address}`,
    });
  }
  if (url.pathname === '/api/buy') {
    const eth = url.searchParams.get('eth'), to = url.searchParams.get('to');
    if (!config.buyOptionsEth.includes(eth) || !isAddress(to ?? '')) return json(res, 400, { error: 'bad params' });
    try { return json(res, 200, await buildBuyTx(eth, getAddress(to))); }
    catch (e) { return json(res, 409, { error: e.shortMessage ?? e.message }); }
  }
  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  if (path.includes('..')) return json(res, 400, { error: 'bad path' });
  try {
    const body = await readFile(join(PUBLIC, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', (ws) => {
  ws.on('error', () => {}); // Malformed / oversized frames close this socket only.
  const p = {
    id: nextId++, ws, name: `旅人${Math.floor(1000 + Math.random() * 9000)}`, x: SPAWN.x, y: SPAWN.y,
    wallet: null, balance: null, balanceStatus: 'unknown', tier: 'wanderer', skills: { lumberjacking: 10, mining: 10 }, inv: { log: 0, ore: 0 },
    lastMove: 0, lastGather: 0, authMessage: null, lastChat: 0,
  };
  hydrate(p);
  let joined = false, count = 0, countAt = Date.now();
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (Date.now() - countAt > 1000) { count = 0; countAt = Date.now(); }
    if (++count > 35) return;
    if (!joined) {
      if (msg.t !== 'hello') return;
      const name = String(msg.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
      if (typeof msg.session === 'string' && /^[a-f0-9]{48}$/.test(msg.session) && saved.guests[msg.session]) {
        p.session = msg.session;
        for (const other of players.values()) if (other.session === p.session) { persist(other); other.session = null; other.ws.close(4001, 'session replaced'); }
        hydrate(p, saved.guests[p.session]);
      } else p.session = randomBytes(24).toString('hex');
      if (name) p.name = name;
      if (CLOAKS.some(c=>c.id===msg.color)) p.color = msg.color;
      send(p, { t: 'session', session: p.session });
      joined = true;
      players.set(p.id, p);
      send(p, {
        t: 'init', you: p.id, W, H, tiles: world.tiles, merchant: MERCHANT,
        resources: world.resources, houses: saved.houses, enemies: game.enemies, pois: POIS, stations: STATIONS, chests: CHESTS, players: [...players.values()].map(pub),
      });
      game.discover(p); persist(p); sendYou(p);
      broadcast({ t: 'pj', player: pub(p) });
      sys(p, '欢迎来到风栖小镇。点击地面移动，点击资源采集。第一份委托正在等你。', 'good');
      return;
    }
    const h = Object.hasOwn(handlers, msg.t) ? handlers[msg.t] : null;
    if (h) { try { await h(p, msg); } catch (e) { console.error(msg.t, e); } }
  });
  ws.on('close', () => {
    if (!joined) return;
    persist(p); save();
    players.delete(p.id);
    broadcast({ t: 'pl', id: p.id });
  });
});

// The game is playable even when testnet RPC is temporarily unavailable.
if (process.env.OFFLINE === '1') token.reason = 'OFFLINE';
else loadToken().catch(() => { token.buyable = false; token.reason = 'RPC_UNAVAILABLE'; console.error('Testnet unavailable; adventure mode remains playable.'); });
server.listen(config.port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Viber demo on http://localhost:${server.address().port}`);
  console.log(`Token ${token.symbol} ${token.address} · in-game buy: ${token.buyable ? 'on (' + token.curve + ')' : 'off: ' + token.reason}`);
});
const shutdown = async () => { for (const p of players.values()) persist(p); await save(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
