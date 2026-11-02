// Used by Jest only. The published package ships `src/` untranspiled for Metro.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript']
};
