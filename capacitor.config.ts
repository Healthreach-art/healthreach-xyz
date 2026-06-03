import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.healthreach',
  appName: 'HEALTHREACH',
  webDir: 'dist',
  server: {
    // Remove the `url` line below before producing a release APK so the app
    // ships the bundled web build instead of loading the live preview.
    url: 'https://f3f1ef1a-180c-42fe-82f8-e0899adec27a.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
