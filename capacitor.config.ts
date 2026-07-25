import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.youfacetechnologies.youface',
  appName: 'YouFace',
  webDir: 'public',
  backgroundColor: '#09070f',
  plugins: {
    FirebaseAuthentication: { providers: ['phone', 'google.com'], skipNativeAuth: false }
  }
};
export default config;
