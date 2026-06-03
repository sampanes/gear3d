// Offline headless screenshots of the built app (dist/). Serves dist/ from a
// local 127.0.0.1 server, drives the Playwright headless-shell Chromium to load
// chosen frozen states (?mode=&angle=&drives=), and writes PNGs to tools/shots/.
//
// Fully offline: the only external download was `npx playwright install chromium`
// (one-time). At capture time nothing leaves the machine — and to prove it, every
// non-localhost request is aborted. Run:  node tools/shoot.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = new URL('../dist/', import.meta.url);
const OUT = new URL('./shots/', import.meta.url);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// states to capture: [filename, query string]
const SHOTS = [
  ['spur', 'mode=Spur%20train&angle=120'],
  ['geneva', 'mode=Geneva&angle=20'],
  ['double-geneva', 'mode=Double%20Geneva&angle=55'],
  ['internal', 'mode=Internal%20gear&angle=90'],
  ['planetary', 'mode=Planetary&angle=90'],
  ['bevel', 'mode=Bevel&angle=45'],
  ['sator-0deg', 'mode=SATOR%20square&angle=0'],
  ['sator-45deg', 'mode=SATOR%20square&angle=45'],
  ['sator-drives-off', 'mode=SATOR%20square&angle=0&drives=0'],
  // angled views to inspect depth: double-Geneva slot, and the drives behind the board
  ['double-geneva-iso', 'mode=Double%20Geneva&angle=55&az=42&el=24'],
  ['geneva-iso', 'mode=Geneva&angle=12&az=30&el=28'],
  ['sator-back-iso', 'mode=SATOR%20square&angle=20&az=158&el=26'],
];

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1);
  if (p === '') p = 'index.html';
  try {
    const buf = await readFile(new URL(p, DIST));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 1 });

// offline guarantee: only loopback is allowed; abort anything external
await page.route('**', (route) => {
  const u = route.request().url();
  const ok = u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:');
  return ok ? route.continue() : route.abort();
});

for (const [name, query] of SHOTS) {
  await page.goto(`${base}/?${query}`, { waitUntil: 'load' });
  await page.waitForSelector('#app', { timeout: 10000 });
  await page.waitForTimeout(500); // let the app's rAF loop render several frames and frame() settle
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)) });
  console.log(`shot: ${name}.png`);
}

await browser.close();
await new Promise((r) => server.close(r));
console.log('done');
