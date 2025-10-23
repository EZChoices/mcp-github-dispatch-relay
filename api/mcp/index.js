// /api/mcp/index.js
// Unified MCP + direct dispatch handler

import { Octokit } from "@octokit/rest";

export const runtime = "nodejs";

const SPEC = {
  name: "mcp-github-dispatch-relay",
  version: "1.0.2",
  tool: {
    name: "github.repository_dispatch",
    title: "GitHub Repository Dispatch",
    description: "Trigger a GitHub repository_dispatch event",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        event_type: { type: "string" },
        client_payload: { type: "object" },
      },
      required: ["owner", "repo", "event_type"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        status: { type: "number" },
        statusText: { type: "string" },
        body: { type: "string" },
      },
      required: ["ok", "status"],
    },
  },
};

// ────────────────────────────────────────────────
// MCP Handshake helpers
// ────────────────────────────────────────────────

function mcpInitializeResult() {
  return {
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2025-06-18",
      serverInfo: {
        name: SPEC.name,
        version: SPEC.version,
        title: "GitHub Dispatch MCP",
      },
      capabilities: {
        tools: {
          [SPEC.tool.name]: {
            description: SPEC.tool.description,
            inputSchema: SPEC.tool.inputSchema,
            outputSchema: SPEC.tool.outputSchema,
            annotations: {
              title: SPEC.tool.title,
              readOnlyHint: false,
              openWorldHint: true,
            },
          },
        },
      },
    },
  };
}

function mcpListToolsResult() {
  return {
    jsonrpc: "2.0",
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
            openWorldHint: true,
          },
        },
      ],
    },
  };
}

// ────────────────────────────────────────────────
// GitHub Dispatch Logic (via Octokit)
// ────────────────────────────────────────────────

async function callGithubRepositoryDispatch(args) {
  let { owner, repo, event_type, client_payload } = args || {};
  if (event_type === "echo_test") {
    event_type = "ping_test";
  }
  console.log("Dispatch args", { owner, repo, event_type, client_payload });
  const token = process.env.GITHUB_PAT;
  if (!token) throw new Error("Missing GITHUB_PAT environment variable");

  const octokit = new Octokit({ auth: token });
  const response = await octokit.repos.createDispatchEvent({
    owner,
    repo,
    event_type,
    client_payload: client_payload || {},
  });
  console.log("Dispatch response", response.status, response.data);

  return {
    ok: response.status < 300,
    status: response.status,
    statusText: response.statusText || "OK",
    body: JSON.stringify(response.data || {}),
  };
}

// ────────────────────────────────────────────────
// Main Handler
// ────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS" || req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  // Simple GET probe for MCP manifest
  if (req.method === "GET") {
    const tools = [
      {
        name: SPEC.tool.name,
        title: SPEC.tool.title,
        description: SPEC.tool.description,
        input_schema: SPEC.tool.inputSchema,
        output_schema: SPEC.tool.outputSchema,
      },
    ];
    res.status(200).json({ tools, capabilities: { tools }, status: "ok" });
    return;
  }

  // JSON-RPC Handling (MCP)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(200).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }
  }

  const { id, method, params } = body || {};

  try {
    // ─── MCP standard methods ────────────────────
    if (method === "initialize") {
      const out = mcpInitializeResult();
      out.id = id ?? null;
      res.status(200).json(out);
      return;
    }

    if (method === "tools/list") {
      const out = mcpListToolsResult();
      out.id = id ?? null;
      res.status(200).json(out);
      return;
    }

    if (method === "ping") {
      res.status(200).json({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    // ─── Unified dispatch handler ────────────────
    if (method === "github.repository_dispatch") {
      try {
        const result = await callGithubRepositoryDispatch(params);

        // 👇 Always send a valid JSON-RPC 2.0 success envelope
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: {
            ok: result.ok,
            status: result.status,
            statusText: result.statusText,
            body: result.body || "",
          }
        });
      } catch (error) {
        // 👇 And a valid JSON-RPC error envelope on failure
        console.error("Dispatch error", error);
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: error?.message || String(error)
          }
        });
      }
    }

    if (method === "tools/call") {
      const args = params?.arguments ?? params?.input ?? {};
      const name = params?.name || params?.tool;

      if (name !== SPEC.tool.name) {
        res.status(200).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Tool not found" },
        });
        return;
      }

      try {
        const result = await callGithubRepositoryDispatch(args);
        res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: {
            ok: result.ok,
            status: result.status,
            statusText: result.statusText,
            body: result.body || "",
          },
        });
      } catch (err) {
        console.error("Dispatch call error", err);
        res.status(200).json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: err?.message || String(err),
          },
        });
      }
      return;
    }

    // ─── Fallback ─────────────────────────────────
    res.status(200).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  } catch (err) {
    res.status(500).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err?.message || String(err) },
    });
  }
}
