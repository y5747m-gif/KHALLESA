import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.khallesa.app',
  appName: 'خَلِّصها',
  webDir: 'dist',
  backgroundColor: '#f4f6f5',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#0ea968',
    },
  },
};

export default config;
