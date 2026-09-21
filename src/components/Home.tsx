import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  ListTodo,
  Mic,
  Plus,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Bucket, RankedTask } from '../lib/types';
import { catLabel, pathLabel, useLang, useStrings } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { nextStep, progressOf } from '../lib/engine';
import { cx, daysLeftText, formatShortDate, num } from '../lib/utils';
import { Chip, EmptyState, ProgressBar, SectionTitle, Sheet, TrustBadge } from './ui';
import { InstallBanner, InstallButton } from './InstallApp';

export interface AddRequest {
  prefill?: string;
  mode?: 'text' | 'voice' | 'photo';
}

interface HomeProps {
  userName: string;
  ranked: RankedTask[];
  onAdd: (req?: AddRequest) => void;
  onOpenTask: (id: string) => void;
  onOpenAssistant: () => void;
  onToggleStar: (id: string) => void;
}

type Filter = 'all' | Bucket;

const EXAMPLES: Record<Lang, string[]> = {
  ar: [
    'رخصة العربية هتخلص الشهر الجاي',
    'عايز أنقل شقة إيجار في فيصل',
    'أنا مسافر يوم 15 أكتوبر',
    'اشتريت غسالة وعايز أحمي الضمان',
  ],
  en: [
    'My car license expires next month',
    'I want to rent an apartment in Faisal',
    'I am traveling on October 15',
    'I bought a washer and want to protect the warranty',
  ],
};

