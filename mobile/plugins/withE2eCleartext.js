const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * E2E_BUILD only. Release Android blocks http unless the manifest allows it.
 * The local API is http://10.0.2.2:3001. This plugin is not added unless
 * E2E_BUILD=1, so production and preview manifests stay unchanged.
 */
function withE2eCleartext(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
}

module.exports = withE2eCleartext;
