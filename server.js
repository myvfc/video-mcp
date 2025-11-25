import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ⭐ SERVE OPENAPI FILE HERE ⭐
app.get("/openapi.json", (req, res) => {
  res.sendFile(path.join(__dirname, "openapi.json"));
});

// =======================
// CONFIG
// =======================
const VIDEO_JSON_URL = "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;  // set in Railway
let videos = [];

// =======================
// LOAD VIDEO DATABASE
// =======================
async function loadVideos() {
  try {
    console.log("📡 Fetching videos.json…");

    const response = await fetch(VIDEO_JSON_URL);
    const data = await response.json();

    videos = data;
    console.log(`✅ Reloaded video database (${videos.length} videos)`);

  } catch (err) {
    console.error("❌ Error loading videos.json:", err);
  }
}

// =======================
// AUTO REFRESH EVERY 5 MIN
// =======================
async function startAutoRefresh() {
  await loadVideos();  
  setInterval(loadVideos, 5 * 60 * 1000);
}

// =======================
// AUTH MIDDLEWARE
// =======================
app.use((req, res, next) => {
  const header = req.headers["authorization"] || "";
  const token = header.replace("Bearer ", "").trim();

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

// =======================
// JSON-RPC MCP ENDPOINT
// =======================
app.post("/mcp", (req, res) => {
  const { method, params, id } = req.body;

  // ---------------------
  // TOOL DISCOVERY
  // ---------------------
  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
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

  // ---------------------
  // TOOL CALL
  // ---------------------
  if (method === "tools/call") {
    if (params.name === "search_videos") {
      const q = params.arguments.query.toLowerCase();

      // Use your REAL Google Sheet headers:
      const results = videos.filter(video => {
        const title = (video["OU Sooner video"] || "").toLowerCase();
        const desc = (video["description"] || "").toLowerCase();
        const channel = (video["channel"] || "").toLowerCase();

        return (
          title.includes(q) ||
          desc.includes(q) ||
          channel.includes(q)
        );
      });

      return res.json({
        jsonrpc: "2.0",
        id,
        result: { results }
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { message: "Unknown tool" }
    });
  }

  return res.json({
    jsonrpc: "2.0",
    id,
    error: { message: "Unknown method" }
  });
});

// =======================
// KEEP ALIVE HEARTBEAT
// =======================
setInterval(() => {
  console.log("💓 Keep-alive heartbeat", new Date().toISOString());
}, 30 * 1000);

// =======================
// START SERVER
// =======================
async function startServer() {
  console.log("🚀 Starting Video MCP…");

  await loadVideos();
  startAutoRefresh();

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 Video MCP running on port ${port}`);
  });
}

startServer();
