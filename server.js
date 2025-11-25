import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";

/******************************************************
 * CONFIG
 ******************************************************/
const VIDEO_DB_URL =
  "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";

// Refresh every 15 minutes (safe + stable)
const REFRESH_INTERVAL = 15 * 60 * 1000;

// Shared token for bot access (loaded from Railway env)
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("❌ ERROR: MCP_AUTH_TOKEN env variable missing!");
}

/******************************************************
 * EXPRESS SETUP
 ******************************************************/
const app = express();
app.use(express.json());
app.use(cors());

/******************************************************
 * GLOBAL DATABASE
 ******************************************************/
global.videoDb = [];
global.videoDbHash = "";

/******************************************************
 * LOAD DATABASE (initial + refresh)
 ******************************************************/
async function loadVideoDatabase() {
  console.log("📡 Fetching videos.json…");

  try {
    const response = await fetch(VIDEO_DB_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const newHash = crypto.createHash("md5").update(text).digest("hex");

    if (global.videoDbHash === newHash) {
      console.log("⏳ No changes — database unchanged.");
      return false;
    }

    const json = JSON.parse(text);

    global.videoDb = json;
    global.videoDbHash = newHash;

    console.log(`✅ Reloaded ${json.length} videos`);
    return true;
  } catch (err) {
    console.error("❌ Error loading video database:", err);
    return false;
  }
}

/******************************************************
 * AUTO-REFRESH LOOP
 ******************************************************/
function startAutoRefresh() {
  setInterval(async () => {
    console.log("\n🔄 Auto-refresh check…");
    await loadVideoDatabase();
  }, REFRESH_INTERVAL);
}

/******************************************************
 * AUTH MIDDLEWARE
 ******************************************************/
app.use("/mcp", (req, res, next) => {
  const header = req.headers["authorization"] || "";
  const expected = `Bearer ${AUTH_TOKEN}`;

  if (header !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/******************************************************
 * SEARCH FUNCTION
 ******************************************************/
function searchVideos(query) {
  if (!query || query.trim() === "") return [];

  const q = query.toLowerCase();

  return global.videoDb.filter((v) => {
    return (
      (v["OU Sooner video"] &&
        v["OU Sooner video"].toLowerCase().includes(q)) ||
      (v.description && v.description.toLowerCase().includes(q)) ||
      (v.channel && v.channel.toLowerCase().includes(q))
    );
  });
}

/******************************************************
 * ROUTES
 ******************************************************/
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/mcp", (req, res) => {
  res.json({
    name: "Video MCP",
    tools: [
      {
        name: "search_videos",
        description: "Search the OU video database by keyword"
      }
    ]
  });
});

app.post("/mcp", async (req, res) => {
  const { tool, args } = req.body;

  if (tool === "search_videos") {
    const query = args?.query || "";
    const results = searchVideos(query);
    return res.json({
      results: results.slice(0, 50) // return up to 50 matches
    });
  }

  return res.status(400).json({ error: "Unknown tool" });
});

/******************************************************
 * START SERVER
 ******************************************************/
async function startServer() {
  console.log("🚀 Starting Video MCP…");

  await loadVideoDatabase(); // initial DB load
  startAutoRefresh(); // auto-refresh enabled

  const port = process.env.PORT || 8080;

  app.listen(port, () => {
    console.log(`🚀 Video MCP running on port ${port}`);
  });
}

startServer();

