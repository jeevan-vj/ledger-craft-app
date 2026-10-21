module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            'hono/http-exception': './src/shims/hono-http-exception.ts',
            'hono/utils/http-status': './src/shims/hono-http-status.ts',
            '@ledgercraft/contracts': '../packages/contracts/src/index.ts',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};

