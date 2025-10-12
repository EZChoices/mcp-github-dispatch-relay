import express from "express";
import { z } from "zod";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createHttpHandler } from "@modelcontextprotocol/sdk/server/http.js";
import cors from "cors";


const GITHUB_PAT = process.env.GITHUB_PAT;
if (!GITHUB_PAT) {
  console.warn("Missing GITHUB_PAT in environment");
}

const app = express();
app.use(cors());


// MCP server and tool
const mcp = new McpServer(
  {
    name: "mcp-github-dispatch-relay",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Validate args using zod
const DispatchArgs = z.object({
  owner: z.string(),
  repo: z.string(),
  event_type: z.string(),
  client_payload: z.record(z.any()).default({})
});

// Register tool
mcp.tool(
  "github.repository_dispatch",
  "POST /repos/{owner}/{repo}/dispatches with event_type and client_payload",
  {
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        event_type: { type: "string" },
        client_payload: { type: "object", additionalProperties: true }
      },
      required: ["owner", "repo", "event_type"]
    },
    do: async (args) => {
      const parsed = DispatchArgs.parse(args);
      const url = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/dispatches`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "mcp-github-dispatch-relay"
        },
        body: JSON.stringify({
          event_type: parsed.event_type,
          client_payload: parsed.client_payload
        })
      });
      const text = await res.text();
      const ok = res.status >= 200 && res.status < 300;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok,
                status: res.status,
                statusText: res.statusText,
                body: text
              },
              null,
              2
            )
          }
        ]
      };
    }
  }
);

// Setup routes
const handler = createHttpHandler(mcp);
app.use("/mcp", express.json({ limit: "1mb" }), handler);

app.get("/", (_req, res) => {
  res.status(200).send("MCP GitHub Dispatch Relay OK");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Relay listening on http://localhost:${port}/mcp`);
});
