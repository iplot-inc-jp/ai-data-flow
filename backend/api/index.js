// Vercel Functions エントリ（プレーンJS）。
// Nest はデコレータメタデータが必須のため、tsc ビルド済みの dist を require する。
// @vercel/node の nft がこの require を辿って dist/** を関数に同梱する。
module.exports = require('../dist/src/serverless').handler;
