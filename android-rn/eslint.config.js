const tseslint = require('typescript-eslint');

// FS-01…FS-03: los textos de números salen de core/formatC y core/swiftParse, nunca de JS (toFixed, Number, parseFloat…).
const numberText = [
  { selector: "CallExpression[callee.name='Number']", message: 'Number(): usa parseSwiftDouble/parseSwiftInt (FS-02, FS-03).' },
  { selector: "CallExpression[callee.name='parseFloat']", message: 'parseFloat(): usa parseSwiftDouble (FS-02).' },
  { selector: "CallExpression[callee.name='parseInt']", message: 'parseInt(): usa parseSwiftInt (FS-03).' },
  { selector: "CallExpression[callee.object.name='Number'][callee.property.name=/^parse(Float|Int)$/]", message: 'Number.parseX(): usa swiftParse (FS-02, FS-03).' },
  { selector: "MemberExpression[object.name='Intl'][property.name='NumberFormat']", message: 'Intl.NumberFormat: usa formatC (FS-01).' },
];

module.exports = tseslint.config(
  { ignores: ['node_modules', 'android', 'dist'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': ['error',
        { property: 'toFixed', message: 'toFixed redondea distinto de printf: usa formatC (FS-01).' },
        { property: 'toPrecision', message: 'toPrecision: usa formatC (FS-01).' },
      ],
      'no-restricted-syntax': ['error', ...numberText],
    },
  },
  {
    // Constitución III: el núcleo no conoce React ni el sistema.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@react-native*', '@shopify/*', '@maplibre/*', '../state/*', '../link/*', '../platform/*', '../ui/*', '../screens/*'], message: 'src/core debe ser puro (Constitución III).' },
      ] }],
    },
  },
  {
    // Estos módulos implementan la semántica de Swift y necesitan las primitivas de JS que el resto del código tiene prohibidas.
    files: ['src/core/swiftParse.ts', 'src/core/formatC.ts', 'src/core/swiftDescribe.ts', 'src/core/splitmix64.ts'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-properties': 'off' },
  },
);
