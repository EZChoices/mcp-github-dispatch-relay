// /api/mcp/index.js (Vercel/Next API route)

const SPEC = {
  name: 'mcp-github-dispatch-relay',
  version: '1.0.0',
  tool: {
    name: 'github.repository_dispatch',
    title: 'GitHub Repository Dispatch',
    description: 'Trigger a GitHub repository_dispatch event',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        event_type: { type: 'string' },
        client_payload: { type: 'object' }
      },
      required: ['owner', 'repo', 'event_type'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        status: { type: 'number' },
        statusText: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['ok', 'status']
    }
  }
};

// Optional: force Node runtime on Vercel (avoids some Edge pitfalls with env)

function mcpInitializeResult() {
  return {
    jsonrpc: '2.0',
    // id will be filled by caller
    result: {
      protocolVersion: '2025-06-18', // current spec revision
      serverInfo: {
        name: SPEC.name,
        version: SPEC.version,
        title: 'GitHub Dispatch MCP'
      },
      // IMPORTANT: 'tools' must be an OBJECT that announces capability, not an array.
      // You can include 'listChanged' if you plan to emit notifications later.
      capabilities: {
        tools: {} // { listChanged: false } is fine too
      }
    }
  };
}

function mcpListToolsResult() {
  return {
    jsonrpc: '2.0',
    // id will be filled by caller
    result: {
      tools: [
        {
          name: SPEC.tool.name,
          description: SPEC.tool.description,
          inputSchema: SPEC.tool.inputSchema,
          outputSchema: SPEC.tool.outputSchema,
          // Some clients favor annotations.title for display
          annotations: { title: SPEC.tool.title, readOnlyHint: false, openWorldHint: true }
        }
      ]
    }
  };
}

async function callGithubRepositoryDispatch(args) {
  const { owner, repo, event_type, client_payload } = args || {};
  const token = process.env.GITHUB_PAT;
  if (!token) throw new Error('Missing GITHUB_PAT environment variable');

  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`,
      'User-Agent': SPEC.name
    },
    body: JSON.stringify({
      event_type,
      client_payload: client_payload || {}
    })
  });

  const bodyText = await resp.text();
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    body: bodyText
  };
}

export default async function handler(req, res) {
  // CORS & common headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // ---- Simple GET probe for Builder / manual checks ----
  if (req.method === 'GET') {
    // Return both a plain 'tools' array (for quick human checks) and a capabilities mirror
    const tools = [{
      name: SPEC.tool.name,
      title: SPEC.tool.title,
      description: SPEC.tool.description,
      // For GET we keep snake_case as many UI probes just display it;
      // MCP clients will use JSON-RPC below which returns camelCase per spec.
      input_schema: SPEC.tool.inputSchema,
      output_schema: SPEC.tool.outputSchema
    }];
    res.status(200).json({ tools, capabilities: { tools }, status: 'ok' });
    return;
  }

  // ---- JSON-RPC handling ----
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {
      res.status(200).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
  }

  const { id, method, params } = body || {};
  if (!method) {
    res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
    return;
  }

  try {
    if (method === 'initialize') {
      const out = mcpInitializeResult();
      out.id = id ?? null;
      res.status(200).json(out);
      return;
    }

    if (method === 'tools/list') {
      const out = mcpListToolsResult();
      out.id = id ?? null;
      res.status(200).json(out);
      return;
    }

    if (method === 'tools/call') {
      // Accept both spec shape and your older shape for compatibility
      // Spec: params = { name: string, arguments?: object }
      // Older: params = { tool: string, input?: object }
      const name = params?.name || params?.tool;
      const args = params?.arguments ?? params?.input ?? {};
      if (name !== SPEC.tool.name) {
        res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not found' } });
        return;
      }
      const result = await callGithubRepositoryDispatch(args);
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          // MCP spec for CallToolResult supports either text or structuredContent.
          // We return structuredContent that matches our outputSchema.
          structuredContent: result
        }
      });
      return;
    }

    // Optional: respond to ping
    if (method === 'ping') {
      res.status(200).json({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (err) {
    res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: err?.message || String(err) }
    });
  }
}
