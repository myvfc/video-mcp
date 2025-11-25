import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import crypto from "crypto";

/******************************************************
 * CONFIG
 ******************************************************/
const VIDEO_DB_URL =
  "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";

const REFRESH_INTERVAL = 15 * 60 * 1000;

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

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
 * JSON-RPC /mcp ENDPOINT (REQUIRED BY MCP SPEC)
 ******************************************************/
app.post("/mcp", (req, res) => {
  const rpc = req.body;

  // Validate basic JSON-RPC structure
  if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.id || !rpc.method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" }
    });
  }

  /*********************************************
   * TOOL DISCOVERY — method: tools/list
   *********************************************/
  if (rpc.method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        name: "Video MCP",
        tools: [
          {
            name: "search_videos",
            description: "Search the OU video database by keyword",
            input_schema: {
              type: "object",
              properties: {
                query: { type: "string" }
              },
              required: ["query"]
            }
          }
        ]
      }
    });
  }

  /*********************************************
   * TOOL EXECUTION — method: tools/call
   *********************************************/
  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name;
    const args = rpc.params?.arguments || {};

    if (toolName === "search_videos") {
      const q = args.query || "";
      const results = searchVideos(q);

      return res.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { results: results.slice(0, 50) }
      });
    }

    return res.status(400).json({
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32601, message: "Unknown tool" }
    });
  }

  /*********************************************
   * UNKNOWN METHOD
   *********************************************/
  return res.status(400).json({
    jsonrpc: "2.0",
    id: rpc.id,
    error: { code: -32601, message: "Method not found" }
  });
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

  await loadVideoDatabase();
  startAutoRefresh();

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 Video MCP running on port ${port}`);
  });
}
/******************************************************
 * KEEP-ALIVE HEARTBEAT
 ******************************************************/
setInterval(() => {
  console.log("💓 Keep-alive heartbeat", new Date().toISOString());
}, 30000);

startServer();
