export default function handler(req, res) {
  // CORS for Agent Builder
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Define MCP spec
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
          },
        },
      },
    },
  };

  const repositoryDispatchInputSchema =
    spec.capabilities.tools['github.repository_dispatch'].inputSchema;
  const repositoryDispatchOutputSchema =
    spec.capabilities.tools['github.repository_dispatch'].outputSchema;

  const openapi = {
    openapi: '3.1.0',
    info: {
      title: 'MCP GitHub Dispatch Relay',
      version: '1.0.0',
    },
    paths: {
      '/github/repository_dispatch': {
        post: {
          operationId: 'githubRepositoryDispatch',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: repositoryDispatchInputSchema,
              },
            },
          },
          responses: {
            200: {
              description: 'Successful dispatch',
              content: {
                'application/json': {
                  schema: repositoryDispatchOutputSchema,
                },
              },
            },
          },
        },
      },
    },
    'x-mcp': spec,
  };

  res.status(200).json(openapi);
}
