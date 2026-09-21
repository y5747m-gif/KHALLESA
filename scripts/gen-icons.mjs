/**
 * Generates the PNG icon set used by the web manifest (PWA install) and iOS.
 * Run with: npm run icons
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(publicDir, 'icons');

const BRAND = '#0ea968';
const CHECK = '<path d="M38 66.5 57 85l33-42" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>';

/** Rounded-square logo (same art as public/logo.svg). */
const anyIcon = (await readFile(path.join(publicDir, 'logo.svg'), 'utf8')).trim();

/** Full-bleed version — nothing important lives outside the safe circle. */
const maskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="${BRAND}"/>
  <g transform="translate(64 64) scale(0.72) translate(-64 -64)">${CHECK}</g>
</svg>`;

const targets = [
  { name: 'icon-192.png', size: 192, svg: anyIcon },
  { name: 'icon-512.png', size: 512, svg: anyIcon },
  { name: 'icon-maskable-512.png', size: 512, svg: maskableIcon },
  { name: 'apple-touch-icon.png', size: 180, svg: maskableIcon },
  { name: 'favicon-32.png', size: 32, svg: anyIcon },
];

await mkdir(outDir, { recursive: true });
for (const t of targets) {
  const buf = await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toBuffer();
  await writeFile(path.join(outDir, t.name), buf);
  console.log(`✓ icons/${t.name} (${t.size}×${t.size})`);
}
