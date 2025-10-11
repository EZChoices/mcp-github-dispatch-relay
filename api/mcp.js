export default async function handler(req, res) {
  // CORS for Agent Builder
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // MCP tool spec returned as plain JSON
  const spec = {
    name: 'mcp-github-dispatch-relay',
    version: '1.0.0',
    capabilities: {
      tools: {
        'github.repository_dispatch': {
          description: 'Trigger a GitHub repository_dispatch event',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              event_type: { type: 'string' },
              client_payload: { type: 'object' },
            },
            required: ['owner','repo','event_type'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              status: { type: 'number' },
              statusText: { type: 'string' },
              body: { type: 'string' },
            },
          }
        }
      }
    }
  };

  // If not POST, return spec for Agent Builder
  if (req.method !== 'POST') {
    res.status(200).json(spec);
    return;
  }

  // --- Dispatch on POST ---
  let body = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => (body += chunk));
    req.on('end', resolve);
  });

  let data = {};
  try {
    data = JSON.parse(body || '{}');
  } catch {
    res.status(400).json({ ok: false, status: 400, statusText: 'Invalid JSON', body: '' });
    return;
  }

  const { owner, repo, event_type, client_payload } = data;
  const githubPat = process.env.GITHUB_PAT;

  if (!githubPat) {
    res.status(500).json({ ok: false, status: 500, statusText: 'GITHUB_PAT missing', body: '' });
    return;
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;

  const fetchResponse = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type,
      client_payload: client_payload || {},
    }),
  });

  const text = await fetchResponse.text();
  const ok = fetchResponse.status >= 200 && fetchResponse.status < 300;

  res.status(fetchResponse.status).json({
    ok,
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    body: text,
  });
}
