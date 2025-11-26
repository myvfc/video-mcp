import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;
const VIDEOS_URL = "https://raw.githubusercontent.com/myvfc/video-db/main/videos.json";
const AUTH_TOKEN = process.env.MCP_AUTH || "";

// API Keys - set these in Railway environment variables
const CFBD_API_KEY = process.env.CFBD_API_KEY || "";

let videoDB = [];

/* ----------------------------- Load Videos ------------------------------- */
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

/* ---------------------------- Health Checks ------------------------------ */
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "Unified Boomer Bot MCP",
    tools: 21,
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
    return next();
  }
  
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token === AUTH_TOKEN) {
    return next();
  }
  
  return res.status(401).json({ error: "Unauthorized" });
}

/* ----------------------------- ESPN API CALLS ---------------------------- */
async function callESPN(endpoint) {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football${endpoint}`);
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("ESPN API Error:", err.message);
    return null;
  }
}

/* ----------------------------- CFBD API CALLS ---------------------------- */
async function callCFBD(endpoint) {
  try {
    const response = await fetch(`https://api.collegefootballdata.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${CFBD_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`CFBD API error: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("CFBD API Error:", err.message);
    return null;
  }
}

/* ----------------------------- TOOL HANDLERS ----------------------------- */

// VIDEO SEARCH
async function handleSearchVideos(params) {
  const query = params?.query?.toLowerCase() || "";
  console.log(`🔍 Video Search: "${query}"`);
  
  const matches = videoDB
    .filter(v =>
      v["OU Sooners videos"]?.toLowerCase().includes(query) ||
      v["Description"]?.toLowerCase().includes(query)
    )
    .slice(0, 3);

  console.log(`✅ Found ${matches.length} videos`);
  
  let responseText = "";
  matches.forEach(v => {
    const url = v["URL"] || "";
    const videoId = url.includes('v=') ? url.split('v=')[1].split('&')[0] : "";
    const title = v["OU Sooners videos"] || "OU Video";
    const desc = v["Description"] || "";
    
    if (videoId) {
      responseText += `\n**${title}**\n\n`;
      responseText += `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n\n`;
      responseText += `*${desc}*\n\n`;
    }
  });
  
  responseText += "\nWant to see more? Just ask!";
  return responseText;
}

// ESPN TOOLS
async function handleGetScore(params) {
  const team = params?.team || "Oklahoma";
  console.log(`📊 Get Score: ${team}`);
  const data = await callESPN('/scoreboard');
  
  if (!data?.events) return "No games found.";
  
  const game = data.events.find(e => 
    e.competitions[0].competitors.some(c => c.team.displayName.includes(team))
  );
  
  if (!game) return `No recent game found for ${team}.`;
  
  const comp = game.competitions[0];
  const home = comp.competitors.find(c => c.homeAway === 'home');
  const away = comp.competitors.find(c => c.homeAway === 'away');
  
  return `${away.team.displayName} ${away.score}, ${home.team.displayName} ${home.score} - ${comp.status.type.detail}`;
}

async function handleGetScoreboard(params) {
  console.log(`📊 Get Scoreboard`);
  const data = await callESPN('/scoreboard');
  
  if (!data?.events) return "No games found.";
  
  let result = "📊 College Football Scoreboard:\n\n";
  data.events.slice(0, 10).forEach(e => {
    const comp = e.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    result += `${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score} - ${comp.status.type.detail}\n`;
  });
  
  return result;
}

async function handleGetRankings(params) {
  console.log(`📊 Get Rankings`);
  const data = await callESPN('/rankings');
  
  if (!data?.rankings) return "No rankings available.";
  
  const apPoll = data.rankings.find(r => r.name === "AP Top 25");
  if (!apPoll) return "AP Poll not found.";
  
  let result = "🏆 AP Top 25:\n\n";
  apPoll.ranks.slice(0, 25).forEach(r => {
    result += `${r.current}. ${r.team.displayName} (${r.recordSummary})\n`;
  });
  
  return result;
}

async function handleGetSchedule(params) {
  const team = params?.team || "Oklahoma";
  console.log(`📅 Get Schedule: ${team}`);
  
  // ESPN team ID for Oklahoma is 201
  const data = await callESPN('/teams/201/schedule');
  
  if (!data?.events) return "No schedule found.";
  
  let result = `📅 ${team} Schedule:\n\n`;
  data.events.forEach(e => {
    const comp = e.competitions[0];
    const opponent = comp.competitors.find(c => !c.team.displayName.includes(team));
    const date = new Date(e.date).toLocaleDateString();
    result += `${date} - vs ${opponent?.team.displayName || 'TBD'}\n`;
  });
  
  return result;
}

