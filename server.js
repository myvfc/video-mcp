import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;
const VIDEOS_URL = "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";
const AUTH_TOKEN = process.env.MCP_AUTH || "";

let videoDB = [];

/* ----------------------------- Load Database ----------------------------- */
async function loadVideos() {
  console.log("📡 Fetching videos.json…");
  try {
    const res = await fetch(VIDEOS_URL);
    const json = await res.json();
    videoDB = json;
    console.log(`✅ Loaded ${videoDB.length} videos`);
  } catch (err) {
    console.error("❌ Failed to load videos:", err.message);
  }
}

/* ----------------------------- Express Setup ----------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

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
  res.status(200).send("OK");
});

/* ---------------------------- Auth Middleware ---------------------------- */
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) {
    return next(); // No auth required if token not set
  }
  
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token === AUTH_TOKEN) {
    return next();
  }
  
  return res.status(401).json({ error: "Unauthorized" });
}

/* ----------------------------- JSON-RPC MCP ------------------------------ */
app.post("/mcp", requireAuth, async (req, res) => {
  try {
    const { jsonrpc, method, id, params } = req.body;
    
    console.log(`🔧 MCP: ${method}`);
    
    if (jsonrpc !== "2.0") {
      return res.json({ jsonrpc: "2.0", id, error: "Invalid JSON-RPC" });
    }

    // MCP Initialize
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Video MCP", version: "1.0.0" }
        }
      });
    }

    // MCP Initialized notification
    if (method === "notifications/initialized") {
      return res.status(200).end();
    }

    // Tools List
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "search_videos",
              description: "Search 4773 OU Sooners videos",
              inputSchema: {
                type: "object",
                properties: { 
                  query: { type: "string", description: "Search keywords" } 
                },
                required: ["query"]
              }
            }
          ]
        }
      });
    }

    // Tools Call
    if (method === "tools/call") {
      const toolName = params?.name;
      
      if (toolName !== "search_videos") {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Unknown tool" }
        });
      }

      const query = params?.arguments?.query?.toLowerCase() || "";
      console.log(`🔍 Search: "${query}"`);
      
      const matches = videoDB
        .filter(v =>
          v["OU Sooners videos"]?.toLowerCase().includes(query) ||
          v["Description"]?.toLowerCase().includes(query)
        )
        .slice(0, 25); // Get up to 25, bot will show only 3

      console.log(`✅ Found ${matches.length} videos`);
      
      // Format videos with embed info
      const formattedVideos = matches.map(v => ({
        title: v["OU Sooners videos"],
        url: v["URL"],
        videoId: v["URL"]?.split('v=')[1]?.split('&')[0], // Extract YouTube ID
        embedUrl: v["URL"]?.includes('youtube.com') 
          ? `https://www.youtube.com/embed/${v["URL"].split('v=')[1]?.split('&')[0]}`
          : v["URL"],
        description: v["Description"],
        channel: v["Channel"],
        publishedDate: v["Published Date"]
      }));
      
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                results: formattedVideos,
                totalFound: matches.length,
                message: "Show maximum 3 videos. User can request more if needed."
              }, null, 2)
            }
          ]
        }
      });
    }

    // Unknown method
    return res.json({ 
      jsonrpc: "2.0", 
      id, 
      error: { code: -32601, message: "Method not found" }
    });
    
  } catch (err) {
    console.error("❌ MCP Error:", err.message);
    return res.json({ 
      jsonrpc: "2.0", 
      id: null, 
      error: { code: -32603, message: "Internal error" }
    });
  }
});

/* ----------------------------- Start Server ------------------------------ */
const server = app.listen(PORT, () => {
  console.log(`🚀 Video MCP running on port ${PORT}`);
  console.log(`✅ Server ready`);
  
  // Load videos AFTER server starts
  loadVideos().then(() => {
    console.log(`📊 Database ready`);
    // Auto-refresh every 15 minutes
    setInterval(loadVideos, 15 * 60 * 1000);
  });
});

/* --------------------------- Error Handlers ------------------------------ */
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});
