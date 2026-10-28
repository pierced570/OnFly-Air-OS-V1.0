import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native App Store shell for the OnFly client portal (Capacitor).
 * Same Vite/React UI — iOS/Android WebView. Build web first, then sync.
 *
 *   npm run build
 *   npm run cap:sync
 *   npm run cap:open:ios   # macOS + Xcode
 */
const config: CapacitorConfig = {
  appId: 'com.onflyair.client',
  appName: 'OnFly',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#F7F2E3',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#F7F2E3',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0C0C0E',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0C0C0E',
    },
  },
}

export default config
