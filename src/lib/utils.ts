// ─── KHALLESA utils ────────────────────────────────────────────────

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
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

export function formatDateAr(iso?: string): string {
  const d = parseISODate(iso);
  if (!d) return 'بدون موعد';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatShortDateAr(iso?: string): string {
  const d = parseISODate(iso);
  if (!d) return 'بدون موعد';
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(d);
}

export function timeAgoAr(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min.toLocaleString('ar-EG')} د`;
  const h = Math.floor(min / 60);
  if (h < 24) return `منذ ${h.toLocaleString('ar-EG')} س`;
  const days = Math.floor(h / 24);
  if (days < 30) return `منذ ${days.toLocaleString('ar-EG')} يوم`;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(new Date(ts));
}

export function daysLeftText(days: number | null): string {
  if (days === null) return 'بدون موعد نهائي';
  if (days < 0) return `متأخرة بـ ${Math.abs(days).toLocaleString('ar-EG')} يوم`;
  if (days === 0) return 'آخر موعد النهاردة!';
  if (days === 1) return 'باقي يوم واحد';
  if (days === 2) return 'باقي يومين';
  if (days <= 10) return `باقي ${days.toLocaleString('ar-EG')} أيام`;
  return `باقي ${days.toLocaleString('ar-EG')} يوم`;
}

// ─── files / images ──────────────────────────────────────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('تعذر قراءة الملف'));
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
