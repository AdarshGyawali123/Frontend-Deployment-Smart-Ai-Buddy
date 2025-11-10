module.exports = function (api) {
    api.cache(true);
    return {
      presets: [
        ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
        "nativewind/babel",
      ],
      plugins: [
        [
          "module-resolver",
          {
            alias: {
              "@": "./",
              "@app": "./app",
              "@components": "./components",
              "@hooks": "./hooks",
              "@constants": "./constants",
              "@assets": "./assets",
            }
          }
        ],
        'react-native-reanimated/plugin'
      ]
    };
  };
