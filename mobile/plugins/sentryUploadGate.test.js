const { gateAndroidGradle, gateXcodeShellScript, MARKER } = require('./sentryUploadGate');

describe('sentry upload gate', () => {
  it('skips the iOS upload scripts when SENTRY_AUTH_TOKEN is missing', () => {
    const original = JSON.stringify('/bin/sh `node -e sentry-xcode.sh` ../scripts/react-native-xcode.sh');
    const gated = JSON.parse(gateXcodeShellScript(original));

    expect(gated).toContain('if [ -z "$SENTRY_AUTH_TOKEN" ]; then');
    expect(gated).toContain('export SENTRY_DISABLE_AUTO_UPLOAD=true');
    expect(gated).toContain('sentry-xcode.sh');
    expect(gateXcodeShellScript(JSON.stringify(gated))).toBe(JSON.stringify(gated));
  });

  it('leaves unrelated Xcode scripts alone', () => {
    const script = JSON.stringify('echo "Bundle React Native code and images"');
    expect(gateXcodeShellScript(script)).toBe(script);
  });

  it('overrides the Android upload checks after the Sentry gradle script', () => {
    const gradle = [
      'apply from: new File(["node", "--print", "require(\'@sentry/react-native/package.json\')"].execute().text.trim(), "sentry.gradle")',
      '',
      'android {',
      '}',
    ].join('\n');
    const gated = gateAndroidGradle(gradle);

    expect(gated).toContain(MARKER);
    expect(gated.indexOf('sentry.gradle')).toBeLessThan(gated.indexOf('shouldSentryAutoUploadGeneral'));
    expect(gated).toContain('System.getenv("SENTRY_AUTH_TOKEN")');
    expect(gateAndroidGradle(gated)).toBe(gated);
  });

  it('does nothing when Sentry has not been applied', () => {
    const gradle = 'android {\n}\n';
    expect(gateAndroidGradle(gradle)).toBe(gradle);
  });
});
