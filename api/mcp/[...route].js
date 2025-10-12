export default function handler(req, res) {
  // CORS for Agent Builder
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const routeParam = req.query.route || [];
  const segments = Array.isArray(routeParam) ? routeParam : [routeParam];
  const subpath = segments.join('/');

  if (subpath === 'openapi' || subpath === 'openapi.json') {
    const openapi = {
      openapi: '3.0.0',
      info: {
        title: 'mcp-github-dispatch-relay',
        version: '1.0.0',
        description: 'OpenAPI spec for GitHub repository dispatch MCP server'
      },
      paths: {},
      components: {},
      'x-mcp': {
        name: 'mcp-github-dispatch-relay',
        version: '1.0.0',
        capabilities: {
          tools: {
            'github.repository_dispatch': {
              description: 'Triggers a GitHub repository_dispatch event',
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
      }
    };
    res.status(200).json(openapi);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
