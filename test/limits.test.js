import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 5000) { const end = Date.now() + timeout; while (Date.now() < end) { if (fn()) return fn(); await sleep(25); } throw new Error('Condition timed out'); }

async function startServer(env, seed) {
  const dir = await mkdtemp(join(tmpdir(), 'viber-limits-')), dataFile = join(dir, 'save.json');
  if (seed) await writeFile(dataFile, JSON.stringify(seed));
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0', OFFLINE: '1', DATA_FILE: dataFile, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', (x) => output += x);
  await waitFor(() => /localhost:(\d+)/.test(output));
  const port = Number(output.match(/localhost:(\d+)/)[1]);
  const stop = async () => { child.kill('SIGTERM'); await once(child, 'exit'); await rm(dir, { recursive: true, force: true }); };
  return { port, dataFile, stop, read: async () => JSON.parse(await readFile(dataFile, 'utf8')) };
}

async function enter(port, name = 'QA') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`), s = { ws, events: [] };
  ws.on('message', (d) => { const m = JSON.parse(d); s.events.push(m); if (m.t === 'you') s.you = m; if (m.t === 'session') s.session = m.session; });
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', name }));
  await waitFor(() => s.you);
  return s;
}
const close = async (s) => { s.ws.close(); await once(s.ws, 'close'); };

test('guests that never play are not saved; guests that play are saved with a timestamp', { timeout: 20000 }, async () => {
  const srv = await startServer();
  try {
    for (let i = 0; i < 5; i++) await close(await enter(srv.port, `idle${i}`));
    const player = await enter(srv.port, 'player');
    player.ws.send(JSON.stringify({ t: 'move', dx: -1, dy: 0 }));
    await sleep(150); await close(player); await sleep(150);
    const saved = await srv.read();
    assert.deepEqual(Object.keys(saved.guests), [player.session]);
    assert.ok(Date.now() - saved.guests[player.session].seen < 10_000);
  } finally { await srv.stop(); }
});

test('stale guests are pruned, legacy guests without a timestamp survive, and the count is capped', { timeout: 20000 }, async () => {
  const day = 86_400_000, g = (seen) => ({ name: 'g', skills: {}, inv: {}, stats: {}, ...(seen ? { seen } : {}) });
  const guests = { ['a'.repeat(48)]: g(Date.now() - 40 * day), ['b'.repeat(48)]: g(null), ['c'.repeat(48)]: g(Date.now() - 2 * day), ['d'.repeat(48)]: g(Date.now() - 1 * day) };
  const srv = await startServer({ MAX_GUESTS: '2' }, { wallets: {}, houses: [], guests });
  try {
    await close(await enter(srv.port)); // any disconnect writes the save
    await sleep(150);
    // 'a' is past the 30-day TTL; of the rest, the cap of 2 drops the oldest ('c').
    assert.deepEqual(Object.keys((await srv.read()).guests).sort(), ['b'.repeat(48), 'd'.repeat(48)]);
  } finally { await srv.stop(); }
});

test('connections per IP are capped', { timeout: 20000 }, async () => {
  const srv = await startServer({ MAX_CONN_PER_IP: '3' });
  try {
    const open = [await enter(srv.port, 'c1'), await enter(srv.port, 'c2'), await enter(srv.port, 'c3')];
    const extra = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const [code] = await once(extra, 'close');
    assert.equal(code, 1013);
    await close(open[0]); await sleep(100);
    open[0] = await enter(srv.port, 'c4'); // a freed slot can be reused
    for (const s of open) await close(s);
  } finally { await srv.stop(); }
});

test('new connections per minute are capped', { timeout: 20000 }, async () => {
  const srv = await startServer({ CONN_PER_MINUTE: '3' });
  try {
    for (let i = 0; i < 3; i++) await close(await enter(srv.port, `r${i}`));
    const extra = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const [code] = await once(extra, 'close');
    assert.equal(code, 1013);
  } finally { await srv.stop(); }
});

test('buy quotes are rate limited per IP', { timeout: 20000 }, async () => {
  const srv = await startServer({ BUY_QUOTES_PER_MINUTE: '2' });
  try {
    const url = `http://127.0.0.1:${srv.port}/api/buy?eth=0.001&to=0x0000000000000000000000000000000000000001`;
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(url)).status);
    assert.deepEqual(codes, [409, 409, 429]); // offline: refused, refused, then throttled
  } finally { await srv.stop(); }
});

test('online names are unique and invisible characters are stripped', { timeout: 20000 }, async () => {
  const srv = await startServer();
  try {
    const a = await enter(srv.port, 'Alice'), b = await enter(srv.port, 'alice'), c = await enter(srv.port, 'Al​ice‮');
    assert.equal(a.you.name, 'Alice');
    assert.equal(b.you.name, 'alice·2');
    assert.equal(c.you.name, 'Alice·3');
    for (const s of [a, b, c]) await close(s);
  } finally { await srv.stop(); }
});
