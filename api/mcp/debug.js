// api/mcp/debug.js

export const runtime = "nodejs"; // ✅ Replaces deprecated config.runtime

import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
  console.log("🧩 MCP Debug | Incoming request body:", req.body);

  try {
    const { event_type, client_payload } = req.body || {};

    const octokit = new Octokit({
      auth: process.env.GITHUB_PAT,
    });

    const response = await octokit.repos.createDispatchEvent({
      owner: "EZChoices",
      repo: "agent-factory",
      event_type: event_type || "run_ci",
      client_payload: client_payload || {},
    });

    console.log("✅ Dispatch success:", response.status);
    return res.status(200).json({
      ok: true,
      response: response.status,
      message: "GitHub dispatch triggered successfully",
    });
  } catch (error) {
    console.error("❌ MCP Debug Error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
