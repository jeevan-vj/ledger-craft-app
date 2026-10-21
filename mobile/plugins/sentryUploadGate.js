const MARKER = 'ledgercraftSentryUploadGate';

function gateXcodeShellScript(shellScript) {
  let source = shellScript;
  let encoded = false;
  if (typeof shellScript !== 'string') return shellScript;
  if (shellScript.startsWith('"')) {
    try {
      source = JSON.parse(shellScript);
      encoded = true;
    } catch {
      source = shellScript;
    }
  }
  if (!source.includes('sentry') || source.includes('Sentry upload skipped')) return shellScript;
  const gated = [
    'if [ -z "$SENTRY_AUTH_TOKEN" ]; then',
    '  echo "Sentry upload skipped: SENTRY_AUTH_TOKEN is not set"',
    '  export SENTRY_DISABLE_AUTO_UPLOAD=true',
    'fi',
    source,
  ].join('\n');
  return encoded ? JSON.stringify(gated) : gated;
}

function gateAndroidGradle(contents) {
  if (typeof contents !== 'string' || contents.includes(MARKER) || !contents.includes('sentry.gradle')) {
    return contents;
  }
  const lines = contents.split('\n');
  const index = lines.findIndex((line) => line.includes('sentry.gradle'));
  if (index === -1) return contents;
  const gate = [
    '',
    `// ${MARKER}: upload source maps and debug symbols only when SENTRY_AUTH_TOKEN is set.`,
    'project.ext.shouldSentryAutoUploadGeneral = { ->',
    '    def token = System.getenv("SENTRY_AUTH_TOKEN")',
    '    return token != null && token.trim() && System.getenv("SENTRY_DISABLE_AUTO_UPLOAD") != "true"',
    '}',
    'project.ext.shouldSentryAutoUploadNative = { ->',
    '    def token = System.getenv("SENTRY_AUTH_TOKEN")',
    '    return token != null && token.trim() && System.getenv("SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD") != "true" && System.getenv("SENTRY_DISABLE_AUTO_UPLOAD") != "true"',
    '}',
    '',
  ];
  lines.splice(index + 1, 0, ...gate);
  return lines.join('\n');
}

module.exports = {
  MARKER,
  gateXcodeShellScript,
  gateAndroidGradle,
};
