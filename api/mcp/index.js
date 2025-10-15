export default async function handler(req, res) {
  try {
    // CORS headers (allow all origins and methods)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Respond to CORS preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    const tools = [
      {
        name: "github.repository_dispatch",
        description: "Trigger a GitHub repository_dispatch event on your repo",
        input_schema: {
          type: "object",
          properties: {
            event_type: { type: "string" },
            client_payload: { type: "object" }
          },
          required: ["event_type"]
        }
      }
    ];
    res.status(200).json({ tools, status: "ok" });
  } catch (err) {
    console.error("MCP relay failed:", err);
    res.status(500).json({ error: err.message });
  }
}
