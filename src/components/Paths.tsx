import { useState } from 'react';
import {
  Briefcase,
  Car,
  ChevronDown,
  FileText,
  Home as HomeIcon,
  Package,
  Plane,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PathId, RankedTask } from '../lib/types';
import { pathHint, pathLabel, useLang, useStrings } from '../lib/i18n';
import { progressOf } from '../lib/engine';
import { cx, daysLeftText, num } from '../lib/utils';
import { ProgressBar } from './ui';

const PATH_ORDER: PathId[] = ['car', 'home', 'work', 'travel', 'money', 'docs', 'family', 'other'];

const PATH_ICONS: Record<PathId, { Icon: LucideIcon; cls: string }> = {
  car: { Icon: Car, cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  home: { Icon: HomeIcon, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  work: { Icon: Briefcase, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' },
  travel: { Icon: Plane, cls: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  money: { Icon: Wallet, cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
  docs: { Icon: FileText, cls: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  family: { Icon: Users, cls: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
  other: { Icon: Package, cls: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300' },
};

interface PathsProps {
  ranked: RankedTask[];
  onOpenTask: (id: string) => void;
  onAdd: () => void;
}

export default function Paths({ ranked, onOpenTask, onAdd }: PathsProps) {
  const s = useStrings();
  const lang = useLang();
  const [expanded, setExpanded] = useState<PathId | null>('car');
  const active = ranked.filter((r) => r.bucket !== 'done');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-5 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">{s.pathsTitle}</h1>
          <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
            {s.pathsSub} — {num(active.length, lang)} {s.pathsActive}
          </p>
        </div>
        <button
          onClick={onAdd}
          aria-label={s.newPath}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg"
        >
          <Plus size={22} />
        </button>
      </div>

      {PATH_ORDER.map((pid) => {
        const items = active.filter((r) => r.task.pathId === pid);
        const doneCount = ranked.filter((r) => r.task.pathId === pid && r.bucket === 'done').length;
        const { Icon, cls } = PATH_ICONS[pid];
        const isOpen = expanded === pid;
        const avg = items.length
          ? Math.round(items.reduce((sm, r) => sm + progressOf(r.task), 0) / items.length)
          : doneCount > 0 ? 100 : 0;
        return (
          <div key={pid} className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-neutral-900">
            <button onClick={() => setExpanded(isOpen ? null : pid)} className="flex w-full items-center gap-3 p-3.5">
              <span className={cx('rounded-2xl p-2.5', cls)}>
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block font-black">{pathLabel(pid, lang)}</span>
                <span className="block truncate text-xs font-bold text-neutral-400">{pathHint(pid, lang)}</span>
                {(items.length > 0 || doneCount > 0) && (
                  <span className="mt-1.5 block"><ProgressBar value={avg} /></span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-center gap-1">
                <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-black', items.length ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-black/5 text-neutral-400 dark:bg-white/10')}>
                  {num(items.length, lang)}
                </span>
                <ChevronDown size={16} className={cx('text-neutral-400 transition', isOpen && 'rotate-180')} />
              </span>
            </button>
            {isOpen && (
              <div className="space-y-1.5 border-t border-black/5 p-3 dark:border-white/10">
                {items.length === 0 ? (
                  <p className="rounded-xl bg-black/[0.03] p-3 text-center text-xs font-bold text-neutral-400 dark:bg-white/5">
                    {s.noActive} {doneCount > 0 ? `— ${num(doneCount, lang)} ${s.doneBefore}` : `— ${s.startFirstOne}`}
                  </p>
                ) : (
                  items.map(({ task, daysLeft }) => (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task.id)}
                      className="flex w-full items-center gap-2 rounded-xl bg-black/[0.03] p-2.5 text-start transition hover:bg-black/[0.06] dark:bg-white/5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{task.title}</span>
                        <span className="block text-[11px] font-bold text-neutral-400">{daysLeftText(daysLeft, lang)}</span>
                      </span>
                      <span className="shrink-0 text-xs font-black text-brand-600">
                        {num(progressOf(task), lang)}%
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