// CFBD TOOLS
async function handleGetRecruiting(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`🎓 Get Recruiting: ${team} ${year}`);
  
  const data = await callCFBD(`/recruiting/teams?year=${year}&team=${team}`);
  
  if (!data || data.length === 0) return "No recruiting data found.";
  
  const teamData = data[0];
  return `🎓 ${team} ${year} Recruiting:\nRank: #${teamData.rank}\nPoints: ${teamData.points}\nCommits: ${teamData.commits || 'N/A'}`;
}

async function handleGetTeamStats(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`📈 Get Team Stats: ${team} ${year}`);
  
  const data = await callCFBD(`/stats/season?year=${year}&team=${team}`);
  
  if (!data || data.length === 0) return "No stats found.";
  
  let result = `📈 ${team} ${year} Stats:\n\n`;
  data.slice(0, 10).forEach(stat => {
    result += `${stat.statName}: ${stat.statValue}\n`;
  });
  
  return result;
}

async function handleGetTeamMatchup(params) {
  const team1 = params?.team1 || "Oklahoma";
  const team2 = params?.team2 || "Texas";
  console.log(`🏆 Get Matchup: ${team1} vs ${team2}`);
  
  const data = await callCFBD(`/teams/matchup?team1=${team1}&team2=${team2}`);
  
  if (!data) return "No matchup data found.";
  
  return `🏆 ${team1} vs ${team2} All-Time:\n${team1} Wins: ${data.team1Wins}\n${team2} Wins: ${data.team2Wins}\nTies: ${data.ties}`;
}

/* ----------------------------- MCP ENDPOINT ------------------------------ */
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
          serverInfo: { name: "Unified Boomer Bot MCP", version: "1.0.0" }
        }
      });
    }

    // MCP Initialized
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
            // VIDEO TOOL
            {
              name: "search_videos",
              description: "Search 4,773 OU Sooners videos",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string", description: "Search keywords" } },
                required: ["query"]
              }
            },
            // ESPN TOOLS
            {
              name: "get_score",
              description: "Get current/recent game score for a team",
              inputSchema: {
                type: "object",
                properties: { team: { type: "string", description: "Team name (default: Oklahoma)" } }
              }
            },
            {
              name: "get_scoreboard",
              description: "Get current scoreboard for all games",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "get_rankings",
              description: "Get current AP Top 25 rankings",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "get_schedule",
              description: "Get team schedule",
              inputSchema: {
                type: "object",
                properties: { team: { type: "string", description: "Team name (default: Oklahoma)" } }
              }
            },
            // CFBD TOOLS
            {
              name: "get_recruiting",
              description: "Get recruiting class rankings",
              inputSchema: {
                type: "object",
                properties: {
                  team: { type: "string", description: "Team name (default: Oklahoma)" },
                  year: { type: "number", description: "Year (default: current year)" }
                }
              }
            },
            {
              name: "get_team_stats",
              description: "Get team season statistics",
              inputSchema: {
                type: "object",
                properties: {
                  team: { type: "string", description: "Team name (default: Oklahoma)" },
                  year: { type: "number", description: "Year (default: current year)" }
                }
              }
            },
            {
              name: "get_team_matchup",
              description: "Get head-to-head record between two teams",
              inputSchema: {
                type: "object",
                properties: {
                  team1: { type: "string", description: "First team (default: Oklahoma)" },
                  team2: { type: "string", description: "Second team (default: Texas)" }
                }
              }
            }
          ]
        }
      });
    }

    // Tools Call
    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      
      let resultText = "";
      
      // Route to appropriate handler
      switch (toolName) {
        case "search_videos":
          resultText = await handleSearchVideos(toolArgs);
          break;
        case "get_score":
          resultText = await handleGetScore(toolArgs);
          break;
        case "get_scoreboard":
          resultText = await handleGetScoreboard(toolArgs);
          break;
        case "get_rankings":
          resultText = await handleGetRankings(toolArgs);
          break;
        case "get_schedule":
          resultText = await handleGetSchedule(toolArgs);
          break;
        case "get_recruiting":
          resultText = await handleGetRecruiting(toolArgs);
          break;
        case "get_team_stats":
          resultText = await handleGetTeamStats(toolArgs);
          break;
        case "get_team_matchup":
          resultText = await handleGetTeamMatchup(toolArgs);
          break;
        default:
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` }
          });
      }
      
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: resultText
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
  console.log(`🚀 Unified Boomer Bot MCP running on port ${PORT}`);
  console.log(`✅ Server ready with 21 tools`);
  
  // Load videos after server starts
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
