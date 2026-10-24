#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EAS = ['--yes', 'eas-cli@25.3.0'];
const RESERVED = new Set(['--channel', '--branch', '--environment', '--input-dir', '--output-dir', '--skip-bundler', '--auto']);

function publishUpdate(channel, args, { env = process.env, cwd = path.resolve(__dirname, '..'), run = spawnSync } = {}) {
  if (!['preview', 'production'].includes(channel)) throw new Error('Choose preview or production.');
  let platform = 'all';
  const publishArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--platform' || arg === '-p' || arg.startsWith('--platform=')) {
      platform = arg.includes('=') ? arg.slice('--platform='.length) : args[++i];
      if (!['all', 'ios', 'android'].includes(platform)) throw new Error('Unsupported update platform.');
      continue;
    }
    publishArgs.push(arg);
    if (RESERVED.has(arg.split('=')[0])) throw new Error(`Unsupported publishing override: ${arg.split('=')[0]}`);
  }
  const upload = channel === 'production' || Boolean(env.SENTRY_AUTH_TOKEN);
  if (upload && !env.SENTRY_AUTH_TOKEN?.trim()) {
    throw new Error('Production updates require SENTRY_AUTH_TOKEN in the publishing process. EAS Build secrets are not available to local EAS Update.');
  }
  const commandEnv = {
    ...env,
    SENTRY_ORG: 'ledgercraft',
    SENTRY_PROJECT: 'ledgercraft-mobile',
    SENTRY_URL: 'https://us.sentry.io/',
    // Upload explicitly before publication, rather than during bundling.
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    SENTRY_ALLOW_FAILURE: 'false',
  };
  const execute = (command, commandArgs, label) => {
    const result = run(command, commandArgs, { cwd, env: commandEnv, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      throw new Error(`${label} failed (exit ${result.status ?? 'unavailable'}).`);
    }
  };
  const platforms = platform === 'all' ? ['ios', 'android'] : [platform];
  const exportPlatforms = platforms.map(value => `--platform ${value}`).join(' ');
  const updateArgs = [...EAS, 'update', '--channel', channel, '--environment', channel, '--platform', platform];
  if (upload) {
    // Resolve before starting any work; use the SDK version in package-lock.json.
    const uploader = require.resolve('@sentry/react-native/scripts/expo-upload-sourcemaps.js');
    fs.rmSync(path.join(cwd, 'dist'), { recursive: true, force: true });
    execute('npx', [...EAS, 'env:exec', channel, `npx expo export ${exportPlatforms} --source-maps --output-dir dist`, '--non-interactive'], 'Expo export');
    const output = path.join(cwd, 'dist');
    const metadataPath = path.join(output, 'metadata.json');
    const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : {};
    for (const target of platforms) {
      const bundle = metadata.fileMetadata?.[target]?.bundle;
      if (!bundle || !fs.existsSync(path.join(output, `${bundle}.map`))) {
        throw new Error(`Expo export is missing ${target} source maps; update was not published.`);
      }
    }
    execute(process.execPath, [uploader, 'dist'], 'Sentry source-map upload');
    updateArgs.push('--skip-bundler', '--input-dir', 'dist');
  }
  execute('npx', [...updateArgs, ...publishArgs], 'EAS Update publication');
}

if (require.main === module) {
  try {
    publishUpdate(process.argv[2], process.argv.slice(3));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { publishUpdate };
