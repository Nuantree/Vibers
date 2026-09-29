import { POIS, STATIONS, CHESTS, DECOR, decorAt } from './public/catalog.js';
export const W = 80, H = 60;
export const TOWN = { x0: 35, y0: 26, x1: 45, y1: 33 };
export const SPAWN = { x: 40, y: 31 };
export const MERCHANT = STATIONS[0];
export const inTown = (x, y) => x >= TOWN.x0 && x <= TOWN.x1 && y >= TOWN.y0 && y <= TOWN.y1;
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generateWorld(seed = 1997) {
  const rand = rng(seed), tiles = Array.from({ length: H }, () => Array(W).fill('g'));
  const lakes = [{ x: 51, y: 19, rx: 6, ry: 5 }, { x: 16, y: 40, rx: 7, ry: 4 }, { x: 66, y: 46, rx: 5, ry: 7 }];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!x || !y || x === W - 1 || y === H - 1 || lakes.some(l => ((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 < 1 + Math.sin(x * 1.6 + y) * .12)) tiles[y][x] = 'w';
    else if (Math.hypot(x - 53, y - 34) < 5) tiles[y][x] = 'q';
  }
  // A compact village, with grassy courtyards between soft stone paths.
  for (let y = 27; y <= 32; y++) for (let x = 36; x <= 44; x++) tiles[y][x] = 's';
  for (let x = 4; x < W - 4; x++) for (let dy = 0; dy < 2; dy++) tiles[30 + dy][x] = 'd';
  for (let y = 5; y < H - 5; y++) tiles[y][40] = 'd';
  for (let y = 27; y <= 32; y++) for (let x = 36; x <= 44; x++) tiles[y][x] = 's';
  // Accessible fishing pier; the landmark sits on the bank, not in the lake.
  for (let y = 21; y <= 30; y++) tiles[y][50] = y < 24 ? 'p' : 'd';
  for (let x = 20; x <= 24; x++) for (let y = 13; y <= 17; y++) tiles[y][x] = 's';
  for (const c of CHESTS) tiles[c.y][c.x] = 'g';
  const reserved = (x, y) => DECOR.some(d => x >= d.x - 1 && x <= d.x + d.w && y >= d.y - 1 && y <= d.y + d.h) || STATIONS.some(s => Math.max(Math.abs(s.x-x), Math.abs(s.y-y)) <= 1) || CHESTS.some(c => Math.max(Math.abs(c.x-x), Math.abs(c.y-y)) <= 1) || POIS.some(c => Math.max(Math.abs(c.x-x), Math.abs(c.y-y)) <= 1);
  const resources = [], taken = new Set();
  const place = (type, x, y) => {
    const key = y * W + x;
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 || !['g', 'q'].includes(tiles[y][x]) || taken.has(key) || inTown(x, y) || reserved(x, y)) return;
    taken.add(key); resources.push({ id: resources.length, type, x, y, hits: 0, alive: true, respawnAt: 0 });
  };
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const n = rand(), forest = Math.hypot(x - 29, y - 27) < 10;
    if (n < (forest ? .18 : .11)) place('tree', x, y);
    else if (n < (forest ? .23 : .15)) place(tiles[y][x] === 'q' ? 'rock' : 'herb', x, y);
    else if (n > .97 || (tiles[y][x] === 'q' && n > .5)) place('rock', x, y);
  }
  // Beginner resources along both exits, always within a short walk.
  for (const [type,x,y] of [['tree',33,29],['tree',32,32],['tree',34,34],['rock',47,32],['rock',48,34],['herb',34,28],['herb',46,29],['herb',33,33]]) place(type,x,y);
  return { tiles: tiles.map(r => r.join('')), resources };
}
