const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getSentryExpoConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
config.resolver.nodeModulesPaths = Array.from(new Set([
  path.resolve(projectRoot, 'node_modules'),
  ...(config.resolver.nodeModulesPaths ?? []),
]));

module.exports = withNativeWind(config, { input: './global.css' });
