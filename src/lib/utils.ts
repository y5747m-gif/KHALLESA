// ─── KHALLESA utils ────────────────────────────────────────────────
import { STR } from './i18n';
import type { Lang } from './i18n';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** locale-aware number: ١٢٣ in Arabic, 123 in English */
export function num(n: number, lang: Lang = 'ar'): string {
  return n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US');
}

function localeOf(lang: Lang): string {
  return lang === 'ar' ? 'ar-EG' : 'en-GB';
}

// ─── dates ───────────────────────────────────────────────────────────

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso) ?? new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function parseISODate(iso?: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** days from `from` (start of day) to deadline. null = no deadline. negative = overdue */
export function daysUntil(iso?: string, from: Date = new Date()): number | null {
  const d = parseISODate(iso);
  if (!d) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function formatDate(iso: string | undefined, lang: Lang = 'ar'): string {
  const d = parseISODate(iso);
  if (!d) return STR[lang].noDate;
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatShortDate(iso: string | undefined, lang: Lang = 'ar'): string {
  const d = parseISODate(iso);
  if (!d) return STR[lang].noDate;
  return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'long' }).format(d);
}

export function timeAgo(ts: number, lang: Lang = 'ar'): string {
  const s = STR[lang];
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return s.now;
  if (lang === 'ar') {
    if (min < 60) return `${s.sinceWord} ${num(min, lang)} ${s.minAgo}`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${s.sinceWord} ${num(h, lang)} ${s.hourAgo}`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${s.sinceWord} ${num(days, lang)} ${s.dayAgo}`;
  } else {
    if (min < 60) return `${min}${s.minAgo} ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}${s.hourAgo} ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}${s.dayAgo} ago`;
  }
  return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short' }).format(new Date(ts));
}

export function daysLeftText(days: number | null, lang: Lang = 'ar'): string {
  const s = STR[lang];
  if (days === null) return s.noDeadline;
  if (days < 0) {
    const n = Math.abs(days);
    return lang === 'ar' ? `${s.overdueBy} ${num(n, lang)} ${s.daysUnit}` : `${s.overdueBy} ${n} ${s.daysUnit}`;
  }
  if (days === 0) return s.lastDayToday;
  if (days === 1) return s.oneDayLeft;
  if (days === 2) return s.twoDaysLeft;
  if (lang === 'ar') {
    return days <= 10 ? `${s.daysLeftN} ${num(days, lang)} ${s.daysLeftDays}` : `${s.daysLeftN} ${num(days, lang)} ${s.daysUnit}`;
  }
  return `${days} ${s.daysLeftDays}`;
}

// ─── files / images ──────────────────────────────────────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('file'));
    r.readAsDataURL(file);
  });
}

/** downscale + jpeg compress so the vault stays light on device */
export function compressDataUrl(dataUrl: string, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
