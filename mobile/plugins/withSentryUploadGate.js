const { createRunOncePlugin, withAppBuildGradle, withXcodeProject } = require('expo/config-plugins');
const { gateAndroidGradle, gateXcodeShellScript } = require('./sentryUploadGate');

function withSentryUploadGate(config) {
  config = withXcodeProject(config, (mod) => {
    const phases = mod.modResults?.hash?.project?.objects?.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (phase && typeof phase === 'object' && typeof phase.shellScript === 'string') {
        phase.shellScript = gateXcodeShellScript(phase.shellScript);
      }
    }
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === 'groovy') {
      mod.modResults.contents = gateAndroidGradle(mod.modResults.contents);
    }
    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(withSentryUploadGate, 'ledgercraft-sentry-upload-gate', '1.0.0');
