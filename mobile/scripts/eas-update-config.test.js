const { getConfig } = require('@expo/config');
const eas = require('../eas.json');

describe('EAS Update release configuration', () => {
  const { exp } = getConfig(require('path').resolve(__dirname, '..'), { skipPlugins: true });

  it('resolves the update server for the linked project in the dynamic config', () => {
    expect(exp.updates.url).toBe(`https://u.expo.dev/${exp.extra.eas.projectId}`);
    expect(exp.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it.each(['preview', 'production'])('isolates the %s release channel and environment', (profile) => {
    expect(eas.build[profile].channel).toBe(profile);
    expect(eas.build[profile].environment).toBe(profile);
  });
});
