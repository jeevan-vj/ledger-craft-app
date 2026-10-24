const { expo: exp } = require('../app.config.js');
const { expo: staticConfig } = require('../app.json');
const eas = require('../eas.json');

describe('EAS Update release configuration', () => {

  it('resolves the update server for the linked project in the dynamic config', () => {
    expect(exp.updates.url).toBe(`https://u.expo.dev/${exp.extra.eas.projectId}`);
    expect(exp.runtimeVersion).toEqual({ policy: 'fingerprint' });
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
