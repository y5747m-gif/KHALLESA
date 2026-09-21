import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Calendar,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Plus,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  User,
} from 'lucide-react';
import type { FamilyMember, KhTask, VaultDoc } from '../lib/types';
import { CATEGORY_META, PATH_META } from '../lib/types';
import { buildClaimFile, nextStep, progressOf } from '../lib/engine';
import { getSource } from '../lib/sources';
import { isNative } from '../lib/notify';
import {
  compressDataUrl,
  cx,
  daysLeftText,
  downloadTextFile,
  fileToDataUrl,
  formatDateAr,
} from '../lib/utils';
import { daysUntil } from '../lib/utils';
import { ProgressBar, SectionTitle, Sheet, TrustBadge } from './ui';

interface TaskDetailProps {
  task: KhTask;
  members: FamilyMember[];
  photos: VaultDoc[];
  onBack: () => void;
  onToggleStep: (stepId: string) => void;
  onToggleDoc: (docId: string) => void;
  onAddStep: (title: string) => void;
  onAddDoc: (label: string) => void;
  onPatch: (patch: Partial<KhTask>) => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onAddPhoto: (name: string, dataUrl: string) => void;
}

export default function TaskDetail(props: TaskDetailProps) {
  const { task } = props;
  const [newStep, setNewStep] = useState('');
  const [newDoc, setNewDoc] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nx = nextStep(task);
  const prog = task.status === 'done' ? 100 : progressOf(task);
  const days = daysUntil(task.deadline);
  const done = task.status === 'done';
  const showClaim = task.category === 'warranty' || task.category === 'return' || task.category === 'purchase';
  const owner = props.members.find((m) => m.id === task.ownerId);
  const assignee = props.members.find((m) => m.id === task.assigneeId);

  async function buzz() {
    try {
      if (!isNative()) return;
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* noop */
    }
  }

  function toggleStep(id: string) {
    void buzz();
    props.onToggleStep(id);
  }

  async function shareClaim() {
    const text = buildClaimFile(task, owner?.name);
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title: `ملف مطالبة — ${task.title}`, text });
        return;
      }
      if (isNative()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: `ملف مطالبة — ${task.title}`, text, dialogTitle: 'مشاركة ملف المطالبة' });
        return;
      }
    } catch {
      /* user cancelled or failed — fall back to download */
    }
    downloadTextFile(`مطالبة-${task.title.slice(0, 30)}.txt`, text);
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    const compressed = await compressDataUrl(dataUrl);
    props.onAddPhoto(`صورة — ${task.title}`.slice(0, 60), compressed);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-5 pb-28">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />

      {/* header */}
      <div className="flex items-center gap-2">
        <button
          onClick={props.onBack}
          aria-label="رجوع"
          className="rounded-full bg-white p-2.5 shadow-sm transition hover:shadow dark:bg-neutral-900"
        >
          <ArrowRight size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {PATH_META[task.pathId].label} • {CATEGORY_META[task.category].label}
          </p>
          <h1 className={cx('truncate text-xl font-black', done && 'text-neutral-400 line-through')}>{task.title}</h1>
        </div>
        <button
          aria-label="تمييز"
          onClick={() => props.onPatch({ starred: !task.starred })}
          className={cx('rounded-full p-2', task.starred ? 'text-amber-500' : 'text-neutral-300 dark:text-neutral-600')}
        >
          <Star size={22} fill={task.starred ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* status card */}
      <div className={cx('rounded-3xl p-4 text-white shadow-lg', done ? 'bg-brand-600' : days !== null && days < 0 ? 'bg-red-600' : days !== null && days <= 3 ? 'bg-gradient-to-bl from-red-500 to-orange-500' : 'bg-neutral-900 dark:bg-neutral-800')}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold opacity-90">{done ? 'الحالة' : 'الحالة: تحتاج إجراء'}</p>
            <p className="text-lg font-black">{done ? 'خلصت ✅ عاش!' : daysLeftText(days)}</p>
            {task.deadline && !done && (
              <p className="flex items-center gap-1 text-xs font-bold opacity-80">
                <Calendar size={13} /> آخر موعد: {formatDateAr(task.deadline)}
              </p>
            )}
          </div>
          <div className="text-center">
            <p className="text-3xl font-black">{prog.toLocaleString('ar-EG')}%</p>
            <p className="text-xs font-bold opacity-80">نسبة الإنجاز</p>
          </div>
        </div>
        <div className="mt-3"><ProgressBar value={prog} tone="brand" /></div>
        <div className="mt-2 flex items-center justify-between">
          <TrustBadge level={task.trust} small />
          <button
            onClick={() => props.onPatch({ followUp: !task.followUp })}
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-extrabold"
          >
            {task.followUp ? <><Bell size={13} /> المتابعة شغالة</> : <><BellOff size={13} /> ابدأ المتابعة</>}
          </button>
        </div>
      </div>

      {/* next step */}
      {!done && nx && (
        <div className="animate-pop rounded-2xl border-2 border-brand-500/40 bg-brand-50 p-3.5 dark:bg-brand-700/10">
          <p className="text-xs font-extrabold text-brand-700 dark:text-brand-400">👈 خطوتك الجاية</p>
          <p className="mt-0.5 font-black">{nx.title}</p>
          {nx.detail && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{nx.detail}</p>}
          <button
            onClick={() => toggleStep(nx.id)}
            className="mt-2.5 w-full rounded-xl bg-brand-500 py-2.5 text-sm font-black text-white transition hover:bg-brand-600"
          >
            عملتها ✅
          </button>
        </div>
      )}

      {/* summary */}
      <p className="rounded-2xl bg-white p-3.5 text-sm leading-7 font-bold shadow-sm dark:bg-neutral-900">{task.summary}</p>

      {/* meta editors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <p className="mb-1 flex items-center gap-1 text-xs font-extrabold text-neutral-500"><Calendar size={13} /> آخر موعد</p>
          <input
            type="date"
            value={task.deadline ?? ''}
            onChange={(e) => props.onPatch({ deadline: e.target.value || undefined })}
            className="w-full rounded-lg bg-black/5 px-2 py-1.5 text-sm font-bold dark:bg-white/10"
          />
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <p className="mb-1 flex items-center gap-1 text-xs font-extrabold text-neutral-500"><User size={13} /> {owner ? `تخص: ${owner.name}` : 'تخص مين؟'}</p>
          {props.members.length > 1 ? (
            <select
              value={task.ownerId ?? ''}
              onChange={(e) => props.onPatch({ ownerId: e.target.value || undefined })}
              className="w-full rounded-lg bg-black/5 px-2 py-1.5 text-sm font-bold dark:bg-white/10"
            >
              <option value="">—</option>
              {props.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.relation})</option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-bold">{assignee?.name ?? 'أنا'}</p>
          )}
        </div>
      </div>

      {/* steps */}
      <div>
        <SectionTitle title={`ماذا تفعل؟ (${task.steps.filter((s) => s.done).length.toLocaleString('ar-EG')}/${task.steps.length.toLocaleString('ar-EG')})`} />
        <div className="space-y-2">
          {task.steps.map((s, i) => (
            <div key={s.id} className={cx('flex gap-2.5 rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900', s.done && 'opacity-70')}>
              <button
                onClick={() => toggleStep(s.id)}
                aria-label={s.done ? 'إلغاء' : 'تم'}
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-black transition',
                  s.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-black/15 text-transparent dark:border-white/20',
                )}
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className={cx('text-sm font-extrabold', s.done && 'text-neutral-400 line-through')}>
                  <span className="text-neutral-400">{(i + 1).toLocaleString('ar-EG')}. </span>{s.title}
                </p>
                {s.detail && !s.done && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{s.detail}</p>}
                {s.actionUrl && !s.done && (
                  <button
                    onClick={() => window.open(s.actionUrl, '_blank', 'noopener')}
                    className="mt-1.5 flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                  >
                    <ExternalLink size={12} /> {s.actionLabel ?? 'افتح الرابط'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {!done && (
          <div className="mt-2 flex gap-2">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStep.trim()) {
                  props.onAddStep(newStep.trim());
                  setNewStep('');
                }
              }}
              placeholder="ضيف خطوة…"
              className="flex-1 rounded-xl border-2 border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-neutral-900"
            />
            <button
              onClick={() => {
                if (newStep.trim()) {
                  props.onAddStep(newStep.trim());
                  setNewStep('');
                }
              }}
              aria-label="إضافة خطوة"
              className="rounded-xl bg-neutral-800 px-3 text-white dark:bg-white dark:text-neutral-900"
            >
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>

      {/* docs */}
      <div>
        <SectionTitle title={`ماذا تحتاج؟ (${task.docs.filter((d) => d.have).length.toLocaleString('ar-EG')}/${task.docs.length.toLocaleString('ar-EG')})`} />
        <div className="space-y-2">
          {task.docs.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                void buzz();
                props.onToggleDoc(d.id);
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-2xl p-3 text-right shadow-sm transition',
                d.have ? 'bg-brand-50 dark:bg-brand-700/15' : 'bg-amber-50 dark:bg-amber-900/15',
              )}
            >
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 font-black', d.have ? 'border-brand-500 bg-brand-500 text-white' : 'border-amber-500/50 text-transparent')}>
                ✓
              </span>
              <span className="flex-1">
                <span className={cx('block text-sm font-extrabold', d.have && 'text-neutral-400 line-through')}>{d.have ? '☑' : '☐'} {d.label}</span>
                {d.hint && <span className="block text-xs text-neutral-500">{d.hint}</span>}
              </span>
            </button>
          ))}
        </div>
        {!done && (
          <div className="mt-2 flex gap-2">
            <input
              value={newDoc}
              onChange={(e) => setNewDoc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDoc.trim()) {
                  props.onAddDoc(newDoc.trim());
                  setNewDoc('');
                }
              }}
              placeholder="ضيف مستند مطلوب…"
              className="flex-1 rounded-xl border-2 border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-neutral-900"
            />
            <button
              onClick={() => {
                if (newDoc.trim()) {
                  props.onAddDoc(newDoc.trim());
                  setNewDoc('');
                }
              }}
              aria-label="إضافة مستند"
              className="rounded-xl bg-neutral-800 px-3 text-white dark:bg-white dark:text-neutral-900"
            >
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>

      {/* consequences */}
      <div>
        <SectionTitle icon={AlertTriangle} title="لو تجاهلتها…" />
        <div className="space-y-2">
          {task.consequences.map((c, i) => (
            <div
              key={i}
              className={cx(
                'rounded-2xl border-r-4 p-3 text-sm font-bold shadow-sm',
                c.level === 'danger'
                  ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200'
                  : c.level === 'warn'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                    : 'border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
              )}
            >
              {c.level === 'danger' ? '🔴 ' : c.level === 'warn' ? '⚠️ ' : 'ℹ️ '}{c.text}
            </div>
          ))}
        </div>
      </div>

      {/* sources */}
      <div>
        <SectionTitle icon={ExternalLink} title="المصادر الرسمية" />
        <div className="space-y-2">
          {task.sources.map((sr) => {
            const src = getSource(sr.sourceId);
            if (!src) return null;
            return (
              <div key={sr.sourceId} className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold">{src.name}</p>
                  <TrustBadge level={src.trust} small />
                </div>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{sr.note ?? src.description}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => window.open(src.url, '_blank', 'noopener')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-neutral-900 py-2 text-xs font-extrabold text-white dark:bg-white dark:text-neutral-900"
                  >
                    <ExternalLink size={13} /> افتح المصدر الرسمي
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400">✅ {src.checkNote}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* claim file */}
      {showClaim && (
        <div className="rounded-2xl border-2 border-dashed border-brand-500/50 p-3.5">
          <p className="flex items-center gap-1.5 font-black"><FileText size={18} className="text-brand-600" /> ملف المطالبة</p>
          <p className="mt-1 text-xs text-neutral-500">ملف مرتب ببيانات المشكلة والمستندات — جاهز تبعته للضمان أو المتجر أو حماية المستهلك.</p>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setClaimOpen(true)} className="flex-1 rounded-xl bg-brand-500 py-2 text-sm font-extrabold text-white">عرض الملف</button>
            <button onClick={shareClaim} aria-label="مشاركة" className="rounded-xl bg-neutral-800 px-3.5 text-white dark:bg-white dark:text-neutral-900"><Share2 size={17} /></button>
            <button onClick={() => downloadTextFile(`مطالبة-${task.title.slice(0, 30)}.txt`, buildClaimFile(task, owner?.name))} aria-label="تحميل" className="rounded-xl bg-neutral-800 px-3.5 text-white dark:bg-white dark:text-neutral-900"><Download size={17} /></button>
          </div>
        </div>
      )}

      {/* photos */}
      <div>
        <SectionTitle
          icon={Camera}
          title={`الصور المرفقة (${props.photos.length.toLocaleString('ar-EG')})`}
          action={
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-extrabold text-white">
              <Plus size={14} /> صوّر مستند
            </button>
          }
        />
        {props.photos.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-black/10 p-4 text-center text-sm text-neutral-400 dark:border-white/10">
            مفيش صور — صوّر الفواتير والإيصالات واحفظها هنا.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {props.photos.map((p) => (
              <button key={p.id} onClick={() => p.dataUrl && setPhotoOpen(p.dataUrl)} className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                {p.dataUrl && <img src={p.dataUrl} alt={p.name} className="h-24 w-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="space-y-2 pb-2">
        {!done ? (
          <button onClick={props.onComplete} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-base font-black text-white shadow-lg transition hover:bg-brand-600">
            <CheckCircle2 size={20} /> خلصتها ✅
          </button>
        ) : (
          <button onClick={props.onReopen} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-black text-white">
            <RotateCcw size={18} /> إعادة فتح المسار
          </button>
        )}
        <button
          onClick={() => (confirmDelete ? props.onDelete() : setConfirmDelete(true))}
          className={cx(
            'flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-extrabold transition',
            confirmDelete ? 'bg-red-600 text-white' : 'bg-black/5 text-red-600 dark:bg-white/10 dark:text-red-400',
          )}
        >
          <Trash2 size={16} /> {confirmDelete ? 'متأكد؟ اضغط تاني للحذف' : 'حذف المسار'}
        </button>
      </div>

      {/* claim sheet */}
      <Sheet open={claimOpen} onClose={() => setClaimOpen(false)} title="ملف المطالبة" subtitle="انسخه أو شاركه مع الجهة">
        <pre className="rounded-2xl bg-black/[0.04] p-3 text-[13px] leading-7 font-bold whitespace-pre-wrap dark:bg-white/5">
          {buildClaimFile(task, owner?.name)}
        </pre>
        <button onClick={shareClaim} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-2.5 text-sm font-black text-white">
          <Share2 size={16} /> مشاركة الملف
        </button>
      </Sheet>

      {/* photo viewer */}
      <Sheet open={photoOpen !== null} onClose={() => setPhotoOpen(null)} title="الصورة">
        {photoOpen && <img src={photoOpen} alt="مستند" className="w-full rounded-2xl" />}
      </Sheet>
    </div>
  );
}
