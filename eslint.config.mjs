import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      '.claude/**',
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'public/sw.js',
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
];

export default config;
