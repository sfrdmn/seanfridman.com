module.exports = {
  'env': {
    'browser': true,
    'es2021': true
  },
  'extends': ['eslint:recommended', 'plugin:compat/recommended'],
  'parserOptions': {
    'ecmaVersion': 'latest'
  },
  'rules': {
    'semi': ['warn', 'never'],
    'quotes': ['warn', 'single', { 'allowTemplateLiterals': true }],
    'no-extra-semi': 'off',
  },
  'settings': {
    'polyfills': ['AudioContext']
  },
  'globals': {
    'webkitAudioContext': 'readonly'
  }
}
