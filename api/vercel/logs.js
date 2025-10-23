import fs from "fs/promises";

// Fetch logs from Vercel API and persist them in vercel_logs.json.
// Environment variables required:
//   VERCEL_TOKEN: personal token with read access to logs
//   VERCEL_PROJECT_ID: ID of your project (optional if provided via query)
//   VERCEL_DEPLOYMENT_ID: ID of the deployment (optional if provided via query)
//   VERCEL_FUNCTION_NAME: name of the function, e.g., "api/mcp/index.js" (optional if provided via query)
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { projectId, deploymentId, functionName, limit = 200 } = req.query;

  // Pull from query or env
  const project = projectId || process.env.VERCEL_PROJECT_ID;
  const deployment = deploymentId || process.env.VERCEL_DEPLOYMENT_ID;
  const funcName = functionName || process.env.VERCEL_FUNCTION_NAME || "api/mcp/index.js";
  const token = process.env.VERCEL_TOKEN;

  if (!project || !deployment || !token) {
    return res.status(400).json({
      message: "Missing VERCEL_PROJECT_ID, VERCEL_DEPLOYMENT_ID, or VERCEL_TOKEN.",
    });
  }

  // Build API endpoint to fetch logs
  const endpoint = `https://api.vercel.com/v2/projects/${project}/deployments/${deployment}/functions/${encodeURIComponent(
    funcName
  )}/logs?limit=${limit}`;

  try {
    // Fetch logs from Vercel
    const logsResp = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!logsResp.ok) {
      const errText = await logsResp.text();
      return res.status(logsResp.status).json({
        message: `Failed to fetch logs: ${errText}`,
      });
    }

    const newLogs = await logsResp.json();

    // Path for persistent logs file
    const logsPath = "./vercel_logs.json";

    // Load existing logs (if any)
    let existing = [];
    try {
      const raw = await fs.readFile(logsPath, "utf-8");
      existing = JSON.parse(raw);
    } catch (_) {
      // File might not exist yet; ignore.
    }

    // Combine and deduplicate by timestamp + id
    const combined = [
      ...existing,
      ...newLogs.map((l) => ({
        ...l,
        __id: `${l.id || ""}-${l.timestamp || Date.now()}`,
      })),
    ];

    // De-duplicate by __id
    const uniqueLogs = [];
    const seen = new Set();
    for (const log of combined) {
      if (!seen.has(log.__id)) {
        seen.add(log.__id);
        uniqueLogs.push(log);
      }
    }

    // Save merged logs back to file
    await fs.writeFile(logsPath, JSON.stringify(uniqueLogs, null, 2));

    // Return the latest logs to the caller
    return res.status(200).json({
      updated: uniqueLogs.length,
      logs: uniqueLogs,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Unknown error" });
  }
}
