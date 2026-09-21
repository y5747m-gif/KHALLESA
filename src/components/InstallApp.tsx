import { useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Share, Smartphone, X } from 'lucide-react';
import { useStrings } from '../lib/i18n';
import { APK_URL, RELEASES_URL, useInstallApp } from '../lib/install';
import { cx } from '../lib/utils';
import { SectionTitle, Sheet } from './ui';

/**
 * Full "make it an app" card — lives in المزيد.
 * Handles: inside the APK · already installed · Chrome/Android install prompt · iOS steps · APK download.
 */
export function InstallCard(props: { updateReady?: boolean; applyUpdate?: () => void }) {
  const s = useStrings();
  const { state, promptInstall, canDownloadApk } = useInstallApp();
  const [msg, setMsg] = useState('');

  async function install() {
    setMsg('');
    const res = await promptInstall();
    if (res === 'unavailable') setMsg(s.installManualHint);
  }

  // Already an app (APK or installed PWA) → just confirm it.
  if (state === 'native' || state === 'installed') {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <SectionTitle icon={Smartphone} title={s.installTitle} />
        <div className="flex items-start gap-2.5 rounded-2xl bg-brand-50 p-3 dark:bg-brand-700/15">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
          <div>
            <p className="text-sm font-black">{state === 'native' ? s.installNative : s.installDone}</p>
            <p className="mt-0.5 text-xs leading-5 font-bold text-neutral-500 dark:text-neutral-400">
              {state === 'native' ? s.installNativeHint : s.installDoneHint}
            </p>
          </div>
        </div>
        {props.updateReady && (
          <button
            onClick={props.applyUpdate}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-sm font-extrabold text-white"
          >
            <RefreshCw size={15} /> {s.updateBtn}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <SectionTitle icon={Download} title={s.installTitle} />
      <p className="mb-3 text-xs leading-5 font-bold text-neutral-500 dark:text-neutral-400">{s.installSub}</p>

      {state === 'installable' ? (
        <button
          onClick={install}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-extrabold text-white shadow-sm transition active:scale-[0.98]"
        >
          <Download size={17} /> {s.installBtn}
        </button>
      ) : (
        <div className="rounded-2xl bg-black/[0.03] p-3 text-xs leading-6 font-bold text-neutral-600 dark:bg-white/5 dark:text-neutral-300">
          {state === 'ios' ? (
            <p className="flex items-start gap-1.5">
              <Share size={14} className="mt-1 shrink-0" /> {s.installIosHint}
            </p>
          ) : (
            <p>{isAndroidLike() ? s.installAndroidHint : s.installManualHint}</p>
          )}
        </div>
      )}

      {msg && <p className="mt-2 text-center text-xs font-bold text-neutral-500">{msg}</p>}

      {canDownloadApk && (
        <div className="mt-3 rounded-2xl border border-black/10 p-3 dark:border-white/10">
          <p className="text-sm font-black">{s.installApkTitle}</p>
          <p className="mt-0.5 text-xs leading-5 font-bold text-neutral-500 dark:text-neutral-400">{s.installApkHint}</p>
          <a
            href={APK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2.5 text-sm font-extrabold text-white dark:bg-white dark:text-neutral-900"
          >
            <Download size={16} /> {s.installApkBtn}
          </a>
          <p className="mt-1.5 text-[11px] leading-5 text-neutral-400">{s.installApkNote}</p>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[11px] font-extrabold text-brand-600"
          >
            {s.installAllReleases} →
          </a>
        </div>
      )}

      <p className="mt-2.5 text-center text-[11px] font-bold text-neutral-400">✓ {s.installOffline}</p>

      {props.updateReady && (
        <button
          onClick={props.applyUpdate}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-sm font-extrabold text-white"
        >
          <RefreshCw size={15} /> {s.updateBtn}
        </button>
      )}
    </div>
  );
}

/** Always-reachable install button (header of the home tab). */
export function InstallButton() {
  const s = useStrings();
  const { state, promptInstall } = useInstallApp();
  const [open, setOpen] = useState(false);

  if (state !== 'installable' && state !== 'ios') return null;

  return (
    <>
      <button
        onClick={() => {
          if (state === 'installable') void promptInstall();
          else setOpen(true);
        }}
        aria-label={s.installTitle}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-2 text-xs font-black text-brand-700 transition active:scale-95 dark:border-brand-500/40 dark:bg-brand-700/20 dark:text-brand-300"
      >
        <Download size={15} />
        {s.installBtnShort}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={s.installTitle} subtitle={s.installSub}>
        <ol className="space-y-2 text-sm leading-7 font-bold">
          <li>1. {s.installIosHint}</li>
          <li>2. {s.installSub}</li>
        </ol>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-xs font-extrabold text-brand-600"
        >
          {s.installAllReleases} →
        </a>
      </Sheet>
    </>
  );
}

/** Compact, dismissible nudge shown on the home tab. */
export function InstallBanner() {
  const s = useStrings();
  const { state, showBanner, promptInstall, dismiss } = useInstallApp();

  if (!showBanner) return null;

  return (
    <div className="animate-pop relative overflow-hidden rounded-3xl bg-brand-500 p-3.5 text-white shadow-lg">
      <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-white/10" />
      <button
        onClick={dismiss}
        aria-label={s.close}
        className="absolute top-2.5 left-2.5 rounded-full p-1 text-white/80 transition hover:bg-white/15"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Smartphone size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{s.installBannerTitle}</p>
          <p className="mt-0.5 text-[11px] leading-4 font-bold text-white/85">{s.installBannerSub}</p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={() => void promptInstall()}
          className={cx(
            'flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-brand-700 transition active:scale-[0.98]',
            state !== 'installable' && 'opacity-90',
          )}
        >
          {s.installBtn}
        </button>
        <button
          onClick={dismiss}
          className="rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white transition hover:bg-white/25"
        >
          {s.installLater}
        </button>
      </div>
    </div>
  );
}

function isAndroidLike(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