export default function Home({ userName, ranked, onAdd, onOpenTask, onOpenAssistant, onToggleStar }: HomeProps) {
  const s = useStrings();
  const lang = useLang();
  const rtl = lang === 'ar';
  const FwdIcon = rtl ? ChevronLeft : ChevronRight;
  const [filter, setFilter] = useState<Filter>('all');
  const [nowOpen, setNowOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { now: 0, soon: 0, waiting: 0, done: 0 };
    for (const r of ranked) c[r.bucket]++;
    return c;
  }, [ranked]);

  const overdue = useMemo(
    () => ranked.filter((r) => r.bucket === 'now' && (r.daysLeft ?? 99) < 0),
    [ranked],
  );

  const top3 = useMemo(() => ranked.filter((r) => r.bucket !== 'done').slice(0, 3), [ranked]);

  const visible = useMemo(
    () => (filter === 'all' ? ranked : ranked.filter((r) => r.bucket === filter)),
    [ranked, filter],
  );

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? s.hiMorning : hour >= 12 && hour < 17 ? s.hiAfternoon : s.hiEvening;

  function filterLabel(f: Bucket): string {
    return f === 'now' ? s.cNeed : f === 'soon' ? s.cSoon : f === 'waiting' ? s.cWaiting : s.cDone;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-5 pb-28">
      {/* header */}
      <header className="flex items-center gap-3">
        <img src="./logo.svg" alt="KHALLESA" className="h-11 w-11 rounded-2xl shadow" />
        <div className="flex-1">
          <h1 className="text-2xl leading-7 font-black">
            {greeting}
            {userName ? `، ${userName}` : ''} 👋
          </h1>
          <p className="text-sm font-bold text-brand-700 dark:text-brand-500">{s.slogan}</p>
        </div>
        <InstallButton />
      </header>

      {/* hero input */}
      <div className="rounded-3xl bg-gradient-to-bl from-brand-600 to-brand-700 p-5 text-white shadow-lg">
        <p className="mb-3 text-xl font-black">{s.heroTitle}</p>
        <button
          onClick={() => onAdd()}
          className="flex w-full items-center gap-2 rounded-2xl bg-white/95 p-3.5 text-start text-sm font-bold text-neutral-500 shadow transition hover:bg-white"
        >
          <Plus size={18} className="shrink-0 text-brand-600" />
          {s.heroInputPh}
        </button>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onAdd({ mode: 'voice' })}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-sm font-extrabold transition hover:bg-white/25"
          >
            <Mic size={16} /> {s.heroSpeak}
          </button>
          <button
            onClick={() => onAdd({ mode: 'photo' })}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-sm font-extrabold transition hover:bg-white/25"
          >
            <Camera size={16} /> {s.heroPhoto}
          </button>
          <button
            onClick={onOpenAssistant}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2.5 text-sm font-extrabold text-neutral-900 transition hover:bg-amber-300"
          >
            <Sparkles size={16} /> {s.heroAi}
          </button>
        </div>
      </div>

      {/* install-as-app nudge (web only, dismissible) */}
      <InstallBanner />

      {/* counters */}
      <div className="grid grid-cols-4 gap-2">
        <CounterBtn active={filter === 'now'} onClick={() => setFilter(filter === 'now' ? 'all' : 'now')}
          icon={<Flame size={18} />} label={s.cNeed} value={counts.now} activeCls="border-red-500 bg-red-50 dark:bg-red-950/30" iconCls="text-red-500" />
        <CounterBtn active={filter === 'soon'} onClick={() => setFilter(filter === 'soon' ? 'all' : 'soon')}
          icon={<Clock size={18} />} label={s.cSoon} value={counts.soon} activeCls="border-amber-500 bg-amber-50 dark:bg-amber-950/30" iconCls="text-amber-500" />
        <CounterBtn active={filter === 'waiting'} onClick={() => setFilter(filter === 'waiting' ? 'all' : 'waiting')}
          icon={<ListTodo size={18} />} label={s.cWaiting} value={counts.waiting} activeCls="border-sky-500 bg-sky-50 dark:bg-sky-950/30" iconCls="text-sky-500" />
        <CounterBtn active={filter === 'done'} onClick={() => setFilter(filter === 'done' ? 'all' : 'done')}
          icon={<CheckCircle2 size={18} />} label={s.cDone} value={counts.done} activeCls="border-brand-500 bg-brand-50 dark:bg-brand-700/20" iconCls="text-brand-600" />
      </div>

      {/* overdue banner */}
      {overdue.length > 0 && (
        <div className="animate-pop flex items-center gap-3 rounded-2xl bg-red-600 p-3.5 text-white shadow">
          <AlertTriangle size={24} className="shrink-0" />
          <div className="text-sm">
            <p className="font-black">{num(overdue.length, lang)} {s.overdueT}</p>
            <p className="opacity-90">{s.overdueS}</p>
          </div>
        </div>
      )}

      {/* what now */}
      <button
        onClick={() => setNowOpen(true)}
        className="animate-pulse-ring flex w-full items-center justify-between rounded-2xl bg-neutral-900 p-4 text-white shadow-lg dark:bg-white dark:text-neutral-900"
      >
        <span className="flex items-center gap-2 text-lg font-black">
          <Sparkles size={20} className="text-amber-400" />
          {s.whatNow}
        </span>
        <FwdIcon size={22} />
      </button>

      {/* list */}
      <div>
        <SectionTitle
          title={filter === 'all' ? s.yourPaths : `${s.showOnly} ${filterLabel(filter)}`}
          action={filter !== 'all' ? <button onClick={() => setFilter('all')} className="text-xs font-bold text-brand-600">{s.showAll}</button> : undefined}
        />
        {visible.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={filter === 'all' ? s.emptyAll : s.emptyFilter}
            hint={filter === 'all' ? s.emptyAllHint : undefined}
            action={filter === 'all' ? <button onClick={() => onAdd()} className="mt-2 rounded-full bg-brand-500 px-5 py-2 text-sm font-extrabold text-white">{s.startFirst}</button> : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {visible.map(({ task, bucket, daysLeft, reason }) => {
              const nx = nextStep(task);
              const prog = task.status === 'done' ? 100 : progressOf(task);
              return (
                <div
                  key={task.id}
                  onClick={() => onOpenTask(task.id)}
                  className="cursor-pointer rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dotCls(bucket))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cx('font-extrabold', task.status === 'done' && 'text-neutral-400 line-through')}>{task.title}</p>
                        <button
                          aria-label={s.starBtn}
                          onClick={(e) => { e.stopPropagation(); onToggleStar(task.id); }}
                          className={cx('shrink-0 rounded-full p-1', task.starred ? 'text-amber-500' : 'text-neutral-300 dark:text-neutral-600')}
                        >
                          <Star size={18} fill={task.starred ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <p className="mt-0.5 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                        {catLabel(task.category, lang)} • {pathLabel(task.pathId, lang)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-extrabold', chipCls(bucket, task.status))}>
                          {task.status === 'done' ? s.doneBadge : daysLeftText(daysLeft, lang)}
                        </span>
                        {task.deadline && task.status === 'active' && (
                          <span className="text-[11px] font-bold text-neutral-400">{formatShortDate(task.deadline, lang)}</span>
                        )}
                        <TrustBadge level={task.trust} small />
                      </div>
                      {task.status === 'active' && (
                        <>
                          <div className="mt-2"><ProgressBar value={prog} tone={bucket === 'now' ? 'red' : bucket === 'soon' ? 'amber' : 'brand'} /></div>
                          <p className="mt-1.5 truncate text-xs font-bold text-neutral-600 dark:text-neutral-300">
                            👈 {nx ? `${s.nextStepIs} ${nx.title}` : s.finishDocs}
                          </p>
                          <p className="mt-0.5 text-[11px] text-neutral-400">🧠 {reason}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* examples */}
      <div>
        <SectionTitle title={s.trySay} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {EXAMPLES[lang].map((ex) => (
            <button
              key={ex}
              onClick={() => onAdd({ prefill: ex })}
              className="shrink-0 rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-bold text-neutral-600 shadow-sm transition hover:border-brand-500 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300"
            >
              “{ex}”
            </button>
          ))}
        </div>
      </div>

      {/* what-now sheet */}
      <Sheet open={nowOpen} onClose={() => setNowOpen(false)} title={`🧠 ${s.whatNow}`} subtitle={s.whatNowSub}>
        {top3.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={s.allDone} />
        ) : (
          <div className="space-y-3">
            {top3.map(({ task, reason }, i) => {
              const nx = nextStep(task);
              return (
                <div key={task.id} className="rounded-2xl border-2 border-brand-500/30 bg-brand-50/50 p-3.5 dark:bg-brand-700/10">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">
                      {num(i + 1, lang)}
                    </span>
                    <p className="font-extrabold">{task.title}</p>
                  </div>
                  <p className="mt-1.5 text-sm font-bold text-neutral-600 dark:text-neutral-300">📌 {reason}</p>
                  {nx && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">👈 {s.nextStepIs} <b>{nx.title}</b></p>}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => { setNowOpen(false); onOpenTask(task.id); }}
                      className="flex-1 rounded-xl bg-brand-500 py-2 text-sm font-extrabold text-white transition hover:bg-brand-600"
                    >
                      {s.openAndFinish}
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="text-center text-xs text-neutral-400">{s.finishFirst}</p>
          </div>
        )}
      </Sheet>

      {/* quick add fab */}
      <button
        onClick={() => onAdd()}
        aria-label={s.newPath}
        className="fixed end-4 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl transition hover:bg-brand-600"
      >
        <Plus size={26} />
      </button>

      <div className="flex justify-center gap-2 pt-1">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>{s.filterAll}</Chip>
        <Chip selected={filter === 'now'} onClick={() => setFilter('now')}>{s.filterNow}</Chip>
        <Chip selected={filter === 'soon'} onClick={() => setFilter('soon')}>{s.filterSoon}</Chip>
      </div>
    </div>
  );
}

function CounterBtn(props: { active: boolean; onClick: () => void; icon: ReactNode; label: string; value: number; activeCls: string; iconCls: string }) {
  const lang = useLang();
  return (
    <button
      onClick={props.onClick}
      className={cx(
        'flex flex-col items-center gap-0.5 rounded-2xl border-2 bg-white py-2.5 shadow-sm transition dark:bg-neutral-900',
        props.active ? props.activeCls : 'border-transparent',
      )}
    >
      <span className={props.iconCls}>{props.icon}</span>
      <span className="text-lg leading-5 font-black">{num(props.value, lang)}</span>
      <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">{props.label}</span>
    </button>
  );
}

function dotCls(b: Bucket): string {
  return b === 'now' ? 'bg-red-500' : b === 'soon' ? 'bg-amber-500' : b === 'waiting' ? 'bg-sky-500' : 'bg-brand-500';
}

function chipCls(b: Bucket, status: string): string {
  if (status === 'done') return 'bg-brand-100 text-brand-800 dark:bg-brand-700/30 dark:text-brand-300';
  return b === 'now'
    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    : b === 'soon'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
}
