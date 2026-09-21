import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  Trophy,
  User,
  Zap,
} from 'lucide-react';
import type { ActivityEvent, AppSettings, KhTask } from '../lib/types';
import { SOURCES } from '../lib/sources';
import { ensureNotificationPermission, pingNow } from '../lib/notify';
import { cx, timeAgoAr } from '../lib/utils';
import { Chip, EmptyState, SectionTitle, TrustBadge } from './ui';

interface MoreProps {
  settings: AppSettings;
  events: ActivityEvent[];
  tasks: KhTask[];
  docsCount: number;
  hasDemo: boolean;
  onSettings: (patch: Partial<AppSettings>) => void;
  onRemoveDemo: () => void;
  onClearAll: () => void;
}

export default function More({ settings, events, tasks, docsCount, hasDemo, onSettings, onRemoveDemo, onClearAll }: MoreProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const stepsDone = tasks.reduce((s, t) => s + t.steps.filter((x) => x.done).length, 0);
  const recent = [...events].sort((a, b) => b.at - a.at).slice(0, 30);

  async function testNotification() {
    setTestMsg('...');
    const ok = await ensureNotificationPermission(true);
    if (ok) {
      await pingNow('خَلِّصها ✅', 'التنبيهات شغالة تمام — هنتابعك قبل أي موعد.');
      setTestMsg('تمام! التنبيهات شغالة ✅');
    } else {
      setTestMsg('التنبيهات مرفوضة من المتصفح/الجهاز — فعّلها من الإعدادات.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-5 pb-28">
      <div>
        <h1 className="text-2xl font-black">المزيد ⚙️</h1>
        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">إعداداتك، مصادرك، وسجل إنجازك</p>
      </div>

      {/* profile */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={User} title="حسابك" />
        <label className="mb-1 block text-xs font-extrabold text-neutral-500">اسمك (عشان نناديك بيه)</label>
        <input
          value={settings.displayName}
          onChange={(e) => onSettings({ displayName: e.target.value })}
          placeholder="مثال: ياسين"
          className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-3 py-2 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
        />
        <label className="mt-3 mb-1 block text-xs font-extrabold text-neutral-500">المظهر</label>
        <div className="flex gap-2">
          <Chip selected={settings.darkMode === 'light'} onClick={() => onSettings({ darkMode: 'light' })}>
            <span className="flex items-center gap-1"><Sun size={14} /> فاتح</span>
          </Chip>
          <Chip selected={settings.darkMode === 'dark'} onClick={() => onSettings({ darkMode: 'dark' })}>
            <span className="flex items-center gap-1"><Moon size={14} /> غامق</span>
          </Chip>
          <Chip selected={settings.darkMode === 'system'} onClick={() => onSettings({ darkMode: 'system' })}>
            <span className="flex items-center gap-1"><Monitor size={14} /> تلقائي</span>
          </Chip>
        </div>
      </div>

      {/* notifications */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={Bell} title="التنبيهات والمتابعة" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">تابعني قبل المواعيد</p>
          <button
            onClick={() => onSettings({ notificationsEnabled: !settings.notificationsEnabled })}
            className={cx(
              'relative h-7 w-12 shrink-0 rounded-full transition',
              settings.notificationsEnabled ? 'bg-brand-500' : 'bg-black/15 dark:bg-white/15',
            )}
            aria-label="تفعيل التنبيهات"
          >
            <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', settings.notificationsEnabled ? 'left-1' : 'right-1')} />
          </button>
        </div>
        <button
          onClick={testNotification}
          className="mt-2.5 w-full rounded-xl bg-black/5 py-2 text-xs font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
        >
          جرّب التنبيهات
        </button>
        {testMsg && <p className="mt-1.5 text-center text-xs font-bold text-neutral-500">{testMsg}</p>}
      </div>

      {/* AI settings */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={KeyRound} title="تحسين الذكاء الاصطناعي (اختياري)" />
        <p className="mb-2 text-xs leading-5 font-bold text-neutral-500">
          خَلِّصها شغال كامل من غير إنترنت بمحركه المحلي. لو عايز تحسين إضافي للخطط، ضيف مفتاح API متوافق مع OpenAI — وبيتحفظ على جهازك بس.
        </p>
        <label className="mb-1 block text-xs font-extrabold text-neutral-500">API Key</label>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onSettings({ apiKey: e.target.value })}
          placeholder="sk-..."
          dir="ltr"
          className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-3 py-2 text-left text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-extrabold text-neutral-500">Base URL</label>
            <input
              value={settings.apiBase}
              onChange={(e) => onSettings({ apiBase: e.target.value })}
              dir="ltr"
              className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-2 py-2 text-left text-xs font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-extrabold text-neutral-500">Model</label>
            <input
              value={settings.apiModel}
              onChange={(e) => onSettings({ apiModel: e.target.value })}
              dir="ltr"
              className="w-full rounded-xl border-2 border-black/10 bg-black/[0.02] px-2 py-2 text-left text-xs font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>
        </div>
      </div>

      {/* achievements */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={Trophy} title="سجل الإنجاز 🏆" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-brand-50 py-2.5 dark:bg-brand-700/15">
            <p className="text-xl font-black text-brand-700 dark:text-brand-400">{doneTasks.toLocaleString('ar-EG')}</p>
            <p className="text-[11px] font-bold text-neutral-500">مسار خلص</p>
          </div>
          <div className="rounded-2xl bg-brand-50 py-2.5 dark:bg-brand-700/15">
            <p className="text-xl font-black text-brand-700 dark:text-brand-400">{stepsDone.toLocaleString('ar-EG')}</p>
            <p className="text-[11px] font-bold text-neutral-500">خطوة اتنفذت</p>
          </div>
          <div className="rounded-2xl bg-brand-50 py-2.5 dark:bg-brand-700/15">
            <p className="text-xl font-black text-brand-700 dark:text-brand-400">{docsCount.toLocaleString('ar-EG')}</p>
            <p className="text-[11px] font-bold text-neutral-500">وثيقة محفوظة</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {recent.length === 0 ? (
            <EmptyState icon={Trophy} title="لسه مفيش نشاط" hint="ابدأ أول مسار وسجل إنجازك هيكبر هنا." />
          ) : (
            recent.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-2.5 py-2 dark:bg-white/5">
                <CheckCircle2 size={15} className="shrink-0 text-brand-500" />
                <p className="min-w-0 flex-1 truncate text-xs font-bold">{e.text}</p>
                <span className="shrink-0 text-[11px] text-neutral-400">{timeAgoAr(e.at)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* sources directory */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={ExternalLink} title={`دليل المصادر الرسمية — ${settings.country}`} />
        <p className="mb-2 text-xs font-bold text-neutral-500">
          خَلِّصها مش بديل عن الجهات الحكومية — دي بوابتك ليها. أي معلومة فيها رسوم أو مواعيد لازم ترجع لمصدرها هنا.
        </p>
        <div className="space-y-2">
          {SOURCES.map((s) => (
            <div key={s.id} className="rounded-2xl bg-black/[0.03] p-2.5 dark:bg-white/5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold">{s.name}</p>
                <TrustBadge level={s.trust} small />
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{s.description}</p>
              <button
                onClick={() => window.open(s.url, '_blank', 'noopener')}
                className="mt-1.5 flex items-center gap-1 text-xs font-extrabold text-brand-600"
              >
                <ExternalLink size={12} /> {s.url.replace('https://', '')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* plans */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={Zap} title="خطط خَلِّصها" />
        <div className="space-y-2">
          <div className="rounded-2xl border-2 border-brand-500 bg-brand-50 p-3 dark:bg-brand-700/10">
            <p className="font-black">Free <span className="text-xs font-bold text-brand-600">(خطتك الحالية)</span></p>
            <p className="mt-1 text-xs leading-5 font-bold text-neutral-500">10 مسارات • OCR • تذكيرات • تخزين على الجهاز • خَلِّص AI محدود</p>
          </div>
          <div className="rounded-2xl border border-black/10 p-3 opacity-80 dark:border-white/10">
            <p className="flex items-center gap-1 font-black"><Sparkles size={15} className="text-amber-500" /> Plus — $2.99/شهريًا <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">قريبًا</span></p>
            <p className="mt-1 text-xs leading-5 font-bold text-neutral-500">مسارات غير محدودة • AI متقدم • تحليل مستندات • مشاركة العائلة • مزامنة • ملفات مطالبة</p>
          </div>
          <div className="rounded-2xl border border-black/10 p-3 opacity-80 dark:border-white/10">
            <p className="font-black">Family — $5.99/شهريًا <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">قريبًا</span></p>
            <p className="mt-1 text-xs leading-5 font-bold text-neutral-500">كل مزايا Plus لحد 6 أفراد من عيلتك.</p>
          </div>
        </div>
      </div>

      {/* danger */}
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={Trash2} title="البيانات" />
        {hasDemo && (
          <button onClick={onRemoveDemo} className="w-full rounded-xl bg-amber-100 py-2.5 text-sm font-extrabold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            مسح بيانات التجربة
          </button>
        )}
        <button
          onClick={() => (confirmClear ? onClearAll() : setConfirmClear(true))}
          className={cx(
            'mt-2 w-full rounded-xl py-2.5 text-sm font-extrabold transition',
            confirmClear ? 'bg-red-600 text-white' : 'bg-black/5 text-red-600 dark:bg-white/10 dark:text-red-400',
          )}
        >
          {confirmClear ? 'متأكد؟ اضغط تاني لمسح كل حاجة' : 'مسح كل البيانات'}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-neutral-400">بياناتك محفوظة على جهازك فقط — مفيش سيرفرات في النسخة دي.</p>
      </div>

      {/* about */}
      <div className="rounded-3xl bg-neutral-900 p-4 text-center text-white dark:bg-white dark:text-neutral-900">
        <p className="flex items-center justify-center gap-1.5 font-black"><Info size={16} /> خَلِّصها KHALLESA</p>
        <p className="mt-1 text-xs font-bold opacity-80">مش هنفكّرك بس… هنقولك تعمل إيه.</p>
        <p className="mt-1 text-[11px] opacity-60">V1 • صُنع بحب في مصر 🇪🇬</p>
      </div>
    </div>
  );
}
