// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
const { handleApi } = require('../lib/api');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://x');
  // vercel.json rewrites /api/<path> -> /api?path=<path>
  const sub = url.searchParams.get('path');
  const p = sub != null ? '/api/' + sub : url.pathname;
  return handleApi(req, res, p);
};
