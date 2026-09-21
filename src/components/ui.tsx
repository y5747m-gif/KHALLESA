import { ShieldAlert, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TrustLevel } from '../lib/types';
import { trustHint, trustLabel, useLang, useStrings } from '../lib/i18n';
import { cx } from '../lib/utils';

// ─── Bottom sheet ────────────────────────────────────────────────────

export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  tall?: boolean;
}) {
  const s = useStrings();
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={props.onClose} />
      <div
        className={cx(
          'animate-sheet-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-neutral-900',
          props.tall ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4 dark:border-white/10">
          <div>
            {props.title && <h2 className="text-lg font-extrabold">{props.title}</h2>}
            {props.subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{props.subtitle}</p>}
          </div>
          <button
            onClick={props.onClose}
            aria-label={s.close}
            className="rounded-full bg-black/5 p-2 text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-safe">{props.children}</div>
      </div>
    </div>
  );
}

// ─── Trust badge ─────────────────────────────────────────────────────

const TRUST_STYLE: Record<TrustLevel, { cls: string; Icon: LucideIcon }> = {
  official: { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: ShieldCheck },
  trusted: { cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300', Icon: ShieldCheck },
  verify: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', Icon: ShieldQuestion },
  danger: { cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', Icon: ShieldAlert },
};

export function TrustBadge({ level, small }: { level: TrustLevel; small?: boolean }) {
  const lang = useLang();
  const { cls, Icon } = TRUST_STYLE[level];
  return (
    <span
      title={trustHint(level, lang)}
      className={cx(
        'inline-flex items-center gap-1 rounded-full font-bold',
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        cls,
      )}
    >
      <Icon size={small ? 12 : 14} />
      {trustLabel(level, lang)}
    </span>
  );
}

// ─── Progress ────────────────────────────────────────────────────────

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'red' | 'amber' }) {
  const bar =
    tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ─── Section title ───────────────────────────────────────────────────

export function SectionTitle(props: { icon?: LucideIcon; title: string; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-neutral-700 dark:text-neutral-200">
        {Icon && <Icon size={16} className="text-brand-600 dark:text-brand-500" />}
        {props.title}
      </h3>
      {props.action}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────

export function EmptyState(props: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-black/10 px-6 py-10 text-center dark:border-white/10">
      <div className="rounded-full bg-brand-50 p-4 text-brand-600 dark:bg-brand-700/20 dark:text-brand-500">
        <Icon size={28} />
      </div>
      <p className="font-extrabold">{props.title}</p>
      {props.hint && <p className="text-sm text-neutral-500 dark:text-neutral-400">{props.hint}</p>}
      {props.action}
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

// ─── Option chips (for questions) ────────────────────────────────────

export function Chip({
  selected,
  children,
  onClick,
}: {
  selected?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-full border-2 px-3 py-1.5 text-sm font-bold transition',
        selected
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-black/10 bg-black/[0.03] text-neutral-700 hover:border-brand-500/50 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}
