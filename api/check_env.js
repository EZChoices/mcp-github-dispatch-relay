export default function handler(req, res) {
  const hasPat = !!process.env.GITHUB_PAT;
  res.status(200).json({
    hasPat,
    length: process.env.GITHUB_PAT ? process.env.GITHUB_PAT.length : 0,
    startsWith: process.env.GITHUB_PAT
      ? process.env.GITHUB_PAT.slice(0, 4)
      : "none",
  });
}
