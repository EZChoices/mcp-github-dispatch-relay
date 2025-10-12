export default async function handler(req, res) {
  // CORS headers for browser clients (Agent Builder)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization'
  };

  for (const [header, value] of Object.entries(corsHeaders)) {
    res.setHeader(header, value);
  }

  // Respond to CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // For GET requests, we do not support SSE; reply with 405
  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'GET not supported on this endpoint' });
    return;
  }

  // Only POST requests are handled beyond this point
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = req.body;
    // If body is a string, try to parse JSON
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
  } catch (err) {
    res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  // Basic validation of JSON-RPC structure
  const { id, jsonrpc, method, params } = body || {};
  if (jsonrpc !== '2.0' || !method) {
    res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
    return;
  }

  // Tool specification (same as OpenAPI spec's x-mcp section)
  const spec = {
    name: 'mcp-github-dispatch-relay',
    version: '1.0.0',
    capabilities: {
      tools: {
        'github.repository_dispatch': {
          title: 'GitHub Repository Dispatch',
          description: 'Trigger a GitHub repository_dispatch event',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              event_type: { type: 'string' },
              client_payload: { type: 'object' }
            },
            required: ['owner', 'repo', 'event_type']
          },
          outputSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              status: { type: 'number' },
              statusText: { type: 'string' },
              body: { type: 'string' }
            }
          }
        }
      }
    }
  };

  // Handle JSON-RPC methods
  if (method === 'initialize') {
    // Echo back the protocol version sent by the client or choose a default
    const requestedVersion = params?.protocolVersion || '2024-11-05';
    const result = {
      protocolVersion: requestedVersion,
      capabilities: { tools: spec.capabilities.tools }
    };
    res.status(200).json({ jsonrpc: '2.0', id, result });
    return;
  }

  if (method === 'tools/list') {
    // Build a list of tools from the spec
    const tools = Object.entries(spec.capabilities.tools).map(([name, t]) => ({
      name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema
    }));
    res.status(200).json({ jsonrpc: '2.0', id, result: { tools } });
    return;
  }

  if (method === 'tools/call') {
    const { tool, input } = params || {};
    // Check if the requested tool exists
    if (tool !== 'github.repository_dispatch') {
      res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not found' } });
      return;
    }

    try {
      const { owner, repo, event_type, client_payload } = input || {};
      const token = process.env.GITHUB_PAT;
      if (!token) {
        throw new Error('Missing GITHUB_PAT environment variable');
      }
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `token ${token}`,
          'User-Agent': 'mcp-github-dispatch-relay'
        },
        body: JSON.stringify({
          event_type: event_type,
          client_payload: client_payload || {}
        })
      });
      const ok = response.ok;
      const status = response.status;
      const statusText = response.statusText;
      const bodyText = await response.text();
      res.status(200).json({ jsonrpc: '2.0', id, result: { ok, status, statusText, body: bodyText } });
      return;
    } catch (err) {
      res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
      return;
    }
  }

  // If method is not recognized
  res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
}
