const eas = require('./eas.json');

const PUBLIC_DSN =
  'https://413f0f85e322945820964b612fb820f2@o4512292098342912.ingest.us.sentry.io/4512292104044544';

describe('EAS Sentry environment', () => {
  it('sets the public DSN and org on preview and production', () => {
    for (const profileName of ['preview', 'production']) {
      expect(eas.build[profileName].env).toMatchObject({
        EXPO_PUBLIC_SENTRY_DSN: PUBLIC_DSN,
        SENTRY_ORG: 'ledgercraft',
        SENTRY_PROJECT: 'ledgercraft-mobile',
      });
    }
  });

  it('leaves the DSN unset on development profiles', () => {
    for (const profileName of ['development', 'development-device']) {
      const env = eas.build[profileName].env;
      expect(env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
      expect(env.SENTRY_ORG).toBeUndefined();
      expect(env.SENTRY_PROJECT).toBe('ledgercraft-mobile');
    }
  });

  it('does not commit the source map auth token', () => {
    expect(JSON.stringify(eas)).not.toContain('SENTRY_AUTH_TOKEN');
  });
});
