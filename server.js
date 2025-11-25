import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Where JSON lives (your GitHub repo)
const RAW_URL = "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";

let videos = [];

// Load JSON from GitHub
async function loadVideos() {
  const res = await fetch(RAW_URL);
  videos = await res.json();
  console.log(`Loaded ${videos.length} videos`);
}

// Search logic matched to YOUR sheet fields
function searchVideos(q) {
  const query = q.toLowerCase();

  return videos.filter(v =>
    (v["OU Sooner video"] && v["OU Sooner video"].toLowerCase().includes(query)) ||
    (v["description"] && v["description"].toLowerCase().includes(query)) ||
    (v["channel"] && v["channel"].toLowerCase().includes(query)) ||
    (v["published date"] && String(v["published date"]).toLowerCase().includes(query)) ||
    (v["url"] && v["url"].toLowerCase().includes(query))
  );
}

// Healthcheck
app.get("/health", (req, res) => res.send("OK"));

// MCP endpoint
app.post("/mcp", async (req, res) => {
  await loadVideos();

  const { tool, arguments: args } = req.body;

  if (tool === "search_videos") {
    const results = searchVideos(args.q || "");
    return res.json({ success: true, tool, result: results });
  }

  res.status(400).json({ error: "Unknown tool" });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Video MCP running on ${PORT}`);
  await loadVideos();
});
