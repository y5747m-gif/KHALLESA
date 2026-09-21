/**
 * Copies everything the app needs to run 100% OFF-DEVICE into `public/`.
 *
 * Why: the standalone Android app (APK) must not touch any CDN. By default
 *   • tesseract.js loads its worker + WASM core from jsdelivr
 *   • Tesseract language models (`ara`, `eng`) are downloaded on first use
 *   • the Cairo font is served by Google Fonts
 * All three are vendored locally here so the APK works with the network off.
 *
 * Idempotent — safe to run before every build (`npm run build` calls it).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

let copied = 0;
let bytes = 0;

function put(from, toDir, toName) {
  if (!existsSync(from)) {
    console.warn(`  ! missing (skipped): ${from}`);
    return;
  }
  mkdirSync(toDir, { recursive: true });
  const dest = join(toDir, toName);
  copyFileSync(from, dest);
  copied += 1;
  bytes += statSync(dest).size;
  console.log(`  ✓ ${toDir.replace(root + '/', '')}/${toName}  (${(statSync(dest).size / 1048576).toFixed(2)} MB)`);
}

function mod(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

console.log('› vendoring offline assets into public/');

// ── 1. OCR engine (worker + WASM cores) ───────────────────────────────
const tj = mod('tesseract.js');
const core = mod('tesseract.js-core');
if (tj) put(join(tj, 'dist', 'worker.min.js'), join(pub, 'ocr'), 'worker.min.js');
if (core) {
  // Only the LSTM cores are needed (tesseract.js defaults to OEM.LSTM_ONLY),
  // and only the `.wasm.js` flavour — that is the file the worker hands to
  // `importScripts()`, and it already embeds the wasm (the bare `.wasm` next
  // to it would just duplicate ~2.7 MB).
  //
  // Default is the portable core (~3.7 MB). Pass --full to also ship the SIMD
  // variants (+7.4 MB) for ~1.5× faster recognition on recent phones;
  // `src/lib/ocr.ts` probes for them and falls back when they are absent.
  const full = process.argv.includes('--full');
  const wanted = full
    ? ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']
    : ['tesseract-core-lstm.wasm.js'];
  for (const f of readdirSync(core)) {
    if (wanted.includes(f)) put(join(core, f), join(pub, 'ocr'), f);
  }
}

// ── 2. Tesseract language models (Arabic + English, gzipped) ──────────
// tesseract.js asks for `${langPath}/${lang}.traineddata.gz` and gunzips it
// itself (it sniffs the gzip magic bytes), so the .gz files ship as-is.
for (const lang of ['ara', 'eng']) {
  const dir = mod(`@tesseract.js-data/${lang}`);
  if (!dir) continue;
  const src = join(dir, '4.0.0', `${lang}.traineddata.gz`);
  put(src, join(pub, 'tessdata'), `${lang}.traineddata.gz`);
}

// ── 3. Cairo font ─────────────────────────────────────────────────────
// Handled by Vite instead: `src/index.css` imports
// `@fontsource-variable/cairo`, which bundles the woff2 files (~400 KB) into
// the build. No Google Fonts request, so the app renders offline.

console.log(`› done — ${copied} files, ${(bytes / 1048576).toFixed(1)} MB`);
