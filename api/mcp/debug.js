// /api/mcp/debug.js
export default async function handler(req, res) {
  const details = {
    method: req.method,
    headers: req.headers,
    body: req.body || null,
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    status: 'ok',
    received: details,
    note: 'This endpoint echoes back what the MCP client actually sends.',
  });
}
