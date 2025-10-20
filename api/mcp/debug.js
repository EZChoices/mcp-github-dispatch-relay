// api/mcp/debug.js

export const runtime = "nodejs";

import { Octokit } from "@octokit/rest";

/**
 * Handles both MCP capability introspection (GET) and dispatch trigger (POST)
 */
export default async function handler(req, res) {
  // ─── 1️⃣ Introspection mode ─────────────────────────────────────────────
  if (req.method === "GET") {
    return res.status(200).json({
      tools: [
        {
          name: "github.repository_dispatch",
          title: "GitHub Repository Dispatch",
          description: "Trigger a GitHub repository_dispatch event",
          input_schema: {
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
          output_schema: {
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
      ],
      capabilities: {
        tools: ["github.repository_dispatch"],
      },
      status: "ok",
    });
  }

  // ─── 2️⃣ Dispatch trigger mode ──────────────────────────────────────────
  console.log("🧩 MCP Debug | Incoming body:", req.body);

  try {
    // Validate input
    const { owner, repo, event_type, client_payload } = req.body || {};
    if (!owner || !repo || !event_type) {
      console.error("❌ Missing required parameters:", { owner, repo, event_type });
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: owner, repo, or event_type.",
      });
    }

    // Init Octokit
    const token = process.env.GITHUB_PAT;
    if (!token) {
      console.error("❌ Missing GITHUB_PAT environment variable");
      return res.status(500).json({
        ok: false,
        error: "Missing GITHUB_PAT in environment variables.",
      });
    }

    const octokit = new Octokit({ auth: token });

    console.log("🚀 Triggering GitHub dispatch:", {
      owner,
      repo,
      event_type,
      payload_keys: Object.keys(client_payload || {}),
    });

    const response = await octokit.repos.createDispatchEvent({
      owner,
      repo,
      event_type,
      client_payload: client_payload || {},
    });

    console.log("✅ GitHub dispatch response:", {
      status: response.status,
      statusText: response.statusText,
    });

    return res.status(200).json({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      message: "GitHub repository_dispatch triggered successfully",
    });
  } catch (error) {
    console.error("❌ MCP Debug Exception:", error);
    return res.status(500).json({
      ok: false,
      status: error.status || 500,
      error: error.message,
      details: error.response?.data || null,
    });
  }
}
