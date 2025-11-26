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
    service: "Unified Boomer Bot MCP - Essential 10",
    tools: 10,
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

// NCAA SCOREBOARD
async function handleGetNcaaScoreboard(params) {
  console.log(`📊 Get NCAA Scoreboard`);
  const data = await callESPN('/scoreboard');
  
  if (!data?.events) return "No games found.";
  
  let result = "📊 NCAA Football Scoreboard:\n\n";
  data.events.slice(0, 15).forEach(e => {
    const comp = e.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    result += `${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score}\n`;
  });
  
  return result;
}

// NCAA RANKINGS
async function handleGetNcaaRankings(params) {
  console.log(`📊 Get NCAA Rankings`);
  const data = await callESPN('/rankings');
  
  if (!data?.rankings) return "No rankings available.";
  
  const coaches = data.rankings.find(r => r.name === "USA Today Coaches Poll");
  if (!coaches) return "Coaches Poll not found.";
  
  let result = "🏆 Coaches Poll Top 25:\n\n";
  coaches.ranks.slice(0, 25).forEach(r => {
    result += `${r.current}. ${r.team.displayName} (${r.recordSummary})\n`;
  });
  
  return result;
}

// GAME PLAYER STATS
async function handleGetGamePlayerStats(params) {
  const team = params?.team || "Oklahoma";
  console.log(`📈 Get Game Player Stats: ${team}`);
  
  // This would need specific game ID - using team schedule as proxy
  const data = await callESPN('/teams/201/schedule');
  
  if (!data?.events || data.events.length === 0) return "No recent games found.";
  
  return `📈 Game player stats require specific game ID. Recent games available for ${team}.`;
}

// CONFERENCE STANDINGS
async function handleGetConferenceStandings(params) {
  const conference = params?.conference || "Big 12";
  const year = params?.year || new Date().getFullYear();
  console.log(`📊 Get Conference Standings: ${conference} ${year}`);
  
  const data = await callCFBD(`/standings?year=${year}&conference=${conference}`);
  
  if (!data || data.length === 0) return "No standings found.";
  
  let result = `📊 ${conference} Standings ${year}:\n\n`;
  data.slice(0, 14).forEach(team => {
    result += `${team.team}: ${team.conference_wins}-${team.conference_losses} (${team.total_wins}-${team.total_losses})\n`;
  });
  
  return result;
}

// GAME STATS
async function handleGetGameStats(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`📈 Get Game Stats: ${team} ${year}`);
  
  const data = await callCFBD(`/games/teams?year=${year}&team=${team}`);
  
  if (!data || data.length === 0) return "No game stats found.";
  
  let result = `📈 ${team} ${year} Game Results:\n\n`;
  data.slice(0, 12).forEach(game => {
    result += `vs ${game.opponent}: ${game.points}-${game.opponent_points}\n`;
  });
  
  return result;
}

// PLAY BY PLAY
async function handleGetPlayByPlay(params) {
  const gameId = params?.gameId;
  console.log(`🎮 Get Play by Play: Game ${gameId}`);
  
  if (!gameId) return "Game ID required for play-by-play data.";
  
  const data = await callCFBD(`/plays?gameId=${gameId}`);
  
  if (!data || data.length === 0) return "No play-by-play data found.";
  
  let result = `🎮 Play-by-Play (showing first 10 plays):\n\n`;
  data.slice(0, 10).forEach(play => {
    result += `Q${play.period} - ${play.clock}: ${play.play_text}\n`;
  });
  
  return result;
}

// PLAYER STATS
async function handleGetPlayerStats(params) {
  const player = params?.player || "Baker Mayfield";
  const year = params?.year || 2017;
  console.log(`📈 Get Player Stats: ${player} ${year}`);
  
  const data = await callCFBD(`/stats/player/season?year=${year}&team=Oklahoma`);
  
  if (!data || data.length === 0) return `No stats found for ${player} in ${year}.`;
  
  const playerData = data.find(p => p.player?.toLowerCase().includes(player.toLowerCase()));
  
  if (!playerData) return `Player ${player} not found.`;
  
  return `📈 ${playerData.player} (${year}):\nCategory: ${playerData.category}\nStat: ${playerData.stat}`;
}

// RETURNING PRODUCTION
async function handleGetReturningProduction(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`📊 Get Returning Production: ${team} ${year}`);
  
  const data = await callCFBD(`/talent?year=${year}`);
  
  if (!data || data.length === 0) return "No returning production data found.";
  
  const teamData = data.find(t => t.school === team);
  
  if (!teamData) return `No data found for ${team}.`;
  
  return `📊 ${team} ${year} Returning Production:\nTalent Rating: ${teamData.talent || 'N/A'}`;
}

// TEAM RANKINGS (Historical)
async function handleGetTeamRankings(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`📊 Get Team Rankings: ${team} ${year}`);
  
  const data = await callCFBD(`/rankings?year=${year}&team=${team}`);
  
  if (!data || data.length === 0) return "No ranking data found.";
  
  let result = `📊 ${team} ${year} Rankings History:\n\n`;
  data.slice(0, 15).forEach(week => {
    result += `Week ${week.week}: AP #${week.rank || 'NR'}\n`;
  });
  
  return result;
}

