const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/', 'android/', 'ios/', 'example/', 'coverage/']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      // Metro supports CommonJS `require` inside ES modules; used to load the Codegen spec lazily.
      globals: { require: 'readonly' }
    }
  },
  {
    files: ['*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node
    }
  },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest }
    }
  }
];
