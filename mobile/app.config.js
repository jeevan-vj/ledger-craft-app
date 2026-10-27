const appJson = require('./app.json');
const EAS_PROJECT_ID = '6bb662da-bb2f-405d-876f-cea471908f74';

module.exports = {
  expo: {
    name: 'easybizinvoice',
    owner: 'jnok',
    slug: 'easybizinvoice',
    version: appJson.expo.version,
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1B262C',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.easybizinvoice.app',
      buildNumber: appJson.expo.ios.buildNumber,
      associatedDomains: ['applinks:easybiz.iamjeevan.com'],
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1B262C',
      },
      package: 'com.easybizinvoice.app',
      versionCode: 1,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'easybiz.iamjeevan.com',
              pathPrefix: '/shared/invoice/',
            },
            {
              scheme: 'https',
              host: 'easybiz.iamjeevan.com',
              pathPrefix: '/shared/quote/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'READ_EXTERNAL_STORAGE',
      ],
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      // Keep first: Expo runs native mods from later plugins first, so listing the gate
      // first makes it run after Sentry adds sentry.gradle and its Xcode build phases.
      './plugins/withSentryUploadGate',
      'expo-secure-store',
      'react-native-bottom-tabs',
      [
        '@sentry/react-native/expo',
        {
          url: 'https://us.sentry.io/',
          organization: 'ledgercraft',
          project: process.env.SENTRY_PROJECT || 'ledgercraft-mobile',
        },
      ],
    ],
    scheme: 'easybizinvoice',
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  },
};
