import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";

/******************************************************
 * CONFIG
 ******************************************************/
const VIDEO_DB_URL =
  "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";

// Refresh every 15 minutes (safe interval)
const REFRESH_INTERVAL = 15 * 60 * 1000;

// Auth token required for MCP access
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("❌ ERROR: MCP_AUTH_TOKEN environment variable is missing!");
}

/******************************************************
 * EXPRESS SETUP
 ******************************************************/
const app = express();
app.use(express.json());
app.use(cors());

/******************************************************
 * GLOBAL DATABASE CACHE
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
      console.log("⏳ No changes — using cached video DB.");
      return false;
    }

    const json = JSON.parse(text);

    global.videoDb = json;
    global.videoDbHash = newHash;

    console.log(`✅ Reloaded video database (${json.length} videos)`);
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
 * MCP ROUTES — FULL TOOL DISCOVERY FIX
 ******************************************************/

// GET /mcp → tool discovery
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

// POST /mcp → discovery OR tool execution
app.post("/mcp", (req, res) => {
  const body = req.body || {};

  // NO "tool" field → treat as discovery
  if (!body.tool) {
    return res.json({
      name: "Video MCP",
      tools: [
        {
          name: "search_videos",
          description: "Search the OU video database by keyword"
        }
      ]
    });
  }

  // Handle tool execution
  if (body.tool === "search_videos") {
    const q = body.args?.query || "";
    const results = searchVideos(q);
    return res.json({ results: results.slice(0, 50) });
  }

  return res.status(400).json({ error: "Unknown tool" });
});

/******************************************************
 * HEALTH CHECK
 ******************************************************/
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/******************************************************
 * START SERVER
 ******************************************************/
async function startServer() {
  console.log("🚀 Starting Video MCP…");

  await loadVideoDatabase(); // initial load
  startAutoRefresh(); // schedule auto-refresh

  const port = process.env.PORT || 8080;

  app.listen(port, () => {
    console.log(`🚀 Video MCP running on port ${port}`);
  });
}

startServer();


