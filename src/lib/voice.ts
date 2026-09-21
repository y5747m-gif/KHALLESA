// ─── Voice input via Web Speech API (ar-EG) ─────────────────────────────

export interface VoiceHandle {
  stop: () => void;
}

interface VoiceOptions {
  lang?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w;
}

export function startVoice(opts: VoiceOptions): VoiceHandle | null {
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
    rec.onerror = () => opts.onError?.('تعذر التعرف على الصوت — حاول مجددًا');
    rec.onend = () => opts.onEnd?.();
    rec.start();
    return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
  } catch {
    return null;
  }
}

// minimal structural types (erasable — no runtime cost)
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

interface VoiceResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
