import type { CapacitorConfig } from '@capacitor/cli';

/**
 * KHALLESA is shipped as a standalone Android app.
 * Everything it needs is bundled: no `server.url`, no remote host, so the APK
 * runs (and is reviewed) fully offline.
 */
const config: CapacitorConfig = {
  appId: 'com.khallesa.app',
  appName: 'خَلِّصها',
  webDir: 'dist',
  backgroundColor: '#f4f6f5',
  /** Custom scheme → the app is addressable as `khallesa://` (deep links). */
  appScheme: 'khallesa',
  android: {
    allowMixedContent: false,
    // WebView keeps its own cache so re-opening the app is instant.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#0ea968',
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#f4f6f5',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      spinnerColor: '#0ea968',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f4f6f5',
      overlaysWebView: false,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    Camera: {
      presentationStyle: 'fullscreen',
    },
  },
};

export default config;
