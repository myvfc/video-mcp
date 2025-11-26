import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createRequire } from "module";
const require = createRequire(import.meta.url);


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
await loadVideos();

/* ----------------------------- Express Setup ----------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

/* ----------------------------- Keep Alive ----------------------------- */
setInterval(() => {
  console.log(`💓 Heartbeat ${new Date().toISOString()}`);
}, 30000);

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
app.listen(PORT, () => {
  console.log(`🚀 Video MCP running on port ${PORT}`);
});