// TEAM RECORDS
async function handleGetTeamRecords(params) {
  const team = params?.team || "Oklahoma";
  console.log(`🏆 Get Team Records: ${team}`);
  
  const startYear = params?.startYear || 2000;
  const endYear = params?.endYear || new Date().getFullYear();
  
  const data = await callCFBD(`/records?team=${team}&startYear=${startYear}&endYear=${endYear}`);
  
  if (!data || data.length === 0) return "No records found.";
  
  const record = data[0];
  return `🏆 ${team} Records (${startYear}-${endYear}):\nTotal Wins: ${record.total.wins}\nTotal Losses: ${record.total.losses}\nWin %: ${((record.total.wins / (record.total.wins + record.total.losses)) * 100).toFixed(1)}%`;
}

// TEAM TALENT
async function handleGetTeamTalent(params) {
  const team = params?.team || "Oklahoma";
  const year = params?.year || new Date().getFullYear();
  console.log(`⭐ Get Team Talent: ${team} ${year}`);
  
  const data = await callCFBD(`/talent?year=${year}`);
  
  if (!data || data.length === 0) return "No talent data found.";
  
  const teamData = data.find(t => t.school === team);
  
  if (!teamData) return `No talent data for ${team}.`;
  
  return `⭐ ${team} ${year} Talent Composite:\nRank: #${teamData.rank || 'N/A'}\nTalent Score: ${teamData.talent || 'N/A'}`;
}

// VENUE INFO
async function handleGetVenueInfo(params) {
  const venue = params?.venue || "Memorial Stadium";
  console.log(`🏟️ Get Venue Info: ${venue}`);
  
  const data = await callCFBD(`/venues`);
  
  if (!data || data.length === 0) return "No venue data found.";
  
  const venueData = data.find(v => v.name?.toLowerCase().includes(venue.toLowerCase()));
  
  if (!venueData) return `Venue ${venue} not found.`;
  
  return `🏟️ ${venueData.name}:\nLocation: ${venueData.city}, ${venueData.state}\nCapacity: ${venueData.capacity?.toLocaleString() || 'N/A'}\nYear Built: ${venueData.year_constructed || 'N/A'}`;
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

    // Tools List - ESSENTIAL 10 ONLY
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            // VIDEO TOOL (1)
            {
              name: "search_videos",
              description: "Search 4,773 OU Sooners videos - returns embedded video players",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string", description: "Search keywords (1-3 words)" } },
                required: ["query"]
              }
            },
            // ESPN TOOLS (4)
            {
              name: "get_score",
              description: "Get current or recent game score for Oklahoma",
              inputSchema: {
                type: "object",
                properties: { team: { type: "string", description: "Team name (default: Oklahoma)" } }
              }
            },
            {
              name: "get_scoreboard",
              description: "Get today's college football scoreboard - all games",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "get_rankings",
              description: "Get current AP Top 25 rankings",
              inputSchema: { type: "object", properties: {} }
            },
            {
              name: "get_schedule",
              description: "Get Oklahoma's game schedule with dates and opponents",
              inputSchema: {
                type: "object",
                properties: { team: { type: "string", description: "Team name (default: Oklahoma)" } }
              }
            },
            // CFBD TOOLS (5)
            {
              name: "get_recruiting",
              description: "Get OU recruiting class rankings and points",
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
              description: "Get Oklahoma season statistics (yards, touchdowns, etc.)",
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
              description: "Get head-to-head all-time record (e.g. OU vs Texas)",
              inputSchema: {
                type: "object",
                properties: {
                  team1: { type: "string", description: "First team (default: Oklahoma)" },
                  team2: { type: "string", description: "Second team (default: Texas)" }
                }
              }
            },
            {
              name: "get_conference_standings",
              description: "Get conference standings (e.g. Big 12, SEC)",
              inputSchema: {
                type: "object",
                properties: {
                  conference: { type: "string", description: "Conference name (default: Big 12)" },
                  year: { type: "number", description: "Year (default: current year)" }
                }
              }
            },
            {
              name: "get_team_records",
              description: "Get Oklahoma's all-time win/loss records",
              inputSchema: {
                type: "object",
                properties: {
                  team: { type: "string", description: "Team name (default: Oklahoma)" },
                  startYear: { type: "number", description: "Start year (default: 2000)" },
                  endYear: { type: "number", description: "End year (default: current year)" }
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
        case "get_ncaa_scoreboard":
          resultText = await handleGetNcaaScoreboard(toolArgs);
          break;
        case "get_rankings":
          resultText = await handleGetRankings(toolArgs);
          break;
        case "get_ncaa_rankings":
          resultText = await handleGetNcaaRankings(toolArgs);
          break;
        case "get_schedule":
          resultText = await handleGetSchedule(toolArgs);
          break;
        case "get_game_player_stats":
          resultText = await handleGetGamePlayerStats(toolArgs);
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
        case "get_conference_standings":
          resultText = await handleGetConferenceStandings(toolArgs);
          break;
        case "get_game_stats":
          resultText = await handleGetGameStats(toolArgs);
          break;
        case "get_play_by_play":
          resultText = await handleGetPlayByPlay(toolArgs);
          break;
        case "get_player_stats":
          resultText = await handleGetPlayerStats(toolArgs);
          break;
        case "get_returning_production":
          resultText = await handleGetReturningProduction(toolArgs);
          break;
        case "get_team_rankings":
          resultText = await handleGetTeamRankings(toolArgs);
          break;
        case "get_team_records":
          resultText = await handleGetTeamRecords(toolArgs);
          break;
        case "get_team_talent":
          resultText = await handleGetTeamTalent(toolArgs);
          break;
        case "get_venue_info":
          resultText = await handleGetVenueInfo(toolArgs);
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
