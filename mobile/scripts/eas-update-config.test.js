const { expo: exp } = require('../app.config.js');
const { expo: staticConfig } = require('../app.json');
const eas = require('../eas.json');

describe('EAS Update release configuration', () => {

  it('resolves the update server for the linked project in the dynamic config', () => {
    expect(exp.updates.url).toBe(`https://u.expo.dev/${exp.extra.eas.projectId}`);
    expect(exp.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('stays linked to the jnok EAS project', () => {
    expect(exp.extra.eas.projectId).toBe('6bb662da-bb2f-405d-876f-cea471908f74');
    expect(exp.owner).toBe('jnok');
    expect(exp.slug).toBe('easybizinvoice');
    expect(staticConfig.slug).toBe('easybizinvoice');
    expect(exp.updates.url).toBe('https://u.expo.dev/6bb662da-bb2f-405d-876f-cea471908f74');
  });

  it('keeps the app identity unchanged by the project move', () => {
    expect(exp.ios.bundleIdentifier).toBe('com.easybizinvoice.app');
    expect(exp.android.package).toBe('com.easybizinvoice.app');
    expect(exp.scheme).toBe('easybizinvoice');
  });

  it('lists the Sentry upload gate first so it runs after the Sentry plugin mods', () => {
    const name = (p) => (Array.isArray(p) ? p[0] : p);
    const names = exp.plugins.map(name);
    expect(names[0]).toBe('./plugins/withSentryUploadGate');
    expect(names.indexOf('@sentry/react-native/expo')).toBeGreaterThan(0);
  });

  it('keeps static and dynamic release versions and build numbers aligned', () => {
    expect(exp.version).toBe(staticConfig.version);
    expect(exp.ios.buildNumber).toBe(staticConfig.ios.buildNumber);
  });

  it.each(['preview', 'production'])('isolates the %s release channel and environment', (profile) => {
    expect(eas.build[profile].channel).toBe(profile);
    expect(eas.build[profile].environment).toBe(profile);
  });
});
