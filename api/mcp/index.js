const spec = {
  name: 'mcp-github-dispatch-relay',
  version: '1.0.0',
  capabilities: {
    tools: {
      'github.repository_dispatch': {
        title: 'GitHub Repository Dispatch',
        description: 'Trigger a GitHub repository_dispatch event',
        input_schema: { // 👈 renamed for MCP spec compliance
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            event_type: { type: 'string' },
            client_payload: { type: 'object' }
          },
          required: ['owner', 'repo', 'event_type']
        },
        output_schema: { // 👈 renamed for MCP spec compliance
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

export default async function handler(req, res) {
  try {
    // --- CORS setup ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // --- Handle GET: tool discovery ---
    if (req.method === 'GET') {
      const tools = Object.entries(spec.capabilities.tools).map(([name, tool]) => ({
        name,
        title: tool.title,
        description: tool.description,
        input_schema: tool.input_schema,
        output_schema: tool.output_schema
      }));
      res.status(200).json({ tools, status: 'ok' });
      return;
    }

    // --- Handle invalid methods ---
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // --- Parse JSON-RPC body ---
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        return;
      }
    }

    if (body == null || typeof body !== 'object') {
      res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }

    const { id, jsonrpc, method, params } = body;
    if (jsonrpc !== '2.0' || !method) {
      res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }

    // --- Handle MCP initialize ---
    if (method === 'initialize') {
      const requestedVersion = params?.protocolVersion || '2024-11-05';
      const result = {
        protocolVersion: requestedVersion,
        capabilities: { tools: spec.capabilities.tools }
      };
      res.status(200).json({ jsonrpc: '2.0', id, result });
      return;
    }

    // --- Handle tool listing ---
    if (method === 'tools/list') {
      const tools = Object.entries(spec.capabilities.tools).map(([name, tool]) => ({
        name,
        title: tool.title,
        description: tool.description,
        input_schema: tool.input_schema,
        output_schema: tool.output_schema
      }));
      res.status(200).json({ jsonrpc: '2.0', id, result: { tools } });
      return;
    }

    // --- Handle tool execution ---
    if (method === 'tools/call') {
      const { tool, input } = params || {};
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

    // --- Default case: method not found ---
    res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });

  } catch (err) {
    console.error('MCP relay failed:', err);
    res.status(500).json({ error: err.message });
  }
}
