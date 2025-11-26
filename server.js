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

// Log ALL incoming requests to diagnose Railway health checks
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} from ${req.ip}`);
  next();
});

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
  console.log("🏥 Health check pinged");
  res.status(200).send("OK");
});

app.get("/healthz", (req, res) => {
  console.log("🏥 Healthz check pinged");
  res.status(200).json({ status: "healthy" });
});

/* ---------------------------- Auth Middleware ---------------------------- */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!AUTH_TOKEN) {
    console.log(`⚠️  No AUTH_TOKEN configured - allowing request`);
    return next();
  }
  
  if (token === AUTH_TOKEN) {
    console.log(`✅ Authentication successful`);
    return next();
  }
  
  console.log(`❌ Authentication failed - token mismatch`);
  return res.status(401).json({ error: "Unauthorized" });
}

/* ----------------------------- JSON-RPC MCP ------------------------------ */
app.post("/mcp", requireAuth, async (req, res) => {
  try {
    const { jsonrpc, method, id, params } = req.body;
    
    console.log(`🔧 MCP Request - Method: ${method}, ID: ${id}`);
    
    if (jsonrpc !== "2.0") {
      console.log(`❌ Invalid JSON-RPC version: ${jsonrpc}`);
      return res.json({ jsonrpc: "2.0", id, error: "Invalid JSON-RPC version" });
    }

    // MCP Protocol: Initialize handshake
    if (method === "initialize") {
      console.log(`🤝 MCP Initialize request`);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "Video MCP",
            version: "1.0.0"
          }
        }
      });
    }

    // MCP Protocol: Initialized notification (no response needed)
    if (method === "notifications/initialized") {
      console.log(`✅ MCP Initialized notification received`);
      return res.status(200).end();
    }

    if (method === "tools/list") {
      console.log(`📋 Returning tools list`);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search_videos",
              description: "Search the OU video database (4773 videos)",
              inputSchema: {
                type: "object",
                properties: { 
                  query: { 
                    type: "string",
                    description: "Search keywords (e.g., 'Baker Mayfield', 'Texas', 'touchdown')"
                  } 
                },
                required: ["query"]
              }
            }
          ]
        }
      });
    }

    if (method === "tools/call") {
      if (!params || params.name !== "search_videos") {
        console.log(`❌ Unknown tool requested: ${params?.name}`);
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${params?.name}` }
        });
      }

      const q = params.arguments?.query?.toLowerCase() || "";
      console.log(`🔍 Searching videos with query: "${q}"`);
      
      const matches = videoDB
        .filter(v =>
          v["OU Sooner video"]?.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q)
        )
        .slice(0, 25);

      console.log(`✅ Found ${matches.length} matching videos`);
      
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ results: matches }, null, 2)
            }
          ]
        }
      });
    }

    console.log(`❌ Unknown method: ${method}`);
    return res.json({ 
      jsonrpc: "2.0", 
      id, 
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  } catch (err) {
    console.error("❌ MCP Error", err);
    res.json({ 
      jsonrpc: "2.0", 
      id: null, 
      error: { code: -32603, message: "Internal error" }
    });
  }
});

/* ----------------------------- Start Server ------------------------------ */
const server = app.listen(PORT, () => {
  const addr = server.address();
  console.log(`🚀 Video MCP running on port ${PORT}`);
  console.log(`🌐 Listening on ${addr.address}:${addr.port}`);
  console.log(`✅ Server ready and accepting connections`);
  
  // Load videos AFTER server is running
  loadVideos().then(() => {
    console.log(`📊 Database loaded with ${videoDB.length} videos`);
  });
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
