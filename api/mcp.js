export default async function handler(req, res) {
  // If not POST, return the MCP tool spec
  if (req.method !== 'POST') {
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
    return res.status(200).json({
      content: [
        {
          type: 'text',
          text: JSON.stringify(spec, null, 2)
        }
      ]
    });
  }

  // Collect body from the request
  let body = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', resolve);
  });

  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch (err) {
    return res.status(400).json({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: false, status: 400, statusText: 'Invalid JSON', body: '' },
            null,
            2
          )
        }
      ]
    });
  }

  const { owner, repo, event_type, client_payload } = data;

  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    return res.status(500).json({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: false, status: 500, statusText: 'GITHUB_PAT missing', body: '' },
            null,
            2
          )
        }
      ]
    });
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/dispatches`;

  const fetchResponse = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_type,
      client_payload: client_payload || {}
    })
  });

  const text = await fetchResponse.text();
  const ok = fetchResponse.status >= 200 && fetchResponse.status < 300;
  return res.status(fetchResponse.status).json({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok,
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            body: text
          },
          null,
          2
        )
      }
    ]
  });
}
