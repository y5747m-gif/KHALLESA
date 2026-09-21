/**
 * Install-on-phone helpers.
 *
 * Three ways a user can end up with خَلِّصها on their home screen:
 *  1. Inside the native APK (Capacitor)  → already an app, nothing to install.
 *  2. Android / Chrome / Edge web        → `beforeinstallprompt` (real APK-like install).
 *  3. iOS Safari                         → manual "Add to Home Screen" (we show the steps).
 *
 * Plus a direct APK download for people who want the standalone Android build.
 */
import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Stable link: rolling `latest-apk` release published by the Build APK workflow. */
export const APK_URL = 'https://github.com/y5747m-gif/KHALLESA/releases/download/latest-apk/khallesa.apk';
export const RELEASES_URL = 'https://github.com/y5747m-gif/KHALLESA/releases';

const DISMISS_KEY = 'kh.install.dismissedAt';
const DISMISS_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedState = false;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

/** True when running inside the native Android app (APK), not a browser. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True when the web app was launched from the home screen (installed PWA). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  // iOS Safari
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  // Android WebView / TWA
  return document.referrer.startsWith('android-app://');
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iOSDevice) return false;
  // Chrome/Firefox on iOS have no web-app install support — only Safari does.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Listens once for the browser install event (Chrome/Edge/Android + desktop). */
function startListening() {
  if (typeof window === 'undefined' || (window as never as Record<string, unknown>).__khInstallBound) return;
  (window as never as Record<string, unknown>).__khInstallBound = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedState = true;
    emit();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    installedState = e.matches;
    emit();
  });
}

export function dismissInstallBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  emit();
}

function bannerDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export type InstallState =
  | 'native' // running inside the APK
  | 'installed' // already on the home screen
  | 'installable' // browser gave us a native install prompt
  | 'ios' // Safari on iOS → manual steps
  | 'manual'; // any other browser → manual steps / APK download

export interface InstallInfo {
  state: InstallState;
  /** Show the "add to home screen" nudge? */
  showBanner: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
  canDownloadApk: boolean;
}

export function useInstallApp(): InstallInfo {
  const [tick, setTick] = useState(0);
  const [native] = useState(() => isNativeApp());

  useEffect(() => {
    startListening();
    const fn = () => setTick((k) => k + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const state = useMemo<InstallState>(() => {
    void tick; // re-evaluated whenever the install event state changes
    if (native) return 'native';
    if (deferredPrompt) return 'installable';
    if (isStandalone() || installedState) return 'installed';
    return isIOS() ? 'ios' : 'manual';
  }, [native, tick]);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        installedState = true;
        emit();
      }
      return choice.outcome;
    } catch {
      deferredPrompt = null;
      return 'unavailable';
    }
  }, []);

  return {
    state,
    showBanner: (state === 'installable' || state === 'ios') && !bannerDismissed(),
    promptInstall,
    dismiss: dismissInstallBanner,
    // APK block is for phones/browsers that can't do a one-tap install.
    canDownloadApk: !native && (isAndroid() || state === 'manual'),
  };
}

/**
 * Registers the offline service worker (web only — the APK ships its own assets).
 * Returns an updater so the UI can offer "new version → refresh".
 */
export function useServiceWorker(): { updateReady: boolean; applyUpdate: () => void } {
  const [updateReady, setUpdateReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (isNativeApp()) return;
    if (!('serviceWorker' in navigator)) return;
    if (!import.meta.env.PROD) return; // dev server: no SW, avoids stale caches

    let reg: ServiceWorkerRegistration | undefined;
    let cancelled = false;

    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { scope: new URL('./', document.baseURI).href })
      .then((r) => {
        reg = r;
        if (cancelled) return;
        if (r.waiting && navigator.serviceWorker.controller) {
          setWaiting(r.waiting);
          setUpdateReady(true);
        }
        r.addEventListener('updatefound', () => {
          const sw = r.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(sw);
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        /* SW is a progressive enhancement */
      });

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      void reg;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  }, [waiting]);

  return { updateReady, applyUpdate };
}
