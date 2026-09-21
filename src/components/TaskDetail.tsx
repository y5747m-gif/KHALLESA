import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
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
import { catLabel, pathLabel, useLang, useStrings } from '../lib/i18n';
import { buildClaimFile, nextStep, progressOf } from '../lib/engine';
import { getSource, srcCheck, srcDesc, srcName } from '../lib/sources';
import { isNative } from '../lib/notify';
import { openExternal } from '../lib/native';
import {
  compressDataUrl,
  cx,
  daysLeftText,
  daysUntil,
  downloadTextFile,
  fileToDataUrl,
  formatDate,
  num,
} from '../lib/utils';
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
  const s = useStrings();
  const lang = useLang();
  const rtl = lang === 'ar';
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
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

  function claimText(): string {
    return buildClaimFile(task, lang, owner?.name);
  }

  function claimFilename(): string {
    const base = task.title.slice(0, 30);
    return lang === 'ar' ? `مطالبة-${base}.txt` : `claim-${base}.txt`;
  }

  async function shareClaim() {
    const text = claimText();
    const title = `${s.claimTitle} — ${task.title}`;
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text });
        return;
      }
      if (isNative()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title, text, dialogTitle: s.shareFile });
        return;
      }
    } catch {
      /* user cancelled — fall back to download */
    }
    downloadTextFile(claimFilename(), text);
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    const compressed = await compressDataUrl(dataUrl);
    props.onAddPhoto(`${lang === 'ar' ? 'صورة' : 'Photo'} — ${task.title}`.slice(0, 60), compressed);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-5 pb-28">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />

      {/* header */}
      <div className="flex items-center gap-2">
        <button
          onClick={props.onBack}
          aria-label={s.back}
          className="rounded-full bg-white p-2.5 shadow-sm transition hover:shadow dark:bg-neutral-900"
        >
          <BackIcon size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {pathLabel(task.pathId, lang)} • {catLabel(task.category, lang)}
          </p>
          <h1 className={cx('truncate text-xl font-black', done && 'text-neutral-400 line-through')}>{task.title}</h1>
        </div>
        <button
          aria-label={s.starBtn}
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
            <p className="text-sm font-bold opacity-90">{done ? s.stateLabel : s.stateNeed}</p>
            <p className="text-lg font-black">{done ? s.stateDone : daysLeftText(days, lang)}</p>
            {task.deadline && !done && (
              <p className="flex items-center gap-1 text-xs font-bold opacity-80">
                <Calendar size={13} /> {s.deadlineIs} {formatDate(task.deadline, lang)}
              </p>
            )}
          </div>
          <div className="text-center">
            <p className="text-3xl font-black">{num(prog, lang)}%</p>
            <p className="text-xs font-bold opacity-80">{s.progressPct}</p>
          </div>
        </div>
        <div className="mt-3"><ProgressBar value={prog} tone="brand" /></div>
        <div className="mt-2 flex items-center justify-between">
          <TrustBadge level={task.trust} small />
          <button
            onClick={() => props.onPatch({ followUp: !task.followUp })}
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-extrabold"
          >
            {task.followUp ? <><Bell size={13} /> {s.followOn}</> : <><BellOff size={13} /> {s.followOff}</>}
          </button>
        </div>
      </div>

      {/* sticky quick bar */}
      {!done && nx && (
        <div className="sticky bottom-3 z-10 flex items-center gap-2 rounded-2xl bg-neutral-900/95 p-2.5 shadow-xl backdrop-blur dark:bg-white/95">
          <p className="min-w-0 flex-1 truncate ps-1 text-xs font-extrabold text-white dark:text-neutral-900">
            👈 {nx.title}
          </p>
          <button
            onClick={() => toggleStep(nx.id)}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-black text-white"
          >
            {s.didIt}
          </button>
        </div>
      )}

      {/* next step */}
      {!done && nx && (
        <div className="animate-pop rounded-2xl border-2 border-brand-500/40 bg-brand-50 p-3.5 dark:bg-brand-700/10">
          <p className="text-xs font-extrabold text-brand-700 dark:text-brand-400">{s.yourNextStep}</p>
          <p className="mt-0.5 font-black">{nx.title}</p>
          {nx.detail && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{nx.detail}</p>}
          <button
            onClick={() => toggleStep(nx.id)}
            className="mt-2.5 w-full rounded-xl bg-brand-500 py-2.5 text-sm font-black text-white transition hover:bg-brand-600"
          >
            {s.didIt}
          </button>
        </div>
      )}

      {/* summary */}
      <p className="rounded-2xl bg-white p-3.5 text-sm leading-7 font-bold shadow-sm dark:bg-neutral-900">{task.summary}</p>

      {/* meta editors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <p className="mb-1 flex items-center gap-1 text-xs font-extrabold text-neutral-500"><Calendar size={13} /> {s.deadlineLabel}</p>
          <input
            type="date"
            value={task.deadline ?? ''}
            onChange={(e) => props.onPatch({ deadline: e.target.value || undefined })}
            className="w-full rounded-lg bg-black/5 px-2 py-1.5 text-sm font-bold dark:bg-white/10"
          />
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <p className="mb-1 flex items-center gap-1 text-xs font-extrabold text-neutral-500"><User size={13} /> {owner ? `${s.aboutLabel}: ${owner.name}` : s.aboutNone}</p>
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
            <p className="text-sm font-bold">{assignee?.name ?? owner?.name ?? '—'}</p>
          )}
        </div>
      </div>

      {/* steps */}
      <div>
        <SectionTitle title={`${s.whatToDo} (${num(task.steps.filter((x) => x.done).length, lang)}/${num(task.steps.length, lang)})`} />
        <div className="space-y-2">
          {task.steps.map((stp, i) => (
            <div key={stp.id} className={cx('flex gap-2.5 rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900', stp.done && 'opacity-70')}>
              <button
                onClick={() => toggleStep(stp.id)}
                aria-label={stp.done ? s.undoBtn : s.doBtn}
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-black transition',
                  stp.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-black/15 text-transparent dark:border-white/20',
                )}
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className={cx('text-sm font-extrabold', stp.done && 'text-neutral-400 line-through')}>
                  <span className="text-neutral-400">{num(i + 1, lang)}. </span>{stp.title}
                </p>
                {stp.detail && !stp.done && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{stp.detail}</p>}
                {stp.actionUrl && !stp.done && (
                  <button
                    onClick={() => void openExternal(stp.actionUrl)}
                    className="mt-1.5 flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                  >
                    <ExternalLink size={12} /> {stp.actionLabel ?? s.openSource}
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
              placeholder={s.addStepPh}
              className="flex-1 rounded-xl border-2 border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-neutral-900"
            />
            <button
              onClick={() => {
                if (newStep.trim()) {
                  props.onAddStep(newStep.trim());
                  setNewStep('');
                }
              }}
              aria-label={s.addStepBtn}
              className="rounded-xl bg-neutral-800 px-3 text-white dark:bg-white dark:text-neutral-900"
            >
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>

      {/* docs */}
      <div>
        <SectionTitle title={`${s.whatNeed} (${num(task.docs.filter((d) => d.have).length, lang)}/${num(task.docs.length, lang)})`} />
        <div className="space-y-2">
          {task.docs.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                void buzz();
                props.onToggleDoc(d.id);
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-2xl p-3 text-start shadow-sm transition',
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
              placeholder={s.addDocPh}
              className="flex-1 rounded-xl border-2 border-black/10 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-neutral-900"
            />
            <button
              onClick={() => {
                if (newDoc.trim()) {
                  props.onAddDoc(newDoc.trim());
                  setNewDoc('');
                }
              }}
              aria-label={s.addDocBtn}
              className="rounded-xl bg-neutral-800 px-3 text-white dark:bg-white dark:text-neutral-900"
            >
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>

      {/* consequences */}
      <div>
        <SectionTitle icon={AlertTriangle} title={s.ifIgnored} />
        <div className="space-y-2">
          {task.consequences.map((c, i) => (
            <div
              key={i}
              className={cx(
                'rounded-2xl border-s-4 p-3 text-sm font-bold shadow-sm',
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
        <SectionTitle icon={ExternalLink} title={s.officialSources} />
        <div className="space-y-2">
          {task.sources.map((sr) => {
            const src = getSource(sr.sourceId);
            if (!src) return null;
            return (
              <div key={sr.sourceId} className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold">{srcName(src, lang)}</p>
                  <TrustBadge level={src.trust} small />
                </div>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {(lang === 'ar' ? sr.note : sr.noteEn) ?? srcDesc(src, lang)}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void openExternal(src.url)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-neutral-900 py-2 text-xs font-extrabold text-white dark:bg-white dark:text-neutral-900"
                  >
                    <ExternalLink size={13} /> {s.openSource}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400">✅ {srcCheck(src, lang)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* claim file */}
      {showClaim && (
        <div className="rounded-2xl border-2 border-dashed border-brand-500/50 p-3.5">
          <p className="flex items-center gap-1.5 font-black"><FileText size={18} className="text-brand-600" /> {s.claimTitle}</p>
          <p className="mt-1 text-xs text-neutral-500">{s.claimHint}</p>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setClaimOpen(true)} className="flex-1 rounded-xl bg-brand-500 py-2 text-sm font-extrabold text-white">{s.viewFile}</button>
            <button onClick={shareClaim} aria-label={s.shareBtn} className="rounded-xl bg-neutral-800 px-3.5 text-white dark:bg-white dark:text-neutral-900"><Share2 size={17} /></button>
            <button onClick={() => downloadTextFile(claimFilename(), claimText())} aria-label={s.downloadBtn} className="rounded-xl bg-neutral-800 px-3.5 text-white dark:bg-white dark:text-neutral-900"><Download size={17} /></button>
          </div>
        </div>
      )}

      {/* photos */}
      <div>
        <SectionTitle
          icon={Camera}
          title={`${s.attachedPhotos} (${num(props.photos.length, lang)})`}
          action={
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-extrabold text-white">
              <Plus size={14} /> {s.snapDoc}
            </button>
          }
        />
        {props.photos.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-black/10 p-4 text-center text-sm text-neutral-400 dark:border-white/10">
            {s.noPhotos}
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
            <CheckCircle2 size={20} /> {s.finishPath}
          </button>
        ) : (
          <button onClick={props.onReopen} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-black text-white">
            <RotateCcw size={18} /> {s.reopenPath}
          </button>
        )}
        <button
          onClick={() => (confirmDelete ? props.onDelete() : setConfirmDelete(true))}
          className={cx(
            'flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-extrabold transition',
            confirmDelete ? 'bg-red-600 text-white' : 'bg-black/5 text-red-600 dark:bg-white/10 dark:text-red-400',
          )}
        >
          <Trash2 size={16} /> {confirmDelete ? s.deleteSure : s.deletePath}
        </button>
      </div>

      {/* claim sheet */}
      <Sheet open={claimOpen} onClose={() => setClaimOpen(false)} title={s.claimSheetT} subtitle={s.claimSheetS}>
        <pre className="rounded-2xl bg-black/[0.04] p-3 text-[13px] leading-7 font-bold whitespace-pre-wrap dark:bg-white/5">
          {claimText()}
        </pre>
        <button onClick={shareClaim} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-2.5 text-sm font-black text-white">
          <Share2 size={16} /> {s.shareFile}
        </button>
      </Sheet>

      {/* photo viewer */}
      <Sheet open={photoOpen !== null} onClose={() => setPhotoOpen(null)} title={s.photoSheetT}>
        {photoOpen && <img src={photoOpen} alt="doc" className="w-full rounded-2xl" />}
      </Sheet>
    </div>
  );
}
