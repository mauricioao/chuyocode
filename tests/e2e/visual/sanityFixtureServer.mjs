// Tiny local stand-in for the Sanity Content Lake, used ONLY by the visual
// snapshot suite (playwright.visual.config.ts starts it as a webServer).
//
// The app reaches it through `SANITY_FIXTURE_API_HOST` (src/lib/sanityConfig.ts):
//   - GET/POST /v<apiVersion>/data/query/<dataset>  -> evaluates the app's real
//     GROQ query with groq-js against the synthetic dataset in
//     ./sanityFixtures.mjs and answers in the Content Lake's `{ result }` shape.
//   - GET /images/<project>/<dataset>/<id>-<w>x<h>.<ext> -> a generated SVG
//     "cover" for that fixture asset (query params such as ?w= are ignored).
//   - GET /health -> 200, for Playwright's webServer readiness check.
// Anything else answers 404 and is logged, so an unexpected request is visible.
//
// Usage: node tests/e2e/visual/sanityFixtureServer.mjs   (PORT, default 4335)
import { createServer } from 'node:http';
import { evaluate, parse } from 'groq-js';
import { buildDataset } from './sanityFixtures.mjs';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT ?? '4335', 10);
// Public ids from sanity.config.ts; they only appear inside image URL paths.
const PROJECT_ID = process.env.SANITY_PROJECT_ID ?? 'z9wkqssq';
const DATASET = process.env.SANITY_DATASET ?? 'production_';

const ORIGIN = `http://${HOST}:${PORT}`;
const documents = buildDataset(ORIGIN, PROJECT_ID, DATASET);
const assetsByFile = new Map(
  documents
    .filter((doc) => doc._type === 'sanity.imageAsset')
    .map((doc) => [doc.url.split('/').pop().replace(/\.[a-z]+$/, ''), doc]),
);

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Deterministic SVG artwork for one fixture asset. */
function renderSvg(asset) {
  const { width, height } = asset.metadata.dimensions;
  const [from, to] = asset.fixtureSwatch;
  const fontSize = Math.round(Math.min(width, height) / 9);
  // Only portrait book covers carry a caption: landscape art sits behind the
  // page's own hero title, or is centre-cropped into poster cards, where a
  // caption would collide with real text or be cut off.
  const caption =
    width >= height
      ? ''
      : `<rect x="${width * 0.1}" y="${height * 0.62}" width="${width * 0.8}" height="${fontSize * 0.18}" fill="#ffffff" fill-opacity="0.5"/>
  <text x="${width * 0.1}" y="${height * 0.56}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(asset.fixtureCaption)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${width * 0.78}" cy="${height * 0.24}" r="${Math.min(width, height) * 0.16}" fill="#ffffff" fill-opacity="0.18"/>
  ${caption}
</svg>`;
}

/** `$name=<json>` query-string params, the way @sanity/client encodes GET queries. */
function paramsFromSearch(searchParams) {
  const params = {};
  for (const [key, value] of searchParams) {
    if (key.startsWith('$')) params[key.slice(1)] = JSON.parse(value);
  }
  return params;
}

async function runQuery(query, params) {
  const tree = parse(query, { params });
  const value = await evaluate(tree, { dataset: documents, params });
  return value.get();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function send(res, status, contentType, body) {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  try {
    if (url.pathname === '/health') {
      send(res, 200, 'text/plain', 'ok');
      return;
    }

    if (/^\/v[^/]+\/data\/query\/[^/]+$/.test(url.pathname)) {
      let query;
      let params;
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        query = body.query;
        params = body.params ?? {};
      } else {
        query = url.searchParams.get('query');
        params = paramsFromSearch(url.searchParams);
      }
      const result = await runQuery(query, params);
      send(res, 200, 'application/json', JSON.stringify({ query, result, ms: 1 }));
      return;
    }

    const image = url.pathname.match(/^\/images\/[^/]+\/[^/]+\/([^/.]+)\.[a-z]+$/);
    if (image) {
      const asset = assetsByFile.get(image[1]);
      if (asset) {
        send(res, 200, 'image/svg+xml', renderSvg(asset));
        return;
      }
    }

    console.error(`[sanity-fixture] 404 ${req.method} ${url.pathname}`);
    send(res, 404, 'application/json', JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error(`[sanity-fixture] 500 ${req.method} ${url.pathname}:`, err);
    send(res, 500, 'application/json', JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[sanity-fixture] serving ${documents.length} synthetic documents on ${ORIGIN}`);
});
