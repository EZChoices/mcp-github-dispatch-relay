export const config = {
  runtime: "nodejs", // ensure Node runtime (Edge sometimes hides env vars)
};

/**
 * Debug endpoint for verifying GitHub token visibility and runtime environment.
 * Accessible at: https://<your-vercel-project>.vercel.app/api/debug
 */

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const tokenPAT = process.env.GITHUB_PAT || null;
  const tokenGITHUB = process.env.GITHUB_TOKEN || null;

  const result = {
    runtime: process.versions.node ? "node" : "edge",
    envKeys: Object.keys(process.env).filter((k) => k.includes("GITHUB")),
    has_GITHUB_PAT: !!tokenPAT,
    has_GITHUB_TOKEN: !!tokenGITHUB,
    token_PAT_prefix: tokenPAT ? tokenPAT.slice(0, 4) : null,
    token_GITHUB_prefix: tokenGITHUB ? tokenGITHUB.slice(0, 4) : null,
    github_api_status: null,
    github_api_message: null,
  };

  // Optional: Ping GitHub API with whichever token exists
  const token = tokenPAT || tokenGITHUB;
  if (token) {
    try {
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      result.github_api_status = resp.status;
      const data = await resp.json().catch(() => ({}));
      result.github_api_message =
        data?.login || data?.message || "GitHub API reachable";
    } catch (err) {
      result.github_api_status = "fetch_failed";
      result.github_api_message = err.message;
    }
  } else {
    result.github_api_message = "No token available in environment";
  }

  res.status(200).json(result);
}
