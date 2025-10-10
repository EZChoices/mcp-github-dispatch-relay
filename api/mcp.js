import { z } from "zod";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createHttpHandler } from "@modelcontextprotocol/sdk/server/http.js";

const GITHUB_PAT = process.env.GITHUB_PAT;
if (!GITHUB_PAT) {
  console.warn("Missing GITHUB_PAT in environment");
}

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

const DispatchArgs = z.object({
  owner: z.string(),
  repo: z.string(),
  event_type: z.string(),
  client_payload: z.record(z.any()).default({})
});

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

      const url = `https://api.github.com/repos/${encodeURIComponent(
        parsed.owner
      )}/${encodeURIComponent(parsed.repo)}/dispatches`;

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

const handler = createHttpHandler(mcp);

export default async function (req, res) {
  return handler(req, res);
}
