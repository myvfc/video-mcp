import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;
const VIDEOS_URL = "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";
const AUTH_TOKEN = process.env.MCP_AUTH || "";  // add in Railway variables

let videoDB = [];

/* ----------------------------- Load Database ----------------------------- */
async function loadVideos() {
  console.log("📡 Fetching videos.json…");
  try {
    const res = await fetch(VIDEOS_URL);
    const json = await res.json();
    videoDB = json;
    console.log(`✅ Reloaded video database (${videoDB.length} videos)`);
  } catch (err) {
    console.error("❌ Failed to load videos.json:", err);
  }
}

/* ----------------------------- Auto Refresh ------------------------------ */
setInterval(loadVideos, 15 * 60 * 1000); // 15 minutes

/* ----------------------------- Express Setup ----------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

/* ----------------------------- Keep Alive ----------------------------- */
// Railway provides these automatically - no manual setup needed:
// RAILWAY_PUBLIC_DOMAIN or RAILWAY_STATIC_URL
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.RAILWAY_STATIC_URL || null;

// Self-ping to keep Railway container alive
if (RAILWAY_URL) {
  console.log(`🔄 Keep-alive enabled for: ${RAILWAY_URL}`);
  setInterval(async () => {
    try {
      const response = await fetch(`${RAILWAY_URL}/health`);
      const data = await response.json();
      console.log(`💓 Keep-alive ping: ${data.videos} videos, status: ${data.status}`);
    } catch (err) {
      console.log(`💓 Keep-alive ping attempt (waiting for domain...)`);
    }
  }, 5 * 60 * 1000); // Ping every 5 minutes
} else {
  console.log(`⚠️  No Railway URL detected - keep-alive disabled (normal for local dev)`);
}

// Heartbeat logging
setInterval(() => {
  console.log(`💓 Heartbeat ${new Date().toISOString()} | Videos: ${videoDB.length}`);
}, 30000);

/* ---------------------------- Health Check ------------------------------- */
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Video MCP Server",
    videos: videoDB.length,
    uptime: process.uptime()
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    videos: videoDB.length 
  });
});

/* ---------------------------- Auth Middleware ---------------------------- */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!AUTH_TOKEN || token === AUTH_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

/* ----------------------------- JSON-RPC MCP ------------------------------ */
app.post("/mcp", requireAuth, async (req, res) => {
  try {
    const { jsonrpc, method, id, params } = req.body;
    
    if (jsonrpc !== "2.0") {
      return res.json({ jsonrpc: "2.0", id, error: "Invalid JSON-RPC version" });
    }

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          name: "Video MCP",
          tools: [
            {
              name: "search_videos",
              description: "Search the OU video database",
              input_schema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"]
              }
            }
          ]
        }
      });
    }

    if (method === "tools/call") {
      if (!params || params.name !== "search_videos") {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: "Unknown tool"
        });
      }

      const q = params.arguments?.query?.toLowerCase() || "";
      const matches = videoDB
        .filter(v =>
          v["OU Sooner video"]?.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q)
        )
        .slice(0, 25);

      return res.json({
        jsonrpc: "2.0",
        id,
        result: { results: matches }
      });
    }

    return res.json({ jsonrpc: "2.0", id, error: "Unknown method" });
  } catch (err) {
    console.error("❌ MCP Error", err);
    res.json({ jsonrpc: "2.0", id: null, error: "Server error" });
  }
});

/* ----------------------------- Start Server ------------------------------ */
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Video MCP running on port ${PORT}`);
  console.log(`✅ Server ready and accepting connections`);
  
  // Load videos AFTER server is running
  loadVideos().then(() => {
    console.log(`📊 Database loaded with ${videoDB.length} videos`);
  });
});

// Ensure server is listening on all interfaces
server.on('listening', () => {
  const addr = server.address();
  console.log(`🌐 Listening on ${addr.address}:${addr.port}`);
});

/* --------------------------- Error Handlers ------------------------------ */
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});
