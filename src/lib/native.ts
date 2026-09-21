// ─── Native shell (the standalone Android/iOS app) ─────────────────────
//
// This is what makes KHALLESA a real app and not a web page in a frame:
//   • branded status bar that follows light/dark
//   • native splash screen dismissed once React has painted
//   • hardware back button → close sheet → back a tab → exit app
//   • external links open in the system browser (Chrome Custom Tab)
//   • app identity (version / build / package) for the "About" card
//   • haptics + share helpers
//
// Every export is a safe no-op on the web build, so components never need
// to branch on `Capacitor.isNativePlatform()` themselves.
import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ── back button ────────────────────────────────────────────────────────
type BackHandler = () => boolean;
const backHandlers = new Set<BackHandler>();

/**
 * Registers a "go back" action (sheet open, task detail, non-home tab…).
 * Handlers are tried last-registered-first; return `true` if you consumed
 * the press. When nothing consumes it, the app exits like a normal Android app.
 */
export function onNativeBack(handler: BackHandler): () => void {
  backHandlers.add(handler);
  return () => backHandlers.delete(handler);
}

/** Ordered snapshot for debugging/tests. */
export function backHandlerCount(): number {
  return backHandlers.size;
}

// ── deep links (khallesa://new, khallesa://ai, …) ──────────────────────
export type DeepAction = 'new' | 'ai' | 'unknown';
type DeepHandler = (action: DeepAction, url: string) => void;
const deepHandlers = new Set<DeepHandler>();

/** Subscribes to app links. Returns an unsubscribe function. */
export function onDeepLink(handler: DeepHandler): () => void {
  deepHandlers.add(handler);
  return () => deepHandlers.delete(handler);
}

/** `khallesa://new?x=1` → `new`. Anything else → `unknown`. */
export function deepActionFrom(url: string): DeepAction {
  const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
  if (host === 'new' || host === 'add') return 'new';
  if (host === 'ai' || host === 'assistant') return 'ai';
  // the web build may also be opened as …/?action=new
  const q = /[?&]action=([a-z]+)/i.exec(url)?.[1]?.toLowerCase();
  if (q === 'new' || q === 'add') return 'new';
  if (q === 'ai' || q === 'assistant') return 'ai';
  return 'unknown';
}

function emitDeepLink(url: string) {
  const action = deepActionFrom(url);
  for (const h of [...deepHandlers].reverse()) {
    try {
      h(action, url);
    } catch {
      /* a broken handler must not kill the app */
    }
  }
}

// ── app identity ───────────────────────────────────────────────────────
export interface NativeAppInfo {
  name: string;
  version: string;
  build: string;
  package: string;
  platform: string;
}

let infoCache: NativeAppInfo | null = null;

export async function getAppInfo(): Promise<NativeAppInfo> {
  if (infoCache) return infoCache;
  const fallback: NativeAppInfo = {
    name: 'خَلِّصها',
    version: '',
    build: '',
    package: '',
    platform: Capacitor.getPlatform(),
  };
  if (!isNativeApp()) {
    infoCache = fallback;
    return fallback;
  }
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    infoCache = {
      name: info.name || fallback.name,
      version: info.version,
      build: info.build,
      package: info.id,
      platform: Capacitor.getPlatform(),
    };
  } catch {
    infoCache = fallback;
  }
  return infoCache;
}

// ── external links ─────────────────────────────────────────────────────
/**
 * Opens a URL outside the app. Inside the APK a WebView navigation to an
 * external site is a dead end (no address bar, no way back), so we hand it to
 * the system browser as a Custom Tab and stay the app the user launched.
 */
export async function openExternal(url: string | undefined): Promise<void> {
  if (!url) return;
  if (!isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
    return;
  } catch {
    /* fall through */
  }
  window.open(url, '_system');
}

/** Closes the in-app browser if it is open. */
export async function closeExternal(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* noop */
  }
}

// ── haptics / sharing ──────────────────────────────────────────────────
export async function tapHaptic(heavy = false): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: heavy ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    /* noop */
  }
}

export async function shareApp(lang: 'ar' | 'en' = 'ar'): Promise<void> {
  const info = await getAppInfo();
  const url = 'https://github.com/y5747m-gif/KHALLESA/releases/download/latest-apk/khallesa.apk';
  const title = lang === 'ar' ? 'خَلِّصها — تطبيق ينظّم لك أي مشكلة' : 'KHALLESA — turns any problem into a plan';
  const text =
    lang === 'ar'
      ? `خَلِّصها ${info.version ? `v${info.version} ` : ''}— مش هنفكّرك بس… هنقولك تعمل إيه.\nحمّل التطبيق لأندرويد:\n${url}`
      : `KHALLESA ${info.version ? `v${info.version} ` : ''}— it does not just remind you, it tells you what to do.\nDownload the Android app:\n${url}`;
  try {
    if (isNativeApp()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return;
    }
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      await navigator.share({ title, text });
      return;
    }
  } catch {
    /* user cancelled */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── lifecycle: status bar + splash ─────────────────────────────────────
let started = false;

/** Called once from `App.tsx`. */
export async function initNativeShell(): Promise<void> {
  if (!isNativeApp() || started) return;
  started = true;

  // Back button → let the UI unwind, otherwise leave the app.
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      const handlers = [...backHandlers].reverse();
      for (const h of handlers) {
        let consumed = false;
        try {
          consumed = h();
        } catch {
          consumed = false;
        }
        if (consumed) return;
      }
      void App.exitApp();
    });
  } catch {
    /* noop */
  }

  // Deep links: cold start (`getLaunchUrl`) and warm start (`appUrlOpen`).
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', (e) => {
      if (e?.url) emitDeepLink(e.url);
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) emitDeepLink(launch.url);
  } catch {
    /* noop */
  }

  // Branded status bar (light background → dark icons, and vice versa).
  await applyStatusBar('light');

  // Keep the native splash until React has painted, then fade it out.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* noop */
  }
}

/** Keeps the system status bar in sync with the in-app theme. */
export async function applyStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#0c1210' : '#f4f6f5' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* not every device/API level supports this */
  }
}
