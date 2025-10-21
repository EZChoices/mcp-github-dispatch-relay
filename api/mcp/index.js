// /api/mcp/index.js (Vercel/Next API route)

const SPEC = {
  name: 'mcp-github-dispatch-relay',
  version: '1.0.1',
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

// ────────────────────────────────────────────────────────────────
// Initialization helpers
// ────────────────────────────────────────────────────────────────

function mcpInitializeResult() {
  return {
    jsonrpc: '2.0',
    result: {
      protocolVersion: '2025-06-18',
      serverInfo: {
        name: SPEC.name,
        version: SPEC.version,
        title: 'GitHub Dispatch MCP'
      },
      capabilities: {
        tools: {}
      }
    }
  };
}

function mcpListToolsResult() {
  return {
    jsonrpc: '2.0',
    result: {
      tools: [
        {
          name: SPEC.tool.name,
          description: SPEC.tool.description,
          inputSchema: SPEC.tool.inputSchema,
          outputSchema: SPEC.tool.outputSchema,
          annotations: {
            title: SPEC.tool.title,
            readOnlyHint: false,
            openWorldHint: true
          }
        }
      ]
    }
  };
}

// ────────────────────────────────────────────────────────────────
// GitHub Dispatch
// ────────────────────────────────────────────────────────────────

async function callGithubRepositoryDispatch(args) {
  const { owner, repo, event_type, client_payload } = args || {};
  const token = process.env.GITHUB_PAT;
  if (!token) throw new Error('Missing GITHUB_PAT environment variable');

  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`, // classic PAT
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

// ────────────────────────────────────────────────────────────────
// Main Handler
// ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // ─── Simple GET probe ─────────────────────────────────────────
  if (req.method === 'GET') {
    const tools = [{
      name: SPEC.tool.name,
      title: SPEC.tool.title,
      description: SPEC.tool.description,
      input_schema: SPEC.tool.inputSchema,
      output_schema: SPEC.tool.outputSchema
    }];
    res.status(200).json({ tools, capabilities: { tools }, status: 'ok' });
    return;
  }

  // ─── JSON-RPC Handling ─────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(200).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      });
      return;
    }
  }

  const { id, method, params } = body || {};
  if (!method) {
    res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request' }
    });
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

    // ✅ Main call path
    if (method === 'tools/call') {
      const name = params?.name || params?.tool;
      const args = params?.arguments ?? params?.input ?? {};
      if (name !== SPEC.tool.name) {
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Tool not found' }
        });
        return;
      }

      const result = await callGithubRepositoryDispatch(args);
      res.status(result.status).json({
        jsonrpc: '2.0',
        id,
        result
      });
      return;
    }

    // ✅ New shortcut for direct calls like your PowerShell test
    if (method === 'github.repository_dispatch') {
      const result = await callGithubRepositoryDispatch(params);
      res.status(result.status).json({
        jsonrpc: '2.0',
        id,
        result
      });
      return;
    }

    if (method === 'ping') {
      res.status(200).json({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (err) {
    res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: err?.message || String(err)
      }
    });
  }
}
