#!/usr/bin/env node
/**
 * Chroma-keys the AI-generated character poses (black ink + white fill on a
 * flat chroma-green background, hue drifting per image, JPEG artifacts) into
 * transparent PNG masters:
 *
 *   - keys out the background by hue/saturation distance from this image's
 *     own sampled green, with a soft feathered edge and green-spill
 *     suppression (see chromaKey.mjs for the math);
 *   - strips the generator's stray thin support-line artifact from
 *     "peeking / leaning / sitting / hanging on a box" poses;
 *   - trims to the content bounding box plus ~2% uniform padding, with zero
 *     padding on whichever side is meant to sit flush against a UI edge
 *     (e.g. the bottom of a face peeking over a ledge).
 *
 *   node scripts/characters/process.mjs [--qa-only] [--no-qa]
 *
 * Reads  ../ChuyoCode_others/Personajes/<Character>/*.jpg  (outside the repo,
 * never modified). Writes PNG masters + manifest.json to
 * ../ChuyoCode_others/Personajes/_procesados/<character>/, and (unless
 * --no-qa) contact sheets to .../_procesados/_qa/ — none of this is
 * committed to the repo. Nothing in public/ or src/ is touched; placement
 * into the site is a separate, later decision.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  computeContentBBox,
  despill,
  keyAlpha,
  layoutWithPadding,
  rgbToHsv,
  sampleBackground,
  stripSupportLines,
} from './chromaKey.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = join(__dirname, '..', '..', '..', 'ChuyoCode_others', 'Personajes');
const OUT_ROOT = join(SOURCE_ROOT, '_procesados');
const QA_ROOT = join(OUT_ROOT, '_qa');

// Explicit source -> slug mapping, one table per character. Deliberately not
// regex/pattern-driven: the source filenames are free-form Spanish prose and
// a couple of them (the "_alter" variants) need a stable, predictable slug.
//
// kind: "support" (peeking/leaning/sitting/hanging on a box — may carry the
// stray support-line defect), "pose" (freestanding gesture), "avatar".
// flushEdge: side that must sit flush (zero padding) against whatever UI
// edge the pose is conceptually resting against; null when the trimmed
// content has natural margin on every side.
const CHARACTERS = {
  Paco: [
    { source: 'Asoma por arriba.jpg', slug: 'asoma-arriba', kind: 'support', flushEdge: 'bottom' },
    { source: 'Asoma por la derecha.jpg', slug: 'asoma-derecha', kind: 'support', flushEdge: 'right' },
    { source: 'Asoma por la izquierda.jpg', slug: 'asoma-izquierda', kind: 'support', flushEdge: 'left' },
    { source: 'Sentado en un borde.jpg', slug: 'sentado-borde', kind: 'support', flushEdge: null },
    { source: 'Apoyado de codo.jpg', slug: 'apoyado-codo', kind: 'support', flushEdge: 'bottom' },
    { source: 'Saluda.jpg', slug: 'saluda', kind: 'pose', flushEdge: null },
    { source: 'Señala.jpg', slug: 'senala', kind: 'pose', flushEdge: null },
    { source: 'Celebra.jpg', slug: 'celebra', kind: 'pose', flushEdge: null },
    { source: 'Piensa.jpg', slug: 'piensa', kind: 'pose', flushEdge: null },
    { source: 'Uy.jpg', slug: 'casi', kind: 'pose', flushEdge: null },
    { source: 'Escucha.jpg', slug: 'escucha', kind: 'pose', flushEdge: null },
    { source: 'Lee acostado.jpg', slug: 'acostado-leyendo', kind: 'support', flushEdge: null },
    { source: 'Con carpeta.jpg', slug: 'con-carpeta', kind: 'pose', flushEdge: null },
  ],
  Vanina: [
    { source: 'Avatar.jpg', slug: 'avatar', kind: 'avatar', flushEdge: null },
    { source: 'Asoma por arriba de una caja.jpg', slug: 'asoma-arriba', kind: 'support', flushEdge: 'bottom' },
    { source: 'Asoma por el costado derecho.jpg', slug: 'asoma-derecha', kind: 'support', flushEdge: 'right' },
    { source: 'Asoma por el costado izquierdo.jpg', slug: 'asoma-izquierda', kind: 'support', flushEdge: 'left' },
    // 'Asoma por el costado izquierdo_alter.jpg' is intentionally NOT mapped:
    // unlike every other source, it has no chroma-green background at all
    // (sampled corners are flat #FFFFFF), so there is nothing to key out —
    // see the process report for details. Unfixable without a regenerated
    // source.
    { source: 'Sentada sobre una caja.jpg', slug: 'sentada-borde', kind: 'support', flushEdge: null },
    { source: 'Sentada sobre una caja_alter.jpg', slug: 'sentada-borde-alt', kind: 'support', flushEdge: null },
    {
      source: 'Apoyada de codos sobre una caja.jpg',
      slug: 'apoyada-codos',
      kind: 'support',
      flushEdge: 'bottom',
    },
    { source: 'Apoyada de un codo, relajada.jpg', slug: 'apoyada-codo', kind: 'support', flushEdge: null },
    {
      source: 'Recostada de espaldas contra el costado de una caja.jpg',
      slug: 'recostada-espaldas',
      kind: 'support',
      flushEdge: null,
    },
    {
      source: 'Acostada boca abajo leyendo sobre una caja.jpg',
      slug: 'acostada-leyendo',
      kind: 'support',
      flushEdge: null,
    },
    {
      source: 'Colgada del borde inferior de una caja.jpg',
      slug: 'colgada-borde',
      kind: 'support',
      flushEdge: null,
    },
    { source: 'Saluda.jpg', slug: 'saluda', kind: 'pose', flushEdge: null },
    {
      source: 'Señala abajo a la derecha (hacia Comprobar).jpg',
      slug: 'senala',
      kind: 'pose',
      flushEdge: null,
    },
    { source: 'Explica con la palma abierta.jpg', slug: 'explica', kind: 'pose', flushEdge: null },
    { source: 'Abraza un libro.jpg', slug: 'abraza-libro', kind: 'pose', flushEdge: null },
    { source: 'Sostiene un cartel en blanco.jpg', slug: 'cartel', kind: 'pose', flushEdge: null },
    { source: 'Escribe en una libreta.jpg', slug: 'escribe', kind: 'pose', flushEdge: null },
    { source: 'Escucha con auriculares.jpg', slug: 'escucha', kind: 'pose', flushEdge: null },
    {
      source: 'Mano en la oreja (¿cómo se dice)_alter.jpg',
      slug: 'mano-oreja-alt',
      kind: 'pose',
      flushEdge: null,
    },
    { source: 'Mano en la oreja (¿cómo se dice).jpg', slug: 'mano-oreja', kind: 'pose', flushEdge: null },
    { source: 'Piensa.jpg', slug: 'piensa', kind: 'pose', flushEdge: null },
    { source: 'Pulgar arriba (bien).jpg', slug: 'pulgar-arriba', kind: 'pose', flushEdge: null },
    { source: 'Aplaude.jpg', slug: 'aplaude', kind: 'pose', flushEdge: null },
    { source: '¡Casi! (error amable).jpg', slug: 'casi', kind: 'pose', flushEdge: null },
    { source: 'Celebra.jpg', slug: 'celebra', kind: 'pose', flushEdge: null },
    { source: 'Ánimo (vos podés).jpg', slug: 'animo', kind: 'pose', flushEdge: null },
  ],
};

async function processOne(character, entry) {
  const inputPath = join(SOURCE_ROOT, character, entry.source);
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`expected RGBA raw data, got ${channels} channels for ${inputPath}`);

  const bg = sampleBackground(data, width, height, channels);
  const bgHsv = rgbToHsv(bg.r, bg.g, bg.b);
  if (bgHsv.s < 0.3) {
    throw new Error(
      `${inputPath}: sampled corner background isn't a saturated chroma green ` +
        `(got rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}), s=${bgHsv.s.toFixed(2)}) — ` +
        'this source has no chroma key to remove, likely a bad export. Skip it and regenerate.',
    );
  }

  const alpha = new Uint8ClampedArray(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = keyAlpha(r, g, b, bgHsv);
    const despilled = despill(r, g, b, a);
    data[i] = despilled.r;
    data[i + 1] = despilled.g;
    data[i + 2] = despilled.b;
    data[i + 3] = a;
    alpha[p] = a;
  }

  const cleanedAlpha = stripSupportLines(alpha, width, height);
  for (let p = 0; p < width * height; p++) {
    const cleaned = cleanedAlpha[p];
    if (cleaned !== alpha[p]) data[p * 4 + 3] = cleaned;
  }

  const bbox = computeContentBBox(cleanedAlpha, width, height);
  if (!bbox) throw new Error(`no content survived keying for ${inputPath}`);

  const layout = layoutWithPadding(bbox, { flushEdge: entry.flushEdge });

  const cropped = Buffer.alloc(bbox.width * bbox.height * 4);
  for (let y = 0; y < bbox.height; y++) {
    const srcStart = ((bbox.top + y) * width + bbox.left) * 4;
    const srcEnd = srcStart + bbox.width * 4;
    data.copy(cropped, y * bbox.width * 4, srcStart, srcEnd);
  }

  const outDir = join(OUT_ROOT, character.toLowerCase());
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${entry.slug}.png`);

  await sharp({
    create: { width: layout.outWidth, height: layout.outHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: cropped,
        raw: { width: bbox.width, height: bbox.height, channels: 4 },
        left: layout.padLeft,
        top: layout.padTop,
      },
    ])
    .png()
    .toFile(outPath);

  return {
    character: character.toLowerCase(),
    slug: entry.slug,
    source: entry.source,
    width: layout.outWidth,
    height: layout.outHeight,
    flushEdge: entry.flushEdge,
    kind: entry.kind,
  };
}

async function processAll() {
  const manifest = [];
  for (const [character, entries] of Object.entries(CHARACTERS)) {
    for (const entry of entries) {
      console.log(`${character}/${entry.source} -> ${character.toLowerCase()}/${entry.slug}.png`);
      const record = await processOne(character, entry);
      manifest.push(record);
    }
  }
  await mkdir(OUT_ROOT, { recursive: true });
  await writeFile(join(OUT_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nWrote ${manifest.length} masters + manifest.json to ${OUT_ROOT}`);
  return manifest;
}

// --- QA contact sheets ------------------------------------------------

const THUMB_HEIGHT = 420;
const PAD = 24;
const LABEL_HEIGHT = 36;
const COLUMNS = 5;

function svgLabel(text, width) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    `<svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${LABEL_HEIGHT - 10}" font-family="monospace" font-size="20"
        text-anchor="middle" fill="#333333">${escaped}</text>
    </svg>`,
  );
}

async function buildGridSheet(entries, background, outPath) {
  const thumbs = [];
  for (const entry of entries) {
    const pngPath = join(OUT_ROOT, entry.character, `${entry.slug}.png`);
    const resized = await sharp(pngPath).resize({ height: THUMB_HEIGHT, withoutEnlargement: true }).toBuffer();
    const meta = await sharp(resized).metadata();
    thumbs.push({ buffer: resized, width: meta.width, height: meta.height, slug: entry.slug });
  }
  const cellWidth = Math.max(...thumbs.map((t) => t.width)) + PAD;
  const cellHeight = THUMB_HEIGHT + LABEL_HEIGHT + PAD;
  const rows = Math.ceil(thumbs.length / COLUMNS);
  const sheetWidth = cellWidth * COLUMNS + PAD;
  const sheetHeight = cellHeight * rows + PAD;

  const composites = [];
  thumbs.forEach((thumb, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const cellLeft = PAD + col * cellWidth;
    const cellTop = PAD + row * cellHeight;
    composites.push({
      input: thumb.buffer,
      left: cellLeft + Math.round((cellWidth - PAD - thumb.width) / 2),
      top: cellTop,
    });
    composites.push({
      input: svgLabel(thumb.slug, cellWidth - PAD),
      left: cellLeft,
      top: cellTop + THUMB_HEIGHT,
    });
  });

  await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background } })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function buildFlushCardSheet(entries, outPath) {
  // One support pose per row, composited flush against a white rounded
  // "glass card" mock, so a leftover line, halo, or gap at the flush edge is
  // obvious at a glance.
  const cardWidth = 520;
  const cardHeight = 360;
  const cardRadius = 28;
  const rowHeight = cardHeight + PAD * 2 + LABEL_HEIGHT;

  const composites = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const pngPath = join(OUT_ROOT, entry.character, `${entry.slug}.png`);
    const resized = await sharp(pngPath)
      .resize({ width: cardWidth - 40, height: cardHeight - 40, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const top = PAD + i * rowHeight;

    const card = await sharp({
      create: { width: cardWidth, height: cardHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${cardWidth}" height="${cardHeight}">
              <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="${cardRadius}" fill="#ffffff" />
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();

    let figLeft = Math.round((cardWidth - meta.width) / 2);
    let figTop = cardHeight - meta.height; // flush bottom by default
    if (entry.flushEdge === 'left') figLeft = 0;
    if (entry.flushEdge === 'right') figLeft = cardWidth - meta.width;
    if (entry.flushEdge === 'bottom' || entry.flushEdge === null) figTop = cardHeight - meta.height;

    const composedCard = await sharp(card)
      .composite([{ input: resized, left: figLeft, top: figTop }])
      .png()
      .toBuffer();

    composites.push({ input: composedCard, left: PAD, top });
    composites.push({ input: svgLabel(`${entry.character}/${entry.slug}`, cardWidth), left: PAD, top: top + cardHeight });
  }

  const sheetHeight = PAD + entries.length * rowHeight;
  await sharp({
    create: { width: cardWidth + PAD * 2, height: sheetHeight, channels: 4, background: '#1c1c1e' },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function buildQa(manifest) {
  await mkdir(QA_ROOT, { recursive: true });
  const byCharacter = new Map();
  for (const entry of manifest) {
    if (!byCharacter.has(entry.character)) byCharacter.set(entry.character, []);
    byCharacter.get(entry.character).push(entry);
  }
  for (const [character, entries] of byCharacter) {
    await buildGridSheet(entries, { r: 0xee, g: 0xef, b: 0xf4, alpha: 1 }, join(QA_ROOT, `${character}-light.png`));
    await buildGridSheet(entries, { r: 0x1c, g: 0x1c, b: 0x1e, alpha: 1 }, join(QA_ROOT, `${character}-dark.png`));
    const flushEntries = entries.filter((e) => e.flushEdge);
    if (flushEntries.length > 0) {
      await buildFlushCardSheet(flushEntries, join(QA_ROOT, `${character}-flush-card.png`));
    }
  }
  console.log(`Wrote QA contact sheets to ${QA_ROOT}`);
}

const args = process.argv.slice(2);
const skipQa = args.includes('--no-qa');
const qaOnly = args.includes('--qa-only');

if (qaOnly) {
  const manifest = JSON.parse(await readFile(join(OUT_ROOT, 'manifest.json'), 'utf8'));
  await buildQa(manifest);
} else {
  const manifest = await processAll();
  if (!skipQa) await buildQa(manifest);
}
