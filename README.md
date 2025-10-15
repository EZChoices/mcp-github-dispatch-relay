# MCP GitHub Dispatch Relay

Serverless MCP-compatible API that triggers GitHub `repository_dispatch` events from Vercel deployments.

## Endpoints
- `GET /api/mcp` – Lists available MCP tools.
- `POST /api/mcp` – Handles MCP JSON-RPC requests including `initialize`, `tools/list`, and `tools/call`.
- `GET /api/mcp/openapi` and `GET /api/mcp/openapi.json` – Serve the OpenAPI document with MCP metadata.

## Environment Variables
- `GITHUB_PAT` – Personal access token used to authenticate `repository_dispatch` calls.

Deploying to Vercel requires no custom server entrypoint; the `/api` directory contains only serverless functions.
