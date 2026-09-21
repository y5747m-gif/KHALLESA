// ─── OCR on-device (Tesseract.js, Arabic + English) ────────────────────
//
// Everything the engine needs ships inside the app (`public/ocr`,
// `public/tessdata` → vendored by `scripts/copy-native-assets.mjs`), so
// reading a photo works with the network completely off — inside the APK and
// in the installed PWA. No jsdelivr, no runtime model download.
import type { Lang } from './i18n';

/** Base for vendored assets. Relative on purpose: Vite builds with `base: './'`. */
const ASSETS = '.';

type RecOptions = {
  langPath?: string;
  workerPath?: string;
  corePath?: string;
  workerBlobURL?: boolean;
  gzip?: boolean;
  cacheMethod?: string;
  logger?: (m: { status: string; progress: number }) => void;
};

/** Minimal WASM feature detection (same bytecodes `wasm-feature-detect` uses). */
function wasmSupports(bytes: number[]): boolean {
  try {
    return WebAssembly.validate(new Uint8Array(bytes));
  } catch {
    return false;
  }
}

/** Cached per session: one probe per core variant, then reuse. */
const coreProbe = new Map<string, Promise<boolean>>();

/**
 * Is that core actually bundled? A HEAD is not enough: static hosts answer
 * every unknown path with the SPA's `index.html` (200 + text/html), which
 * would make `importScripts()` blow up. So the content type has to be JS.
 */
function reachable(url: string): Promise<boolean> {
  let p = coreProbe.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok) return false;
        const type = (r.headers.get('content-type') || '').toLowerCase();
        return type.includes('javascript') || type.includes('ecmascript') || type.includes('wasm');
      })
      .catch(() => false);
    coreProbe.set(url, p);
  }
  return p;
}

/**
 * Picks the fastest WASM core that is actually bundled.
 * `importScripts()` inside the worker needs an exact file, not a directory.
 *
 * The default build ships only the portable core; `npm run assets -- --full`
 * adds the SIMD variants, which this function then prefers on capable devices.
 */
async function pickCore(): Promise<string> {
  const base = `${ASSETS}/ocr`;
  const portable = `${base}/tesseract-core-lstm.wasm.js`;
  try {
    const relaxed = wasmSupports([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 100, 11]);
    const simd = wasmSupports([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
    if (relaxed && (await reachable(`${base}/tesseract-core-relaxedsimd-lstm.wasm.js`))) {
      return `${base}/tesseract-core-relaxedsimd-lstm.wasm.js`;
    }
    if (simd && (await reachable(`${base}/tesseract-core-simd-lstm.wasm.js`))) {
      return `${base}/tesseract-core-simd-lstm.wasm.js`;
    }
  } catch {
    /* fall through to the portable core */
  }
  return portable;
}

export async function recognizeText(
  image: string,
  lang: Lang = 'ar',
  onProgress?: (p: number) => void,
): Promise<string> {
  try {
    const { recognize } = await import('tesseract.js');
    const options: RecOptions = {
      workerPath: `${ASSETS}/ocr/worker.min.js`,
      corePath: await pickCore(),
      langPath: `${ASSETS}/tessdata`,
      workerBlobURL: false, // a blob: worker cannot importScripts() our origin
      gzip: true, // we ship `ara.traineddata.gz` / `eng.traineddata.gz`
      // Bundled models are already on-device, so skip IndexedDB entirely —
      // no cache to invalidate, no storage permission, identical behaviour.
      cacheMethod: 'none',
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    };
    const result = await recognize(image, 'ara+eng', options);
    return (result.data.text || '').trim();
  } catch {
    throw new Error(
      lang === 'ar'
        ? 'تعذر قراءة الصورة — تأكد من وضوحها وحاول مجددًا'
        : 'Could not read the image — make sure it is clear and retry',
    );
  }
}
