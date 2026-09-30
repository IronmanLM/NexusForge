import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.enligne.nexusforge',
  appName: 'Nexus Forge',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
