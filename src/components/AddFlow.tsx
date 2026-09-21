import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Mic,
  RefreshCw,
  ScanText,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { Answers, AppSettings, CategoryId, Detection, FamilyMember, KhTask } from '../lib/types';
import { catLabel, useLang, useStrings } from '../lib/i18n';
import {
  allCategories,
  buildTaskFromDetection,
  detect,
  questionsForCategory,
  titleForCategory,
} from '../lib/engine';
import { enhanceWithAI } from '../lib/ai';
import { recognizeText } from '../lib/ocr';
import { isVoiceSupported, startVoice } from '../lib/voice';
import type { VoiceHandle } from '../lib/voice';
import { isNative } from '../lib/notify';
import { compressDataUrl, cx, fileToDataUrl, formatShortDate, num } from '../lib/utils';
import { Chip, SectionTitle, Sheet, TrustBadge } from './ui';

interface AddFlowProps {
  open: boolean;
  sessionKey: number;
  prefill?: string;
  mode?: 'text' | 'voice' | 'photo';
  members: FamilyMember[];
  settings: AppSettings;
  onClose: () => void;
  onCreate: (task: KhTask, images: Array<{ name: string; dataUrl: string }>) => void;
}

type Stage = 'input' | 'questions' | 'preview';

export default function AddFlow({ open, sessionKey, prefill, mode, members, settings, onClose, onCreate }: AddFlowProps) {
  const s = useStrings();
  const lang = useLang();
  const rtl = lang === 'ar';
  const FwdIcon = rtl ? ArrowLeft : ArrowRight;
  const [stage, setStage] = useState<Stage>('input');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [showCats, setShowCats] = useState(false);
  const [plan, setPlan] = useState<KhTask | null>(null);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [hint, setHint] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<VoiceHandle | null>(null);
  const baseTextRef = useRef('');

  // reset on open
  useEffect(() => {
    if (!open) return;
    setStage('input');
    setText(prefill ?? '');
    setListening(false);
    setPhoto(null);
    setOcrRunning(false);
    setOcrProgress(0);
    setOcrText('');
    setAnalyzing(false);
    setDetection(null);
    setAnswers({});
    setShowCats(false);
    setPlan(null);
    setAiWorking(false);
    setAiApplied(false);
    setHint('');
    const me = members.find((m) => m.isMe);
    setOwnerId(me?.id ?? members[0]?.id ?? '');
    setAssigneeId(me?.id ?? members[0]?.id ?? '');
    if (mode === 'voice') {
      const t = setTimeout(() => beginListening(prefill ?? ''), 350);
      return () => clearTimeout(t);
    }
    if (mode === 'photo') {
      const t = setTimeout(() => pickPhoto(), 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionKey]);

  useEffect(() => () => stopListening(), []);

  function beginListening(base: string) {
    if (!isVoiceSupported()) {
      setHint(s.micUnsupported);
      return;
    }
    stopListening();
    baseTextRef.current = base;
    const h = startVoice({
      lang: lang === 'ar' ? 'ar-EG' : 'en-US',
      onResult: (t, isFinal) => {
        setText((baseTextRef.current ? baseTextRef.current + ' ' : '') + t);
        if (isFinal) baseTextRef.current = (baseTextRef.current ? baseTextRef.current + ' ' : '') + t;
      },
      onEnd: () => setListening(false),
      onError: () => {
        setHint(s.micFail);
        setListening(false);
      },
    });
    if (h) {
      voiceRef.current = h;
      setListening(true);
    } else {
      setHint(s.micFail);
    }
  }

  function stopListening() {
    try {
      voiceRef.current?.stop();
    } catch {
      /* noop */
    }
    voiceRef.current = null;
    setListening(false);
  }

  async function pickPhoto() {
    if (isNative()) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        const res = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: s.photoBtn,
          promptLabelPhoto: 'Gallery',
          promptLabelPicture: 'Camera',
        });
        if (res.dataUrl) {
          await handlePhotoData(res.dataUrl);
          return;
        }
      } catch {
        /* fall through to file input */
      }
    }
    fileRef.current?.click();
  }

  async function handlePhotoData(dataUrl: string) {
    const compressed = await compressDataUrl(dataUrl);
    setPhoto(compressed);
    setOcrText('');
    runOcr(compressed);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await fileToDataUrl(f);
      await handlePhotoData(dataUrl);
    } catch {
      setHint(s.photoFail);
    }
  }

  async function runOcr(img: string) {
    setOcrRunning(true);
    setOcrProgress(0);
    try {
      const t = await recognizeText(img, lang, setOcrProgress);
      setOcrText(t);
      if (t) setText((prev) => (prev.trim() ? prev : t));
    } catch (err) {
      setHint(err instanceof Error ? err.message : s.photoFail);
    } finally {
      setOcrRunning(false);
    }
  }

  function analyze() {
    const finalText = text.trim() || ocrText.trim();
    if (!finalText) {
      setHint(s.needInputFirst);
      return;
    }
    setHint('');
    setAnalyzing(true);
    setTimeout(() => {
      const d = detect(finalText, lang);
      setDetection(d);
      setAnswers({});
      setAnalyzing(false);
      setStage('questions');
    }, 650);
  }

  function changeCategory(cat: CategoryId) {
    if (!detection) return;
    const finalText = text.trim() || ocrText.trim();
    setDetection({
      ...detection,
      category: cat,
      title: titleForCategory(cat, detection.extracted, finalText, lang),
      questions: questionsForCategory(cat, lang),
      confidence: 'high',
    });
    setAnswers({});
    setShowCats(false);
  }

  function goPreview() {
    if (!detection) return;
    const finalText = text.trim() || ocrText.trim();
    const origin: KhTask['origin'] = photo ? 'photo' : 'text';
    const task = buildTaskFromDetection(finalText, detection, answers, origin, lang, {
      ownerId: ownerId || undefined,
      assigneeId: assigneeId || undefined,
      followUp: true,
    });
    setPlan(task);
    setAiApplied(false);
    setStage('preview');
  }

  async function runAiEnhance() {
    if (!plan || !detection) return;
    if (!settings.apiKey.trim()) {
      setHint(s.aiNeedKey);
      return;
    }
    setAiWorking(true);
    setHint('');
    const improved = await enhanceWithAI(
      {
        title: plan.title,
        summary: plan.summary,
        pathId: plan.pathId,
        trust: plan.trust,
        deadline: plan.deadline,
        steps: plan.steps,
        docs: plan.docs,
        consequences: plan.consequences,
        sources: plan.sources,
      },
      plan.rawInput ?? plan.title,
      settings,
    );
    setAiWorking(false);
    if (improved && (improved.steps || improved.docs || improved.summary)) {
      setPlan({ ...plan, ...improved, updatedAt: Date.now() });
      setAiApplied(true);
    } else {
      setHint(s.aiFail);
    }
  }

  function create() {
    if (!plan) return;
    stopListening();
    const images = photo ? [{ name: `${lang === 'ar' ? 'صورة' : 'Photo'} - ${plan.title}`.slice(0, 60), dataUrl: photo }] : [];
    onCreate(plan, images);
  }

  const finalText = text.trim() || ocrText.trim();
  const canAnalyze = Boolean(finalText) && !ocrRunning;
  const stageIdx = stage === 'input' ? 0 : stage === 'questions' ? 1 : 2;

  return (
    <Sheet
      open={open}
      onClose={() => {
        stopListening();
        onClose();
      }}
      tall
      title={stage === 'input' ? s.addTitle1 : stage === 'questions' ? s.addTitle2 : s.addTitle3}
      subtitle={stage === 'input' ? s.addSub1 : stage === 'questions' ? s.addSub2 : s.addSub3}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* step indicator */}
      <div className="mb-3 flex items-center gap-1.5">
        {[s.step1, s.step2, s.step3].map((label, i) => (
          <div key={label} className={cx('flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-extrabold', i <= stageIdx ? 'bg-brand-500 text-white' : 'bg-black/5 text-neutral-400 dark:bg-white/10')}>
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', i <= stageIdx ? 'bg-white/25' : 'bg-black/10 dark:bg-white/10')}>{num(i + 1, lang)}</span>
            {label}
          </div>
        ))}
      </div>

      {hint && (
        <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {hint}
        </div>
      )}

      {stage === 'input' && (
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={s.textPh}
              className="w-full resize-none rounded-2xl border-2 border-black/10 bg-black/[0.02] p-3.5 pb-12 text-[15px] font-bold outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
            />
            <div className="absolute bottom-2.5 end-2.5 flex gap-2">
              <button
                onClick={() => (listening ? stopListening() : beginListening(text))}
                aria-label={s.voiceBtn}
                className={cx(
                  'flex h-10 w-10 items-center justify-center rounded-full text-white shadow transition',
                  listening ? 'animate-pulse bg-red-500' : 'bg-brand-500 hover:bg-brand-600',
                )}
              >
                <Mic size={18} />
              </button>
              <button
                onClick={pickPhoto}
                aria-label={s.photoBtn}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-white shadow transition hover:bg-neutral-900 dark:bg-white dark:text-neutral-900"
              >
                <Camera size={18} />
              </button>
            </div>
          </div>
          {listening && <p className="text-center text-sm font-extrabold text-red-500">{s.listening}</p>}

          {photo && (
            <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              <img src={photo} alt="paper" className="max-h-52 w-full object-cover" />
              <button
                onClick={() => {
                  setPhoto(null);
                  setOcrText('');
                }}
                aria-label={s.removePhoto}
                className="absolute end-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X size={16} />
              </button>
              {ocrRunning && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2.5 text-white">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{s.ocrReading} {Math.round(ocrProgress * 100)}%</span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${ocrProgress * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {ocrText && !ocrRunning && (
            <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5">
              <div className="mb-1 flex items-center justify-between">
                <p className="flex items-center gap-1 text-xs font-extrabold text-neutral-500">
                  <ScanText size={14} />
                  <span>{s.ocrTitle}</span>
                </p>
                {photo && (
                  <button onClick={() => runOcr(photo)} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                    <RefreshCw size={12} />
                    <span>{s.ocrRetry}</span>
                  </button>
                )}
              </div>
              <p className="max-h-24 overflow-y-auto text-sm leading-6 font-bold whitespace-pre-wrap">{ocrText}</p>
            </div>
          )}

          <button
            onClick={analyze}
            disabled={!canAnalyze || analyzing}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-base font-black text-white shadow-lg transition hover:bg-brand-600 disabled:opacity-50"
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 size={20} className="animate-spin" />
                <span>{s.analyzing}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>{s.analyzeBtn}</span>
                <FwdIcon size={20} />
              </span>
            )}
          </button>
          <p className="text-center text-xs text-neutral-400">{s.photoHint}</p>
        </div>
      )}

      {stage === 'questions' && detection && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-700/15">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold">
                <span>{s.understood} </span>
                <span className="text-brand-700 dark:text-brand-400">{catLabel(detection.category, lang)}</span>
                {detection.deadline && (
                  <span className="text-neutral-500"> — {s.deadlineIs} {formatShortDate(detection.deadline, lang)}</span>
                )}
              </p>
              <button onClick={() => setShowCats(!showCats)} className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-brand-600">
                <span>{s.change}</span>
                <ChevronDown size={14} className={cx('transition', showCats && 'rotate-180')} />
              </button>
            </div>
            {showCats && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allCategories().map((c) => (
                  <Chip key={c} selected={c === detection.category} onClick={() => changeCategory(c)}>
                    {catLabel(c, lang)}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {detection.questions.map((q) => (
            <div key={q.id}>
              <SectionTitle title={q.label} />
              {q.options ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <Chip key={opt} selected={answers[q.id] === opt} onClick={() => setAnswers({ ...answers, [q.id]: opt })}>
                      {opt}
                    </Chip>
                  ))}
                </div>
              ) : (
                <input
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder={q.placeholder}
                  className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-3 py-2.5 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
                />
              )}
            </div>
          ))}

          {members.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <SectionTitle icon={User} title={s.aboutWhom} />
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full rounded-xl border-2 border-black/10 bg-white px-2 py-2 text-sm font-bold dark:border-white/10 dark:bg-neutral-900"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <SectionTitle icon={User} title={s.responsible} />
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-xl border-2 border-black/10 bg-white px-2 py-2 text-sm font-bold dark:border-white/10 dark:bg-neutral-900"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            onClick={goPreview}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-base font-black text-white shadow-lg transition hover:bg-brand-600"
          >
            <span>{s.makePlan}</span>
            <FwdIcon size={20} />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setStage('input')}
              className="rounded-2xl bg-black/5 px-5 py-2.5 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            >
              {s.back}
            </button>
            <button
              onClick={goPreview}
              className="flex-1 rounded-2xl border-2 border-dashed border-neutral-300 py-2.5 text-sm font-extrabold text-neutral-500 dark:border-white/20 dark:text-neutral-400"
            >
              {s.skipQs}
            </button>
          </div>
        </div>
      )}

      {stage === 'preview' && plan && (
        <div className="space-y-3">
          <input
            value={plan.title}
            onChange={(e) => setPlan({ ...plan, title: e.target.value })}
            className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-3 py-2.5 font-black outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
          />
          <p className="rounded-2xl bg-black/[0.03] p-3 text-sm leading-7 font-bold dark:bg-white/5">{plan.summary}</p>

          <div className="flex items-center gap-2">
            <TrustBadge level={plan.trust} />
            <span className="text-xs font-bold text-neutral-500">
              {num(plan.steps.length, lang)} • {num(plan.docs.length, lang)} • {num(plan.sources.length, lang)}
            </span>
          </div>

          <div>
            <SectionTitle title={s.stepsTitle} />
            <ol className="space-y-1.5">
              {plan.steps.map((stp, i) => (
                <li key={stp.id} className="flex gap-2.5 rounded-xl bg-black/[0.03] p-2.5 text-sm dark:bg-white/5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-black text-white dark:bg-neutral-200 dark:text-neutral-900">
                    {num(i + 1, lang)}
                  </span>
                  <div>
                    <p className="font-extrabold">{stp.title}</p>
                    {stp.detail && <p className="text-xs text-neutral-500 dark:text-neutral-400">{stp.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <SectionTitle title={s.docsNeeded} />
            <div className="flex flex-wrap gap-1.5">
              {plan.docs.map((d) => (
                <span key={d.id} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                  [ ] {d.label}
                </span>
              ))}
            </div>
          </div>

          {photo && (
            <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-2.5 text-xs font-bold text-neutral-500 dark:bg-white/5">
              <ImageIcon size={16} />
              <span>{s.photoSavedNote}</span>
            </div>
          )}

          <button
            onClick={runAiEnhance}
            disabled={aiWorking}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-500/50 py-2.5 text-sm font-extrabold text-brand-700 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-700/10 disabled:opacity-60"
          >
            {aiWorking ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span>{s.aiWorking}</span>
              </span>
            ) : aiApplied ? (
              <span className="flex items-center gap-2">
                <Check size={16} />
                <span>{s.aiDone}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles size={16} />
                <span>{s.aiEnhance}</span>
              </span>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setStage('questions')}
              className="rounded-2xl bg-black/5 px-5 py-3 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            >
              {s.back}
            </button>
            <button
              onClick={create}
              className="flex-1 rounded-2xl bg-brand-500 py-3 text-base font-black text-white shadow-lg transition hover:bg-brand-600"
            >
              {s.startFollow} 🚀
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
