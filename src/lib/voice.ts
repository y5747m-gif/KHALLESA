// ─── Voice input: native speech recognition (app) + Web Speech (browser) ──
//
// Inside the standalone app the Web Speech API does not exist in Android
// WebView, so voice input runs through the platform recognizer
// (`@capacitor-community/speech-recognition` → Android SpeechRecognizer).
// On the web we keep the original `webkitSpeechRecognition` path.
import { Capacitor } from '@capacitor/core';

export interface VoiceHandle {
  stop: () => void;
}

interface VoiceOptions {
  lang?: string;
  prompt?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

function nativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function webSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w;
}

/** Cheap sync guess used to show/hide the mic button. */
export function isVoiceSupported(): boolean {
  return nativePlatform() || webSpeechSupported();
}

/**
 * Real availability check. On Android the device must have a speech
 * recognizer (Google app / manufacturer) and grant RECORD_AUDIO.
 */
export async function checkVoiceAvailable(): Promise<boolean> {
  if (!nativePlatform()) return webSpeechSupported();
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const res = await SpeechRecognition.available();
    return !!res.available;
  } catch {
    return false;
  }
}

/** Starts listening. Resolves to a handle, or `null` when unavailable. */
export async function startVoice(opts: VoiceOptions): Promise<VoiceHandle | null> {
  if (nativePlatform()) return startNativeVoice(opts);
  return startWebVoice(opts);
}

// ── native (Android / iOS) ─────────────────────────────────────────────
async function startNativeVoice(opts: VoiceOptions): Promise<VoiceHandle | null> {
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');

    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted' && perm.speechRecognition !== 'prompt') {
      opts.onError?.('no-permission');
      return null;
    }

    let stopped = false;
    const partial = await SpeechRecognition.addListener('partialResults', (data) => {
      if (stopped) return;
      const best = data.matches?.[0];
      if (best) opts.onResult(best, false);
    });

    await SpeechRecognition.start({
      language: opts.lang ?? 'ar-EG',
      maxResults: 1,
      partialResults: true,
      popup: false,
      prompt: opts.prompt,
    });

    return {
      stop: () => {
        stopped = true;
        void partial.remove();
        void SpeechRecognition.stop()
          .then(() => opts.onEnd?.())
          .catch(() => opts.onEnd?.());
      },
    };
  } catch {
    opts.onError?.('unavailable');
    return null;
  }
}

// ── web (Chrome / Edge / Safari desktop) ───────────────────────────────
function startWebVoice(opts: VoiceOptions): VoiceHandle | null {
  try {
    const w = window as unknown as Record<string, new () => VoiceRecognizer>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => VoiceRecognizer)
      | undefined;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = opts.lang ?? 'ar-EG';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: VoiceResultEvent) => {
      let text = '';
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      opts.onResult(text, isFinal);
    };
    rec.onerror = () => opts.onError?.('error');
    rec.onend = () => opts.onEnd?.();
    rec.start();
    return {
      stop: () => {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}

// minimal structural types (erasable — no runtime cost)
interface VoiceResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface VoiceRecognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: VoiceResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
