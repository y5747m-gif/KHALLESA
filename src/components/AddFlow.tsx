import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowLeft,
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
import { CATEGORY_META } from '../lib/types';
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
import { compressDataUrl, cx, fileToDataUrl, formatShortDateAr } from '../lib/utils';
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
      setHint('المتصفح ده مش بيدعم الإدخال الصوتي — اكتب المشكلة كتابة.');
      return;
    }
    stopListening();
    baseTextRef.current = base;
    const h = startVoice({
      onResult: (t, isFinal) => {
        setText((baseTextRef.current ? baseTextRef.current + ' ' : '') + t);
        if (isFinal) baseTextRef.current = (baseTextRef.current ? baseTextRef.current + ' ' : '') + t;
      },
      onEnd: () => setListening(false),
      onError: (m) => {
        setHint(m);
        setListening(false);
      },
    });
    if (h) {
      voiceRef.current = h;
      setListening(true);
    } else {
      setHint('تعذر تشغيل المايك — اكتب المشكلة كتابة.');
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
    // native camera when running inside the APK
    if (isNative()) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        const res = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: 'صوّر الورقة',
          promptLabelPhoto: 'من المعرض',
          promptLabelPicture: 'الكاميرا',
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
      setHint('تعذر قراءة الصورة — حاول بصورة تانية.');
    }
  }

  async function runOcr(img: string) {
    setOcrRunning(true);
    setOcrProgress(0);
    try {
      const t = await recognizeText(img, setOcrProgress);
      setOcrText(t);
      if (t) setText((prev) => (prev.trim() ? prev : t));
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'تعذر قراءة الصورة.');
    } finally {
      setOcrRunning(false);
    }
  }

  function analyze() {
    const finalText = text.trim() || ocrText.trim();
    if (!finalText) {
      setHint('اكتب المشكلة أو صوّر ورقة الأول.');
      return;
    }
    setHint('');
    setAnalyzing(true);
    setTimeout(() => {
      const d = detect(finalText);
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
      title: titleForCategory(cat, detection.extracted, finalText),
      questions: questionsForCategory(cat),
      confidence: 'high',
    });
    setAnswers({});
    setShowCats(false);
  }

  function goPreview() {
    if (!detection) return;
    const finalText = text.trim() || ocrText.trim();
    const origin: KhTask['origin'] = photo ? 'photo' : 'text';
    const task = buildTaskFromDetection(finalText, detection, answers, origin, {
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
      setHint('ضيف مفتاح AI من صفحة "المزيد" عشان نفعّل التحسين.');
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
      setHint('تعذر التحسين بالـ AI — الخطة المحلية شغالة وكاملة.');
    }
  }

  function create() {
    if (!plan) return;
    stopListening();
    const images = photo ? [{ name: `صورة - ${plan.title}`.slice(0, 60), dataUrl: photo }] : [];
    onCreate(plan, images);
  }

  const finalText = text.trim() || ocrText.trim();
  const canAnalyze = Boolean(finalText) && !ocrRunning;

  return (
    <Sheet
      open={open}
      onClose={() => {
        stopListening();
        onClose();
      }}
      tall
      title={stage === 'input' ? 'إيه اللي عايز تخلّصه؟' : stage === 'questions' ? 'سؤالين سريعين' : 'خطتك جاهزة'}
      subtitle={
        stage === 'input'
          ? 'اكتب المشكلة أو صوّر الورقة — واحنا نحوّلها لخطة تنفيذ.'
          : stage === 'questions'
            ? 'عشان الخطة تطلع مظبوطة على مقاسك.'
            : 'راجع الخطة وعدّلها، وبعدين ابدأ المتابعة.'
      }
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

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
              placeholder="مثال: رخصة العربية هتخلص الشهر الجاي..."
              className="w-full resize-none rounded-2xl border-2 border-black/10 bg-black/[0.02] p-3.5 pb-12 text-[15px] font-bold outline-none placeholder:text-neutral-400 focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
            />
            <div className="absolute bottom-2.5 left-2.5 flex gap-2">
              <button
                onClick={() => (listening ? stopListening() : beginListening(text))}
                aria-label="إدخال صوتي"
                className={cx(
                  'flex h-10 w-10 items-center justify-center rounded-full text-white shadow transition',
                  listening ? 'animate-pulse bg-red-500' : 'bg-brand-500 hover:bg-brand-600',
                )}
              >
                <Mic size={18} />
              </button>
              <button
                onClick={pickPhoto}
                aria-label="تصوير ورقة"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-white shadow transition hover:bg-neutral-900 dark:bg-white dark:text-neutral-900"
              >
                <Camera size={18} />
              </button>
            </div>
          </div>
          {listening && <p className="text-center text-sm font-extrabold text-red-500">سامعك... اتكلم دلوقتي</p>}

          {photo && (
            <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              <img src={photo} alt="الورقة المصورة" className="max-h-52 w-full object-cover" />
              <button
                onClick={() => {
                  setPhoto(null);
                  setOcrText('');
                }}
                aria-label="إزالة الصورة"
                className="absolute top-2 left-2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X size={16} />
              </button>
              {ocrRunning && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2.5 text-white">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold">
                    <Loader2 size={14} className="animate-spin" />
                    <span>بنقرا الورقة... {Math.round(ocrProgress * 100)}%</span>
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
                  <span>النص المستخرج من الصورة</span>
                </p>
                {photo && (
                  <button onClick={() => runOcr(photo)} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                    <RefreshCw size={12} />
                    <span>إعادة القراءة</span>
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
                <span>بنفهم المشكلة...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>حلّلها واعملي خطة</span>
                <ArrowLeft size={20} />
              </span>
            )}
          </button>
          <p className="text-center text-xs text-neutral-400">صوّرت فاتورة؟ إيصال؟ خطاب رفض؟ ارفعها وخلّصها هيقراها.</p>
        </div>
      )}

      {stage === 'questions' && detection && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-700/15">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold">
                <span>فهمناها: </span>
                <span className="text-brand-700 dark:text-brand-400">{CATEGORY_META[detection.category].label}</span>
                {detection.deadline && (
                  <span className="text-neutral-500"> — آخر موعد: {formatShortDateAr(detection.deadline)}</span>
                )}
              </p>
              <button onClick={() => setShowCats(!showCats)} className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-brand-600">
                <span>تغيير</span>
                <ChevronDown size={14} className={cx('transition', showCats && 'rotate-180')} />
              </button>
            </div>
            {showCats && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allCategories().map((c) => (
                  <Chip key={c} selected={c === detection.category} onClick={() => changeCategory(c)}>
                    {CATEGORY_META[c].label}
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
                <SectionTitle icon={User} title="المهمة تخص مين؟" />
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
                <SectionTitle icon={User} title="المسؤول عنها؟" />
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

          <div className="flex gap-2">
            <button
              onClick={() => setStage('input')}
              className="rounded-2xl bg-black/5 px-5 py-3 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            >
              رجوع
            </button>
            <button
              onClick={goPreview}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-base font-black text-white shadow-lg transition hover:bg-brand-600"
            >
              <span>اعملي خطة التنفيذ</span>
              <ArrowLeft size={20} />
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
              {plan.steps.length.toLocaleString('ar-EG')} خطوات — {plan.docs.length.toLocaleString('ar-EG')} مستندات — {plan.sources.length.toLocaleString('ar-EG')} مصادر
            </span>
          </div>

          <div>
            <SectionTitle title="الخطوات" />
            <ol className="space-y-1.5">
              {plan.steps.map((s, i) => (
                <li key={s.id} className="flex gap-2.5 rounded-xl bg-black/[0.03] p-2.5 text-sm dark:bg-white/5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-black text-white dark:bg-neutral-200 dark:text-neutral-900">
                    {(i + 1).toLocaleString('ar-EG')}
                  </span>
                  <div>
                    <p className="font-extrabold">{s.title}</p>
                    {s.detail && <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <SectionTitle title="المستندات المطلوبة" />
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
              <span>الصورة المرفقة هتتحفظ في الوثائق وترتبط بالمسار ده.</span>
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
                <span>بنحسّن الخطة بالـ AI...</span>
              </span>
            ) : aiApplied ? (
              <span className="flex items-center gap-2">
                <Check size={16} />
                <span>اتحسنت بالـ AI</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles size={16} />
                <span>حسّن الخطة بالـ AI (اختياري)</span>
              </span>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setStage('questions')}
              className="rounded-2xl bg-black/5 px-5 py-3 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            >
              رجوع
            </button>
            <button
              onClick={create}
              className="flex-1 rounded-2xl bg-brand-500 py-3 text-base font-black text-white shadow-lg transition hover:bg-brand-600"
            >
              ابدأ المتابعة
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
