const PROP_CACHE_TTL_MS = 60 * 1000;
const PITCHER_HAND_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const PROP_CACHE = global.__BOBBY_MLB_PROP_CACHE__ || new Map();
const PITCHER_HAND_CACHE = global.__BOBBY_MLB_PITCHER_HAND_CACHE__ || new Map();

if (!global.__BOBBY_MLB_PROP_CACHE__) global.__BOBBY_MLB_PROP_CACHE__ = PROP_CACHE;
if (!global.__BOBBY_MLB_PITCHER_HAND_CACHE__) global.__BOBBY_MLB_PITCHER_HAND_CACHE__ = PITCHER_HAND_CACHE;

const HITTER_PARK_FACTORS = {
  "Arizona Diamondbacks": 1.02,
  "Athletics": 1.01,
  "Atlanta Braves": 1.01,
  "Baltimore Orioles": 1.00,
  "Boston Red Sox": 1.04,
  "Chicago Cubs": 1.02,
  "Chicago White Sox": 0.98,
  "Cincinnati Reds": 1.05,
  "Cleveland Guardians": 0.98,
  "Colorado Rockies": 1.15,
  "Detroit Tigers": 0.97,
  "Houston Astros": 0.99,
  "Kansas City Royals": 0.99,
  "Los Angeles Angels": 1.00,
  "Los Angeles Dodgers": 1.01,
  "Miami Marlins": 0.94,
  "Milwaukee Brewers": 1.01,
  "Minnesota Twins": 1.00,
  "New York Mets": 0.98,
  "New York Yankees": 1.03,
  "Philadelphia Phillies": 1.03,
  "Pittsburgh Pirates": 0.97,
  "San Diego Padres": 0.97,
  "San Francisco Giants": 0.94,
  "Seattle Mariners": 0.95,
  "St. Louis Cardinals": 0.98,
  "Tampa Bay Rays": 0.96,
  "Texas Rangers": 1.04,
  "Toronto Blue Jays": 1.01,
  "Washington Nationals": 1.00
};

const TEAM_CANONICAL = {
  "arizona diamondbacks": "Arizona Diamondbacks",
  "diamondbacks": "Arizona Diamondbacks",
  "d backs": "Arizona Diamondbacks",
  "d-backs": "Arizona Diamondbacks",
  "dbacks": "Arizona Diamondbacks",
  "ari": "Arizona Diamondbacks",

  "athletics": "Athletics",
  "as": "Athletics",
  "a s": "Athletics",
  "a's": "Athletics",
  "oakland athletics": "Athletics",
  "ath": "Athletics",

  "atlanta braves": "Atlanta Braves",
  "braves": "Atlanta Braves",
  "atl": "Atlanta Braves",

  "baltimore orioles": "Baltimore Orioles",
  "orioles": "Baltimore Orioles",
  "bal": "Baltimore Orioles",

  "boston red sox": "Boston Red Sox",
  "red sox": "Boston Red Sox",
  "bos": "Boston Red Sox",

  "chicago cubs": "Chicago Cubs",
  "chi cubs": "Chicago Cubs",
  "cubs": "Chicago Cubs",
  "chc": "Chicago Cubs",

  "chicago white sox": "Chicago White Sox",
  "chi white sox": "Chicago White Sox",
  "white sox": "Chicago White Sox",
  "cws": "Chicago White Sox",

  "cincinnati reds": "Cincinnati Reds",
  "reds": "Cincinnati Reds",
  "cin": "Cincinnati Reds",

  "cleveland guardians": "Cleveland Guardians",
  "guardians": "Cleveland Guardians",
  "cle": "Cleveland Guardians",

  "colorado rockies": "Colorado Rockies",
  "rockies": "Colorado Rockies",
  "col": "Colorado Rockies",

  "detroit tigers": "Detroit Tigers",
  "tigers": "Detroit Tigers",
  "det": "Detroit Tigers",

  "houston astros": "Houston Astros",
  "astros": "Houston Astros",
  "hou": "Houston Astros",

  "kansas city royals": "Kansas City Royals",
  "royals": "Kansas City Royals",
  "kc royals": "Kansas City Royals",
  "kc": "Kansas City Royals",

  "los angeles angels": "Los Angeles Angels",
  "angels": "Los Angeles Angels",
  "la angels": "Los Angeles Angels",
  "anaheim angels": "Los Angeles Angels",
  "laa": "Los Angeles Angels",

  "los angeles dodgers": "Los Angeles Dodgers",
  "dodgers": "Los Angeles Dodgers",
  "la dodgers": "Los Angeles Dodgers",
  "lad": "Los Angeles Dodgers",

  "miami marlins": "Miami Marlins",
  "marlins": "Miami Marlins",
  "mia": "Miami Marlins",

  "milwaukee brewers": "Milwaukee Brewers",
  "brewers": "Milwaukee Brewers",
  "mil": "Milwaukee Brewers",

  "minnesota twins": "Minnesota Twins",
  "twins": "Minnesota Twins",
  "min": "Minnesota Twins",

  "new york mets": "New York Mets",
  "ny mets": "New York Mets",
  "mets": "New York Mets",
  "nym": "New York Mets",

  "new york yankees": "New York Yankees",
  "ny yankees": "New York Yankees",
  "yankees": "New York Yankees",
  "nyy": "New York Yankees",

  "philadelphia phillies": "Philadelphia Phillies",
  "phillies": "Philadelphia Phillies",
  "phi": "Philadelphia Phillies",

  "pittsburgh pirates": "Pittsburgh Pirates",
  "pirates": "Pittsburgh Pirates",
  "pit": "Pittsburgh Pirates",

  "san diego padres": "San Diego Padres",
  "padres": "San Diego Padres",
  "sd": "San Diego Padres",
  "sdp": "San Diego Padres",

  "san francisco giants": "San Francisco Giants",
  "giants": "San Francisco Giants",
  "sf": "San Francisco Giants",
  "sfg": "San Francisco Giants",

  "seattle mariners": "Seattle Mariners",
  "mariners": "Seattle Mariners",
  "sea": "Seattle Mariners",

  "st louis cardinals": "St. Louis Cardinals",
  "st. louis cardinals": "St. Louis Cardinals",
  "cardinals": "St. Louis Cardinals",
  "stl": "St. Louis Cardinals",

  "tampa bay rays": "Tampa Bay Rays",
  "rays": "Tampa Bay Rays",
  "tb": "Tampa Bay Rays",
  "tbr": "Tampa Bay Rays",

  "texas rangers": "Texas Rangers",
  "rangers": "Texas Rangers",
  "tex": "Texas Rangers",

  "toronto blue jays": "Toronto Blue Jays",
  "blue jays": "Toronto Blue Jays",
  "jays": "Toronto Blue Jays",
  "tor": "Toronto Blue Jays",

  "washington nationals": "Washington Nationals",
  "nationals": "Washington Nationals",
  "nats": "Washington Nationals",
  "wsh": "Washington Nationals",
  "was": "Washington Nationals"
};

const TEAM_ABBREV = {
  "Arizona Diamondbacks": "ARI",
  "Athletics": "ATH",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH"
};

const SUPPORTED_PROP_MARKETS = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "pitcher_strikeouts",
  "pitcher_outs"
];

module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const requestedView = String((req && req.query && req.query.view) || "full").toLowerCase();
  const viewMode = requestedView === "props" ? "props" : (requestedView === "f5" ? "f5" : "full");
  const shouldLoadProps = viewMode === "props";
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const fullGameLimit = 10;
  const propsGameLimit = 5;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const baseUrl =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&bookmakers=betmgm` +
    `&oddsFormat=american` +
    `&commenceTimeFrom=${nowIso}`;

  try {
    const [oddsResponse, mlbLineups] = await Promise.all([
      fetch(baseUrl),
      fetchOfficialLineupsFromMLB()
    ]);

    if (!oddsResponse.ok) {
      return res.status(oddsResponse.status).json({
        error: "Odds API request failed",
        details: await oddsResponse.text(),
        mode: viewMode
      });
    }

    const oddsData = await oddsResponse.json();
    const upcomingGames = (Array.isArray(oddsData) ? oddsData : []).filter(game => {
      if (!game || !game.commence_time) return false;
      return new Date(game.commence_time).getTime() > Date.now();
    });

    const limitedGames = upcomingGames.slice(0, shouldLoadProps ? propsGameLimit : fullGameLimit);
    const scheduleCache = await buildScheduleCache(limitedGames);

    const games = await Promise.all(
      limitedGames.map(async (game, index) => {
        const bookmaker = Array.isArray(game.bookmakers) ? game.bookmakers[0] : null;
        const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

        const homeTeam = normalizeTeamName(game.home_team || "Home");
        const awayTeam = normalizeTeamName(game.away_team || "Away");

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const moneylineData = parseMoneyline(h2hMarket, homeTeam, awayTeam);
        const spreadData = parseSpreads(spreadMarket, homeTeam, awayTeam);
        const totalData = parseTotals(totalMarket);

        const matchedScheduleGame = findMatchingScheduleGame(scheduleCache, {
          away: awayTeam,
          home: homeTeam,
          rawCommenceTime: game.commence_time
        });

        const probablePitchers = getProbablePitchersFromSchedule(matchedScheduleGame);
        probablePitchers.awayHand = probablePitchers.awayId ? await fetchPitcherHand(probablePitchers.awayId) : null;
        probablePitchers.homeHand = probablePitchers.homeId ? await fetchPitcherHand(probablePitchers.homeId) : null;

        const parkFactor = getParkFactor(homeTeam);
        const lineupContext = buildLineupContext({
          homeTeam,
          awayTeam,
          mlbLineups,
          probablePitchers,
          scheduleGame: matchedScheduleGame
        });

        let propResult = {
          candidates: [],
          topProp: null,
          status: shouldLoadProps ? "No supported BetMGM prop returned." : "Prop lookup skipped for current mode.",
          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource
        };

        if (shouldLoadProps) {
          propResult = await fetchPropCandidatesForEventCached(game.id, apiKey, {
            homeTeam,
            awayTeam,
            probablePitchers,
            parkFactor,
            lineupContext
          });
        }

        const componentScores = buildComponentScores({
          moneylineData,
          totalData,
          spreadData,
          lineupContext,
          parkFactor,
          probablePitchers,
          homeTeam,
          awayTeam
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
          moneylineData,
          totalData,
          spreadData,
          parkFactor
        });

        const context = {
          gameId: game.id,
          viewMode,
          rawCommenceTime: game.commence_time || null,
          awayTeam,
          homeTeam,
          moneylineData,
          spreadData,
          totalData,
          lineupContext,
          probablePitchers,
          parkFactor,
          componentScores,
          modelOutputs,
          propCandidates: propResult.candidates || []
        };

        const candidates = generateAllCandidates(context);
        const scoredCandidates = scoreCandidates(context, candidates);
        const rankedCandidates = applyPerGameRanking(scoredCandidates);
        const filteredForView = filterCandidatesForView(rankedCandidates, viewMode);
        const bestCandidate = chooseBestCandidate(filteredForView, rankedCandidates, viewMode);
        const topPropCandidate = chooseTopPropCandidate(rankedCandidates);
        const riskWarnings = buildRiskWarnings(componentScores, bestCandidate, rankedCandidates, viewMode);

        return buildGamePayload({
          index,
          originalGame: game,
          viewMode,
          awayTeam,
          homeTeam,
          moneylineData,
          spreadData,
          totalData,
          bestCandidate,
          topPropCandidate,
          propResult,
          componentScores,
          modelOutputs,
          lineupContext,
          probablePitchers,
          riskWarnings,
          scoredCandidates: rankedCandidates,
          parkFactor
        });
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      mode: viewMode,
      notes: [
        "Official lineup composition is used when a full or partial confirmed matchup is successfully parsed.",
        "Props mode evaluates hitter and pitcher props directly when supported BetMGM prop markets are returned.",
        viewMode === "f5"
          ? "F5 mode uses starter-heavy context and does not silently fall back to full-game picks."
          : "Full-game mode evaluates moneyline, total, run line, and props when requested."
      ],
      games
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not load odds data",
      details: error && error.message ? error.message : String(error),
      mode: viewMode
    });
  }
};

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n || 0)));
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[^\w\s@.'()\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(name) {
  const raw = normalizeText(name);
  if (!raw) return "";

  const key = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  return TEAM_CANONICAL[key] || raw;
}

function teamAbbrevHint(teamName) {
  return TEAM_ABBREV[normalizeTeamName(teamName)] || "";
}

function matchupKey(awayTeam, homeTeam) {
  return `${normalizeTeamName(awayTeam)} @ ${normalizeTeamName(homeTeam)}`;
}

function getParkFactor(homeTeam) {
  return HITTER_PARK_FACTORS[normalizeTeamName(homeTeam)] || 1.0;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function average(arr) {
  const vals = safeArray(arr).map(Number).filter(v => isFinite(v));
  if (!vals.length) return 0;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

function median(arr) {
  const vals = safeArray(arr).map(Number).filter(v => isFinite(v)).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

function americanToImpliedProb(price) {
  const n = Number(price);
  if (!isFinite(n) || n === 0) return null;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}

function impliedProbToAmerican(prob) {
  const p = Number(prob);
  if (!isFinite(p) || p <= 0 || p >= 1) return null;
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function getGameDateEt(rawIso) {
  if (!rawIso) return null;
  try {
    return new Date(rawIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch (e) {
    return null;
  }
}

function formatGameDateTimeEt(rawIso) {
  if (!rawIso) return "—";
  try {
    const d = new Date(rawIso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }) + " ET";
  } catch (e) {
    return "—";
  }
}

async function buildScheduleCache(games) {
  const uniqueDates = new Set();
  safeArray(games).forEach(game => {
    if (!game || !game.commence_time) return;
    const key = getGameDateEt(game.commence_time);
    if (key) uniqueDates.add(key);
  });

  const cache = {};
  await Promise.all(Array.from(uniqueDates).map(async dateEt => {
    try {
      cache[dateEt] = await fetchScheduleForDate(dateEt);
    } catch (e) {
      cache[dateEt] = null;
    }
  }));

  return cache;
}

async function fetchScheduleForDate(dateEt) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(dateEt)}&hydrate=probablePitcher,team`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Schedule fetch failed");
  return res.json();
}

function findMatchingScheduleGame(scheduleCache, pick) {
  const dateKey = getGameDateEt(pick.rawCommenceTime);
  const scheduleJson = dateKey ? scheduleCache[dateKey] : null;
  if (!scheduleJson || !Array.isArray(scheduleJson.dates)) return null;

  let best = null;
  let bestDiff = Infinity;

  for (const date of scheduleJson.dates) {
    const games = Array.isArray(date.games) ? date.games : [];
    for (const game of games) {
      const away = normalizeTeamName(game?.teams?.away?.team?.name);
      const home = normalizeTeamName(game?.teams?.home?.team?.name);
      if (away !== normalizeTeamName(pick.away) || home !== normalizeTeamName(pick.home)) continue;

      const gameTs = new Date(game.gameDate || 0).getTime();
      const pickTs = new Date(pick.rawCommenceTime || 0).getTime();
      const diff = Math.abs(gameTs - pickTs);
      if (diff < bestDiff) {
        best = game;
        bestDiff = diff;
      }
    }
  }

  return best;
}

function getProbablePitchersFromSchedule(scheduleGame) {
  return {
    away: scheduleGame?.teams?.away?.probablePitcher?.fullName || "TBD",
    home: scheduleGame?.teams?.home?.probablePitcher?.fullName || "TBD",
    awayId: scheduleGame?.teams?.away?.probablePitcher?.id || null,
    homeId: scheduleGame?.teams?.home?.probablePitcher?.id || null,
    awayHand: null,
    homeHand: null
  };
}

async function fetchPitcherHand(playerId) {
  const cacheKey = String(playerId);
  const cached = PITCHER_HAND_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PITCHER_HAND_CACHE_TTL_MS) return cached.value;

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(playerId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const person = Array.isArray(data.people) ? data.people[0] : null;
    const hand = person?.pitchHand?.code || null;
    PITCHER_HAND_CACHE.set(cacheKey, { ts: Date.now(), value: hand });
    return hand;
  } catch (e) {
    return null;
  }
}

async function fetchOfficialLineupsFromMLB() {
  const url = "https://www.mlb.com/starting-lineups";
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) return {};
    const html = await response.text();
    return parseMLBStartingLineups(html);
  } catch (error) {
    return {};
  }
}

function isMatchupHeaderLine(line) {
  if (!line || !/\s@\s/.test(line)) return false;
  const parts = line.split(/\s@\s/);
  if (parts.length !== 2) return false;
  return !!normalizeTeamName(parts[0]) && !!normalizeTeamName(parts[1]);
}

function splitIntoGameBlocks(lines) {
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeText(lines[i]);
    if (!line) continue;

    if (isMatchupHeaderLine(line)) {
      if (current && current.lines.length) blocks.push(current);
      const parts = line.split(/\s@\s/);
      current = {
        awayTeam: normalizeTeamName(parts[0]),
        homeTeam: normalizeTeamName(parts[1]),
        lines: [line]
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current && current.lines.length) blocks.push(current);
  return blocks;
}

function sanitizePlayerName(name) {
  return normalizeText(name).replace(/\s+\-$/, "").trim();
}

function dedupeAndSortLineup(players) {
  const map = new Map();
  for (const p of safeArray(players)) {
    const key = `${Number(p?.lineupIndex || 0)}|${normalizeName(p?.name || "")}`;
    if (!map.has(key) && Number(p?.lineupIndex || 0) > 0 && normalizeName(p?.name || "")) {
      map.set(key, {
        lineupIndex: Number(p.lineupIndex),
        name: sanitizePlayerName(p.name),
        bats: String(p.bats || "").toUpperCase() || null
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.lineupIndex - b.lineupIndex)
    .slice(0, 9);
}

function firstValidLineup(groups) {
  if (!Array.isArray(groups)) return [];
  for (const g of groups) {
    if (Array.isArray(g) && g.length === 9) return g;
  }
  let best = [];
  for (const g of groups) {
    if (Array.isArray(g) && g.length > best.length) best = g;
  }
  return best;
}

function detectLineupLabelTeam(line, awayTeam, homeTeam) {
  const match = String(line || "").match(/^(.+?)\s+Lineup$/i);
  if (!match) return null;

  const labelRaw = normalizeText(match[1]);
  const labelCanon = normalizeTeamName(labelRaw);

  const awayCanon = normalizeTeamName(awayTeam);
  const homeCanon = normalizeTeamName(homeTeam);

  if (labelCanon === awayCanon) return "away";
  if (labelCanon === homeCanon) return "home";

  const labelUpper = labelRaw.toUpperCase();
  if (labelUpper === teamAbbrevHint(awayCanon)) return "away";
  if (labelUpper === teamAbbrevHint(homeCanon)) return "home";

  return null;
}

function extractOneLineup(blockLines, startIndex) {
  const players = [];

  for (let i = startIndex; i < blockLines.length; i++) {
    const line = normalizeText(blockLines[i]);
    if (!line) continue;

    if (/^.+?\s+Lineup$/i.test(line) && players.length > 0) break;
    if (/^(Gameday|Preview|Recap|Tickets|Umpire|Weather)\b/i.test(line) && players.length > 0) break;
    if (/^\d+\.\s+TBD$/i.test(line)) return [];

    const match =
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]{1,3}$/i) ||
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)$/i) ||
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\b/i);

    if (match) {
      players.push({
        lineupIndex: Number(match[1]),
        name: sanitizePlayerName(match[2]),
        bats: String(match[3] || "").toUpperCase()
      });
      if (players.length >= 9) break;
    }
  }

  return dedupeAndSortLineup(players);
}

function parseMLBStartingLineups(html) {
  const cleaned = String(html || "")
    .replace(/\r/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");

  const rawLines = cleaned
    .split("\n")
    .map(normalizeText)
    .filter(Boolean);

  const blocks = splitIntoGameBlocks(rawLines);
  const out = {};

  for (const block of blocks) {
    const awayTeam = normalizeTeamName(block.awayTeam);
    const homeTeam = normalizeTeamName(block.homeTeam);
    const awayGroups = [];
    const homeGroups = [];

    for (let i = 0; i < block.lines.length; i++) {
      const side = detectLineupLabelTeam(block.lines[i], awayTeam, homeTeam);
      if (side === "away") awayGroups.push(extractOneLineup(block.lines, i + 1));
      if (side === "home") homeGroups.push(extractOneLineup(block.lines, i + 1));
    }

    const awayPlayers = firstValidLineup(awayGroups);
    const homePlayers = firstValidLineup(homeGroups);

    out[matchupKey(awayTeam, homeTeam)] = {
      awayTeam,
      homeTeam,
      awayPlayers,
      homePlayers,
      awayCount: awayPlayers.length,
      homeCount: homePlayers.length
    };
  }

  return out;
}

function buildProjectedLineupFromScheduleTeam(scheduleSide) {
  const lineup = [];
  const possibleBatters =
    safeArray(scheduleSide?.batters).length
      ? scheduleSide.batters
      : safeArray(scheduleSide?.players);

  for (let i = 0; i < possibleBatters.length; i++) {
    const p = possibleBatters[i];
    lineup.push({
      lineupIndex: i + 1,
      name: sanitizePlayerName(p?.fullName || p?.name || ""),
      bats: p?.batSide?.code || p?.batSide || null
    });
  }

  const players = dedupeAndSortLineup(lineup);
  return { players, count: players.length };
}

function buildLineupContext({ homeTeam, awayTeam, mlbLineups, probablePitchers, scheduleGame }) {
  const key = matchupKey(awayTeam, homeTeam);
  const official = mlbLineups && mlbLineups[key] ? mlbLineups[key] : null;

  const officialAwayPlayers = safeArray(official?.awayPlayers);
  const officialHomePlayers = safeArray(official?.homePlayers);

  const projectedAway = buildProjectedLineupFromScheduleTeam(scheduleGame?.teams?.away);
  const projectedHome = buildProjectedLineupFromScheduleTeam(scheduleGame?.teams?.home);

  const awayOfficial = officialAwayPlayers.length === 9;
  const homeOfficial = officialHomePlayers.length === 9;
  const anyOfficial = awayOfficial || homeOfficial;

  return {
    lineupMode: anyOfficial ? "official" : "projected",
    lineupSource: anyOfficial ? "mlb-starting-lineups" : "schedule-projected",
    officialLineupAvailable: anyOfficial,
    projectedLineupUsed: !anyOfficial,
    probablePitchers,

    officialLineups: {
      away: {
        team: awayTeam,
        players: awayOfficial ? officialAwayPlayers : [],
        count: officialAwayPlayers.length,
        isOfficial: awayOfficial
      },
      home: {
        team: homeTeam,
        players: homeOfficial ? officialHomePlayers : [],
        count: officialHomePlayers.length,
        isOfficial: homeOfficial
      }
    },

    projectedLineups: {
      away: {
        team: awayTeam,
        players: projectedAway.players,
        count: projectedAway.count
      },
      home: {
        team: homeTeam,
        players: projectedHome.players,
        count: projectedHome.count
      }
    },

    lineupDebug: {
      requestedMatchupKey: key,
      foundOfficialMatchup: !!official,
      officialAwayCount: officialAwayPlayers.length,
      officialHomeCount: officialHomePlayers.length,
      awayOfficial,
      homeOfficial,
      finalLineupMode: anyOfficial ? "official" : "projected",
      finalLineupSource: anyOfficial ? "mlb-starting-lineups" : "schedule-projected"
    }
  };
}

function getUsableLineup(lineupContext, side) {
  const official = lineupContext?.officialLineups?.[side];
  if (official?.isOfficial && safeArray(official.players).length) return official;
  return lineupContext?.projectedLineups?.[side] || { players: [], count: 0 };
}

function getLineupSlotBonus(slot) {
  const s = Number(slot || 0);
  if (s >= 1 && s <= 2) return 1.2;
  if (s === 3) return 1.1;
  if (s === 4) return 1.0;
  if (s === 5) return 0.85;
  if (s === 6) return 0.7;
  if (s === 7) return 0.55;
  if (s === 8) return 0.4;
  if (s === 9) return 0.3;
  return 0.25;
}

function getTeamLineupPressure(lineup) {
  const players = safeArray(lineup?.players);
  if (!players.length) return 0;

  let score = 0;
  players.forEach(player => {
    score += getLineupSlotBonus(player.lineupIndex);
    if (player.bats === "S") score += 0.08;
  });

  return round2(score / 8);
}
function getPitcherVsLineupTilt(marketKey, opposingLineup, pitcherHand) {
  const players = safeArray(opposingLineup?.players);
  if (!players.length) return 0;

  let topOrderPenalty = 0;
  let platoonPressure = 0;
  let lineupDepth = 0;

  players.forEach(player => {
    const slot = Number(player.lineupIndex || 0);
    if (slot >= 1 && slot <= 3) topOrderPenalty += 0.12;
    else if (slot >= 4 && slot <= 6) topOrderPenalty += 0.08;
    else topOrderPenalty += 0.03;

    lineupDepth += 0.04;

    if (player.bats === "S") platoonPressure += 0.07;
    else if (pitcherHand && player.bats && player.bats !== pitcherHand) platoonPressure += 0.05;
  });

  let score = 0;
  if (marketKey === "pitcher_strikeouts") {
    score = -topOrderPenalty + platoonPressure - (lineupDepth * 0.35);
  } else if (marketKey === "pitcher_outs") {
    score = -(topOrderPenalty * 1.1) - (platoonPressure * 0.8) - (lineupDepth * 0.2);
  }

  return round2(score);
}

function getHitterPropTilt(playerName, marketKey, playerTeam, lineupContext, probablePitchers, parkFactor) {
  const side = normalizeTeamName(playerTeam) === normalizeTeamName(lineupContext?.officialLineups?.away?.team || lineupContext?.projectedLineups?.away?.team || "")
    ? "away"
    : "home";

  const ownLineup = getUsableLineup(lineupContext, side);
  const opposingPitcherHand = side === "away" ? probablePitchers?.homeHand : probablePitchers?.awayHand;
  const players = safeArray(ownLineup.players);
  const norm = normalizeName(playerName);
  const player = players.find(p => normalizeName(p.name) === norm);

  let score = 0;
  if (player) {
    score += getLineupSlotBonus(player.lineupIndex) * 0.22;
    if (player.bats === "S") score += 0.12;
    else if (opposingPitcherHand && player.bats && player.bats !== opposingPitcherHand) score += 0.1;
    else if (opposingPitcherHand && player.bats && player.bats === opposingPitcherHand) score -= 0.05;
  } else {
    score -= 0.1;
  }

  const lineupPressure = getTeamLineupPressure(ownLineup) * 0.12;
  score += lineupPressure;

  if (marketKey === "batter_home_runs") score += ((parkFactor || 1) - 1) * 1.4;
  if (marketKey === "batter_total_bases") score += ((parkFactor || 1) - 1) * 1.0;
  if (marketKey === "batter_hits") score += ((parkFactor || 1) - 1) * 0.6;

  return round2(score);
}

function parseMoneyline(h2hMarket, homeTeam, awayTeam) {
  const outcomes = safeArray(h2hMarket?.outcomes);
  const awayOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(awayTeam));
  const homeOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(homeTeam));

  const awayPrice = hasValue(awayOutcome?.price) ? Number(awayOutcome.price) : null;
  const homePrice = hasValue(homeOutcome?.price) ? Number(homeOutcome.price) : null;

  return {
    awayPrice,
    homePrice,
    awayImpliedProb: americanToImpliedProb(awayPrice),
    homeImpliedProb: americanToImpliedProb(homePrice),
    display: `${awayTeam} ${formatOdds(awayPrice)} / ${homeTeam} ${formatOdds(homePrice)}`
  };
}

function parseSpreads(spreadMarket, homeTeam, awayTeam) {
  const outcomes = safeArray(spreadMarket?.outcomes);
  const awayOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(awayTeam));
  const homeOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(homeTeam));

  const awayPoint = hasValue(awayOutcome?.point) ? Number(awayOutcome.point) : null;
  const homePoint = hasValue(homeOutcome?.point) ? Number(homeOutcome.point) : null;
  const awayPrice = hasValue(awayOutcome?.price) ? Number(awayOutcome.price) : null;
  const homePrice = hasValue(homeOutcome?.price) ? Number(homeOutcome.price) : null;

  return {
    awayPoint,
    homePoint,
    awayPrice,
    homePrice,
    display: `${awayTeam} ${formatSpread(awayPoint)} ${formatOdds(awayPrice)} / ${homeTeam} ${formatSpread(homePoint)} ${formatOdds(homePrice)}`
  };
}

function parseTotals(totalMarket) {
  const outcomes = safeArray(totalMarket?.outcomes);
  const overOutcome = outcomes.find(o => String(o.name || "").toLowerCase() === "over");
  const underOutcome = outcomes.find(o => String(o.name || "").toLowerCase() === "under");

  const line = hasValue(overOutcome?.point) ? Number(overOutcome.point) :
    (hasValue(underOutcome?.point) ? Number(underOutcome.point) : null);

  const overPrice = hasValue(overOutcome?.price) ? Number(overOutcome.price) : null;
  const underPrice = hasValue(underOutcome?.price) ? Number(underOutcome.price) : null;

  return {
    line,
    overPrice,
    underPrice,
    overImpliedProb: americanToImpliedProb(overPrice),
    underImpliedProb: americanToImpliedProb(underPrice),
    display: `O/U ${hasValue(line) ? line : "—"} (Over ${formatOdds(overPrice)} / Under ${formatOdds(underPrice)})`
  };
}

function formatSpread(v) {
  if (!hasValue(v)) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function formatOdds(v) {
  if (!hasValue(v)) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function buildComponentScores({ moneylineData, totalData, spreadData, lineupContext, parkFactor, probablePitchers, homeTeam, awayTeam }) {
  const homeLineup = getUsableLineup(lineupContext, "home");
  const awayLineup = getUsableLineup(lineupContext, "away");

  const homeLineupPressure = getTeamLineupPressure(homeLineup);
  const awayLineupPressure = getTeamLineupPressure(awayLineup);
  const lineupTilt = round2((homeLineupPressure - awayLineupPressure) * 0.45);

  let pitcherTilt = 0;
  if (probablePitchers?.away !== "TBD" && probablePitchers?.home !== "TBD") {
    if (probablePitchers.awayHand && probablePitchers.homeHand) {
      pitcherTilt = probablePitchers.homeHand === probablePitchers.awayHand ? 0 : 0.2;
    } else {
      pitcherTilt = 0.08;
    }
  }

  const offenseVsHand = round2(lineupTilt * 0.85);
  const parkScore = round2(((parkFactor || 1) - 1) * 8.2);

  const marketContext = hasValue(moneylineData?.awayPrice) && hasValue(moneylineData?.homePrice) ? "live" : "partial";
  const totalContext = hasValue(totalData?.line) ? "live" : "partial";

  return {
    side: {
      startingPitcher: pitcherTilt,
      bullpen: 0,
      lineup: lineupTilt,
      offenseVsHand
    },
    total: {
      parkFactor: parkScore,
      lineupEnvironment: round2((homeLineupPressure + awayLineupPressure - 1.7) * 0.35),
      starterQuality: round2(-pitcherTilt * 0.25)
    },
    f5: {
      startingPitcher: round2(pitcherTilt * 1.25),
      lineup: round2(lineupTilt * 0.7),
      offenseVsHand: round2(offenseVsHand * 0.75),
      runEnvironment: round2(parkScore * 0.75)
    },
    liveFeedStatus: {
      marketContext,
      totals: totalContext,
      bullpen: "placeholder",
      scheduleTravel: "placeholder",
      defense: "placeholder"
    },
    teamContext: {
      away: awayTeam,
      home: homeTeam,
      homeLineupPressure,
      awayLineupPressure
    }
  };
}

function buildModelOutputs({ componentScores, moneylineData, totalData, spreadData, parkFactor }) {
  const sideRaw = (
    Number(componentScores?.side?.startingPitcher || 0) +
    Number(componentScores?.side?.bullpen || 0) +
    Number(componentScores?.side?.lineup || 0) +
    Number(componentScores?.side?.offenseVsHand || 0)
  );

  const totalRaw = (
    Number(componentScores?.total?.parkFactor || 0) +
    Number(componentScores?.total?.lineupEnvironment || 0) +
    Number(componentScores?.total?.starterQuality || 0)
  );

  const f5Raw = (
    Number(componentScores?.f5?.startingPitcher || 0) +
    Number(componentScores?.f5?.lineup || 0) +
    Number(componentScores?.f5?.offenseVsHand || 0)
  );

  const awayImplied = Number(moneylineData?.awayImpliedProb || 0.5);
  const homeImplied = Number(moneylineData?.homeImpliedProb || 0.5);

  const homeWinProb = clamp(homeImplied + (sideRaw * 0.03), 0.38, 0.62);
  const awayWinProb = round2(1 - homeWinProb);

  const fairMlHome = impliedProbToAmerican(homeWinProb);
  const fairMlAway = impliedProbToAmerican(awayWinProb);

  const overBase = Number(totalData?.overImpliedProb || 0.5);
  const overProb = clamp(overBase + (totalRaw * 0.02), 0.39, 0.61);
  const underProb = round2(1 - overProb);

  const fairTotal = hasValue(totalData?.line)
    ? round2(Number(totalData.line) + (totalRaw * 0.15))
    : null;

  const homeEdgePct = round2((homeWinProb - Number(moneylineData?.homeImpliedProb || 0)) * 100);
  const awayEdgePct = round2((awayWinProb - Number(moneylineData?.awayImpliedProb || 0)) * 100);
  const overEdgePct = round2((overProb - Number(totalData?.overImpliedProb || 0)) * 100);
  const underEdgePct = round2((underProb - Number(totalData?.underImpliedProb || 0)) * 100);

  const homeRunLineConfidence = round2(clamp(50 + (homeEdgePct * 4.2) + (sideRaw * 8), 34, 78));
  const awayRunLineConfidence = round2(clamp(50 + (awayEdgePct * 4.2) - (sideRaw * 8), 34, 78));
  const overConfidence = round2(clamp(50 + (overEdgePct * 4.0) + (totalRaw * 6), 35, 77));
  const underConfidence = round2(clamp(50 + (underEdgePct * 4.0) - (totalRaw * 6), 35, 77));

  const f5HomeProb = clamp(homeImplied + (f5Raw * 0.035), 0.38, 0.62);
  const f5AwayProb = round2(1 - f5HomeProb);
  const f5OverProb = clamp(overBase + ((Number(componentScores?.f5?.runEnvironment || 0) + f5Raw) * 0.018), 0.39, 0.61);
  const f5UnderProb = round2(1 - f5OverProb);

  return {
    fairMlAway,
    fairMlHome,
    fairTotal,

    awayWinProb: round2(awayWinProb * 100),
    homeWinProb: round2(homeWinProb * 100),
    awayEdgePct,
    homeEdgePct,
    overEdgePct,
    underEdgePct,

    overConfidence,
    underConfidence,
    awayRunLineConfidence,
    homeRunLineConfidence,

    firstFiveAwayWinProb: round2(f5AwayProb * 100),
    firstFiveHomeWinProb: round2(f5HomeProb * 100),
    firstFiveOverProb: round2(f5OverProb * 100),
    firstFiveUnderProb: round2(f5UnderProb * 100)
  };
}

function generateAllCandidates(context) {
  const candidates = [];

  addFullGameCandidates(candidates, context);
  addF5Candidates(candidates, context);
  addPropCandidates(candidates, context);

  return candidates;
}

function addFullGameCandidates(candidates, context) {
  const m = context.moneylineData;
  const t = context.totalData;
  const s = context.spreadData;
  const o = context.modelOutputs;

  if (hasValue(m.awayPrice)) {
    candidates.push({
      marketFamily: "side",
      candidateType: "away_ml",
      bestBet: `${context.awayTeam} ML`,
      bestBetType: "Side",
      oddsPrice: m.awayPrice,
      fairProb: (o.awayWinProb || 50) / 100,
      impliedProb: m.awayImpliedProb,
      edgePct: o.awayEdgePct,
      contextTilt: getContextTiltForCandidate("side", "away", context),
      reasons: buildSideReasons(context, "away")
    });
  }

  if (hasValue(m.homePrice)) {
    candidates.push({
      marketFamily: "side",
      candidateType: "home_ml",
      bestBet: `${context.homeTeam} ML`,
      bestBetType: "Side",
      oddsPrice: m.homePrice,
      fairProb: (o.homeWinProb || 50) / 100,
      impliedProb: m.homeImpliedProb,
      edgePct: o.homeEdgePct,
      contextTilt: getContextTiltForCandidate("side", "home", context),
      reasons: buildSideReasons(context, "home")
    });
  }

  if (hasValue(t.line)) {
    candidates.push({
      marketFamily: "total",
      candidateType: "over_full",
      bestBet: `Over ${t.line}`,
      bestBetType: "Total",
      oddsPrice: t.overPrice,
      fairProb: ((100 - (o.underConfidence || 50)) / 100),
      impliedProb: t.overImpliedProb,
      edgePct: o.overEdgePct,
      contextTilt: getContextTiltForCandidate("total", "over", context),
      reasons: buildTotalReasons(context, "over")
    });

    candidates.push({
      marketFamily: "total",
      candidateType: "under_full",
      bestBet: `Under ${t.line}`,
      bestBetType: "Total",
      oddsPrice: t.underPrice,
      fairProb: ((100 - (o.overConfidence || 50)) / 100),
      impliedProb: t.underImpliedProb,
      edgePct: o.underEdgePct,
      contextTilt: getContextTiltForCandidate("total", "under", context),
      reasons: buildTotalReasons(context, "under")
    });
  }

  if (hasValue(s.awayPoint) && hasValue(s.awayPrice)) {
    candidates.push({
      marketFamily: "runline",
      candidateType: "away_rl",
      bestBet: `${context.awayTeam} ${formatSpread(s.awayPoint)}`,
      bestBetType: "Run Line",
      oddsPrice: s.awayPrice,
      fairProb: 0.5,
      impliedProb: americanToImpliedProb(s.awayPrice),
      edgePct: round2((Number(context.modelOutputs.awayRunLineConfidence || 50) - 50) / 3.1),
      contextTilt: getContextTiltForCandidate("runline", "away", context),
      reasons: buildRunLineReasons(context, "away")
    });
  }

  if (hasValue(s.homePoint) && hasValue(s.homePrice)) {
    candidates.push({
      marketFamily: "runline",
      candidateType: "home_rl",
      bestBet: `${context.homeTeam} ${formatSpread(s.homePoint)}`,
      bestBetType: "Run Line",
      oddsPrice: s.homePrice,
      fairProb: 0.5,
      impliedProb: americanToImpliedProb(s.homePrice),
      edgePct: round2((Number(context.modelOutputs.homeRunLineConfidence || 50) - 50) / 3.1),
      contextTilt: getContextTiltForCandidate("runline", "home", context),
      reasons: buildRunLineReasons(context, "home")
    });
  }
}

function addF5Candidates(candidates, context) {
  const moneyline = context.moneylineData;
  const total = context.totalData;
  const o = context.modelOutputs;

  if (hasValue(moneyline.awayPrice)) {
    candidates.push({
      marketFamily: "f5",
      candidateType: "away_f5_ml",
      bestBet: `${context.awayTeam} F5 ML`,
      bestBetType: "F5 Side",
      oddsPrice: moneyline.awayPrice,
      fairProb: (o.firstFiveAwayWinProb || 50) / 100,
      impliedProb: moneyline.awayImpliedProb,
      edgePct: round2(((o.firstFiveAwayWinProb || 50) / 100 - Number(moneyline.awayImpliedProb || 0.5)) * 100),
      contextTilt: getContextTiltForCandidate("f5", "away", context),
      reasons: buildF5SideReasons(context, "away")
    });
  }

  if (hasValue(moneyline.homePrice)) {
    candidates.push({
      marketFamily: "f5",
      candidateType: "home_f5_ml",
      bestBet: `${context.homeTeam} F5 ML`,
      bestBetType: "F5 Side",
      oddsPrice: moneyline.homePrice,
      fairProb: (o.firstFiveHomeWinProb || 50) / 100,
      impliedProb: moneyline.homeImpliedProb,
      edgePct: round2(((o.firstFiveHomeWinProb || 50) / 100 - Number(moneyline.homeImpliedProb || 0.5)) * 100),
      contextTilt: getContextTiltForCandidate("f5", "home", context),
      reasons: buildF5SideReasons(context, "home")
    });
  }

  if (hasValue(total.line)) {
    const f5Line = round2(Number(total.line) * 0.56);

    candidates.push({
      marketFamily: "f5",
      candidateType: "over_f5_total",
      bestBet: `Over ${f5Line} F5`,
      bestBetType: "F5 Total",
      oddsPrice: total.overPrice,
      fairProb: (o.firstFiveOverProb || 50) / 100,
      impliedProb: total.overImpliedProb,
      edgePct: round2(((o.firstFiveOverProb || 50) / 100 - Number(total.overImpliedProb || 0.5)) * 100),
      contextTilt: getContextTiltForCandidate("f5total", "over", context),
      reasons: buildF5TotalReasons(context, "over", f5Line)
    });

    candidates.push({
      marketFamily: "f5",
      candidateType: "under_f5_total",
      bestBet: `Under ${f5Line} F5`,
      bestBetType: "F5 Total",
      oddsPrice: total.underPrice,
      fairProb: (o.firstFiveUnderProb || 50) / 100,
      impliedProb: total.underImpliedProb,
      edgePct: round2(((o.firstFiveUnderProb || 50) / 100 - Number(total.underImpliedProb || 0.5)) * 100),
      contextTilt: getContextTiltForCandidate("f5total", "under", context),
      reasons: buildF5TotalReasons(context, "under", f5Line)
    });

    candidates.push({
      marketFamily: "f5",
      candidateType: "away_f5_rl",
      bestBet: `${context.awayTeam} +0.5 F5`,
      bestBetType: "F5 Run Line",
      oddsPrice: total.overPrice,
      fairProb: 0.5,
      impliedProb: total.overImpliedProb,
      edgePct: round2(((o.firstFiveAwayWinProb || 50) - 50) / 3.1),
      contextTilt: getContextTiltForCandidate("f5runline", "away", context),
      reasons: buildF5RunLineReasons(context, "away")
    });

    candidates.push({
      marketFamily: "f5",
      candidateType: "home_f5_rl",
      bestBet: `${context.homeTeam} -0.5 F5`,
      bestBetType: "F5 Run Line",
      oddsPrice: total.underPrice,
      fairProb: 0.5,
      impliedProb: total.underImpliedProb,
      edgePct: round2(((o.firstFiveHomeWinProb || 50) - 50) / 3.1),
      contextTilt: getContextTiltForCandidate("f5runline", "home", context),
      reasons: buildF5RunLineReasons(context, "home")
    });
  }
}

function addPropCandidates(candidates, context) {
  safeArray(context.propCandidates).forEach(prop => {
    candidates.push({
      marketFamily: "prop",
      candidateType: prop.marketKey,
      bestBet: prop.bestBet,
      bestBetType: "Prop",
      oddsPrice: prop.oddsPrice,
      fairProb: prop.fairProb,
      impliedProb: prop.impliedProb,
      edgePct: prop.edgePct,
      contextTilt: prop.contextTilt,
      propMeta: prop,
      reasons: safeArray(prop.reasons)
    });
  });
}

function getContextTiltForCandidate(marketFamily, side, context) {
  const sidePitch = Number(context.componentScores?.side?.startingPitcher || 0);
  const sideLineup = Number(context.componentScores?.side?.lineup || 0);
  const sideOffense = Number(context.componentScores?.side?.offenseVsHand || 0);
  const totalPark = Number(context.componentScores?.total?.parkFactor || 0);
  const totalLineup = Number(context.componentScores?.total?.lineupEnvironment || 0);
  const f5Pitch = Number(context.componentScores?.f5?.startingPitcher || 0);
  const f5Lineup = Number(context.componentScores?.f5?.lineup || 0);

  if (marketFamily === "side") {
    return round2(side === "home" ? (sidePitch + sideLineup + sideOffense) : -(sidePitch + sideLineup + sideOffense));
  }

  if (marketFamily === "runline") {
    return round2(side === "home" ? ((sidePitch + sideLineup) * 1.15) : -((sidePitch + sideLineup) * 1.15));
  }

  if (marketFamily === "total") {
    return round2(side === "over" ? (totalPark + totalLineup) : -(totalPark + totalLineup));
  }

  if (marketFamily === "f5") {
    if (side === "over") return round2(Number(context.componentScores?.f5?.runEnvironment || 0) + f5Lineup);
    if (side === "under") return round2(-(Number(context.componentScores?.f5?.runEnvironment || 0) + f5Lineup));
    return round2(side === "home" ? (f5Pitch + f5Lineup) : -(f5Pitch + f5Lineup));
  }

  if (marketFamily === "f5total") {
    return round2(side === "over"
      ? (Number(context.componentScores?.f5?.runEnvironment || 0) + f5Lineup)
      : -(Number(context.componentScores?.f5?.runEnvironment || 0) + f5Lineup));
  }

  if (marketFamily === "f5runline") {
    return round2(side === "home" ? ((f5Pitch + f5Lineup) * 1.1) : -((f5Pitch + f5Lineup) * 1.1));
  }

  return 0;
}

function buildSideReasons(context, side) {
  const reasons = [];
  const tilt = getContextTiltForCandidate("side", side, context);
  const lineupMode = context.lineupContext?.lineupMode || "projected";

  reasons.push(`Lineup mode used: ${lineupMode}.`);
  if ((side === "home" && Number(context.componentScores?.side?.lineup || 0) > 0) ||
      (side === "away" && Number(context.componentScores?.side?.lineup || 0) < 0)) {
    reasons.push("Confirmed or projected batting-order pressure favors this side.");
  }
  if ((side === "home" && Number(context.componentScores?.side?.startingPitcher || 0) >= 0) ||
      (side === "away" && Number(context.componentScores?.side?.startingPitcher || 0) <= 0)) {
    reasons.push("Probable-starter context leans this way.");
  }
  if (Math.abs(tilt) > 0.3) reasons.push("The broader game-context model agrees with the price angle.");
  return reasons;
}

function buildRunLineReasons(context, side) {
  const reasons = buildSideReasons(context, side);
  reasons.push("Run-line logic asks for a stronger contextual edge than moneyline.");
  return reasons;
}

function buildTotalReasons(context, side) {
  const reasons = [];
  const park = Number(context.componentScores?.total?.parkFactor || 0);
  const lineupEnv = Number(context.componentScores?.total?.lineupEnvironment || 0);
  reasons.push(`Lineup mode used: ${context.lineupContext?.lineupMode || "projected"}.`);
  if (side === "over") {
    if (park > 0) reasons.push("Park environment is hitter-friendly.");
    if (lineupEnv > 0) reasons.push("Lineup environment adds run-scoring pressure.");
  } else {
    if (park < 0) reasons.push("Park environment suppresses offense.");
    if (lineupEnv < 0.15) reasons.push("Run-environment signal does not demand an over.");
  }
  reasons.push("Both over and under are scored explicitly rather than using under as a fallback.");
  return reasons;
}

function buildF5SideReasons(context, side) {
  const reasons = [];
  reasons.push(`Lineup mode used: ${context.lineupContext?.lineupMode || "projected"}.`);
  reasons.push("F5 logic weights starting-pitcher context more heavily than full-game logic.");
  if ((side === "home" && Number(context.componentScores?.f5?.startingPitcher || 0) > 0) ||
      (side === "away" && Number(context.componentScores?.f5?.startingPitcher || 0) < 0)) {
    reasons.push("The probable-starter edge is meaningful in the first five innings.");
  }
  return reasons;
}

function buildF5TotalReasons(context, side, line) {
  const reasons = [];
  reasons.push(`Derived F5 total line: ${line}.`);
  reasons.push("F5 totals emphasize starter quality and the top of each batting order.");
  if (side === "under") reasons.push("Starter-driven run suppression supports the under.");
  if (side === "over") reasons.push("Early-inning run environment supports the over.");
  return reasons;
}

function buildF5RunLineReasons(context, side) {
  const reasons = buildF5SideReasons(context, side);
  reasons.push("F5 run-line scoring requires the early-game edge to be sustained beyond a pure pick'em view.");
  return reasons;
}
function getPriceDisciplineBonus(price) {
  const n = Number(price);
  if (!isFinite(n)) return 0;
  if (n >= -125 && n <= 140) return 0.7;
  if (n >= -145 && n <= 165) return 0.45;
  if (n < -175) return -0.25;
  return 0.15;
}

function getMissingDataPenalty(componentScores) {
  let penalty = 0;
  if (componentScores?.liveFeedStatus?.marketContext !== "live") penalty += 0.25;
  if (componentScores?.liveFeedStatus?.totals !== "live") penalty += 0.18;
  if (componentScores?.liveFeedStatus?.bullpen === "placeholder") penalty += 0.08;
  if (componentScores?.liveFeedStatus?.scheduleTravel === "placeholder") penalty += 0.08;
  return penalty;
}

function getDataCompleteness(componentScores, lineupContext) {
  let score = 0;
  if (lineupContext?.officialLineupAvailable) score += 26;
  else if (lineupContext?.projectedLineupUsed) score += 10;

  if (Math.abs(Number(componentScores?.side?.startingPitcher || 0)) > 0.05) score += 20;
  if (Math.abs(Number(componentScores?.side?.lineup || 0)) > 0.05) score += 16;
  if (Math.abs(Number(componentScores?.total?.parkFactor || 0)) > 0.05) score += 14;
  if (componentScores?.liveFeedStatus?.marketContext === "live") score += 16;
  if (componentScores?.liveFeedStatus?.totals === "live") score += 8;

  return Math.min(score, 100);
}

function getValueScore(candidate) {
  const edge = Math.abs(Number(candidate.edgePct || 0));
  const juiceBonus = getPriceDisciplineBonus(candidate.oddsPrice);
  const fairProbBonus = candidate.fairProb != null && candidate.impliedProb != null
    ? Math.max(0, (Number(candidate.fairProb) - Number(candidate.impliedProb)) * 12)
    : 0;
  return round2((edge * 1.08) + juiceBonus + fairProbBonus);
}

function getCandidateParkTilt(candidate, parkFactor) {
  const pf = Number(parkFactor || 1);
  const delta = (pf - 1) * 4.2;
  if (candidate.marketFamily === "total" && /^Over /.test(candidate.bestBet)) return delta;
  if (candidate.marketFamily === "total" && /^Under /.test(candidate.bestBet)) return -delta;
  if (candidate.marketFamily === "prop" && /Home Runs|Total Bases|Hits/.test(candidate.bestBet || "")) return delta * 0.6;
  return 0;
}

function getMarketShapeBonus(candidate, context) {
  if (candidate.marketFamily === "prop") {
    return Math.abs(Number(candidate.contextTilt || 0)) * 1.2;
  }

  if (candidate.marketFamily === "f5") {
    return Math.abs(Number(context.componentScores?.f5?.startingPitcher || 0)) * 0.9;
  }

  if (candidate.marketFamily === "runline") {
    return Math.abs(Number(candidate.contextTilt || 0)) * 0.4;
  }

  return Math.abs(Number(candidate.contextTilt || 0)) * 0.25;
}

function getContextScore(candidate, context) {
  const lineupBonus = context.lineupContext?.officialLineupAvailable ? 0.85 : -0.25;
  const parkTilt = getCandidateParkTilt(candidate, context.parkFactor || 1.0);
  const starterKnownBonus =
    context.probablePitchers.away !== "TBD" && context.probablePitchers.home !== "TBD"
      ? 0.45
      : 0;
  const marketShapeBonus = getMarketShapeBonus(candidate, context);
  const missingDataPenalty = getMissingDataPenalty(context.componentScores);
  return round2(lineupBonus + parkTilt + starterKnownBonus + marketShapeBonus - missingDataPenalty);
}

function getThresholdsForBetType(bestBetType, marketFamily, candidateType) {
  const key = marketFamily === "prop" ? "prop" : (bestBetType || "Other");

  switch (key) {
    case "Side":
      return { high: 9.5, medium: 5.6, minEdgeHigh: 2.5, minEdgeMedium: 1.0 };
    case "Total":
      return { high: 9.3, medium: 5.4, minEdgeHigh: 2.3, minEdgeMedium: 1.0 };
    case "Run Line":
      return { high: 10.1, medium: 5.8, minEdgeHigh: 2.9, minEdgeMedium: 1.3 };
    case "F5 Side":
      return { high: 9.4, medium: 5.4, minEdgeHigh: 2.4, minEdgeMedium: 1.0 };
    case "F5 Total":
      return { high: 9.1, medium: 5.3, minEdgeHigh: 2.2, minEdgeMedium: 1.0 };
    case "F5 Run Line":
      return { high: 9.8, medium: 5.7, minEdgeHigh: 2.7, minEdgeMedium: 1.2 };
    case "prop":
      return /Home Runs/.test(candidateType || "")
        ? { high: 10.8, medium: 6.0, minEdgeHigh: 3.2, minEdgeMedium: 1.5 }
        : { high: 9.7, medium: 5.6, minEdgeHigh: 2.5, minEdgeMedium: 1.2 };
    default:
      return { high: 9.7, medium: 5.6, minEdgeHigh: 2.5, minEdgeMedium: 1.1 };
  }
}

function determineConfidenceTier(finalScore, thresholds, candidate, context) {
  const edge = Math.abs(Number(candidate?.edgePct || 0));
  const completeness = Number(candidate?.dataCompleteness || 0);
  const lineupOfficial = !!context?.lineupContext?.officialLineupAvailable;

  if (
    finalScore >= thresholds.high &&
    edge >= thresholds.minEdgeHigh &&
    completeness >= 42 &&
    (lineupOfficial || finalScore >= (thresholds.high + 0.6))
  ) {
    return "High";
  }

  if (finalScore >= thresholds.medium && edge >= thresholds.minEdgeMedium) {
    return "Medium";
  }

  return "Low";
}

function recommendStakeUnits(finalScore, confidence) {
  if (confidence === "High") return finalScore >= 10.8 ? 1.5 : 1.0;
  if (confidence === "Medium") return 0.75;
  return 0.5;
}

function getRecommendedTiming(candidate, context) {
  if (candidate.marketFamily === "prop" && !context.lineupContext?.officialLineupAvailable) return "Wait for lineups";
  if (candidate.marketFamily === "f5") return "Before first pitch";
  return "Current price playable";
}

function scoreCandidates(context, candidates) {
  return safeArray(candidates).map(candidate => {
    const valueScore = getValueScore(candidate);
    const contextScore = getContextScore(candidate, context);
    const dataCompleteness = getDataCompleteness(context.componentScores, context.lineupContext);
    const finalScore = round2(valueScore + contextScore + (dataCompleteness / 14.5));
    const thresholds = getThresholdsForBetType(candidate.bestBetType, candidate.marketFamily, candidate.bestBet);
    const confidence = determineConfidenceTier(finalScore, thresholds, candidate, context);

    return Object.assign({}, candidate, {
      valueScore,
      contextScore,
      dataCompleteness,
      finalScore,
      confidence,
      confidenceScore: finalScore,
      recommendedTiming: getRecommendedTiming(candidate, context),
      recommendedStakeUnits: recommendStakeUnits(finalScore, confidence)
    });
  });
}

function applyPerGameRanking(candidates) {
  return safeArray(candidates)
    .slice()
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return Math.abs(Number(b.edgePct || 0)) - Math.abs(Number(a.edgePct || 0));
    })
    .map((candidate, idx) => Object.assign({}, candidate, { slateRank: idx + 1 }));
}

function filterCandidatesForView(candidates, viewMode) {
  if (viewMode === "props") return safeArray(candidates).filter(c => c.marketFamily === "prop");
  if (viewMode === "f5") return safeArray(candidates).filter(c => c.marketFamily === "f5");
  return safeArray(candidates).filter(c => c.marketFamily !== "f5" && c.marketFamily !== "prop");
}

function chooseBestCandidate(filteredForView, rankedCandidates, viewMode) {
  const pool = safeArray(filteredForView);
  if (pool.length) return pool[0];

  return {
    bestBet: viewMode === "props" ? "Pass" : "Pass",
    bestBetType: viewMode === "props" ? "Prop" : (viewMode === "f5" ? "F5 Side" : "Side"),
    oddsPrice: null,
    confidence: "Low",
    confidenceScore: 0,
    recommendedTiming: "No playable edge",
    recommendedStakeUnits: 0,
    reasons: ["No qualified candidate surfaced for this view."],
    marketFamily: viewMode === "props" ? "prop" : (viewMode === "f5" ? "f5" : "side"),
    edgePct: 0,
    valueScore: 0,
    contextScore: 0,
    dataCompleteness: 0,
    finalScore: 0,
    slateRank: 999
  };
}

function chooseTopPropCandidate(rankedCandidates) {
  return safeArray(rankedCandidates).find(c => c.marketFamily === "prop") || null;
}

function buildRiskWarnings(componentScores, bestCandidate, rankedCandidates, viewMode) {
  const warnings = [];

  if (componentScores?.liveFeedStatus?.marketContext !== "live") {
    warnings.push("Some market data was incomplete during scoring.");
  }
  if (!safeArray(rankedCandidates).length) {
    warnings.push("No candidates were generated for this game.");
  }
  if (bestCandidate?.marketFamily === "prop" && !/official/i.test(String(bestCandidate.recommendedTiming || "")) && !/Wait for lineups/i.test(String(bestCandidate.recommendedTiming || ""))) {
    // intentionally no-op
  }
  if (viewMode === "props" && bestCandidate?.bestBet === "Pass") {
    warnings.push("Props mode did not surface a playable prop for this game.");
  }
  if (!componentScores?.teamContext) {
    warnings.push("Lineup context was limited.");
  }

  return warnings;
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported prop returned.";
  const reasonBits = safeArray(topProp.reasons).slice(0, 2);
  if (lineupContext?.officialLineupAvailable) reasonBits.unshift("Official lineup context was available.");
  return reasonBits.join(" ");
}

function buildGamePayload({
  index,
  originalGame,
  viewMode,
  awayTeam,
  homeTeam,
  moneylineData,
  spreadData,
  totalData,
  bestCandidate,
  topPropCandidate,
  propResult,
  componentScores,
  modelOutputs,
  lineupContext,
  probablePitchers,
  riskWarnings,
  scoredCandidates,
  parkFactor
}) {
  const best = bestCandidate || {};
  const topProp = topPropCandidate
    ? {
        bestBet: topPropCandidate.bestBet,
        bestBetType: topPropCandidate.bestBetType,
        oddsPrice: topPropCandidate.oddsPrice,
        confidence: topPropCandidate.confidence,
        confidenceScore: topPropCandidate.confidenceScore
      }
    : null;

  return {
    id: originalGame?.id || `game-${index}`,
    eventId: originalGame?.id || "",
    rawCommenceTime: originalGame?.commence_time || null,
    time: formatGameDateTimeEt(originalGame?.commence_time),
    away: awayTeam,
    home: homeTeam,
    probablePitchers,

    viewMode,

    moneyline: moneylineData.display,
    runLine: spreadData.display,
    total: totalData.display,
    firstFiveMoneyline: `${awayTeam} ${formatOdds(moneylineData.awayPrice)} / ${homeTeam} ${formatOdds(moneylineData.homePrice)}`,
    firstFiveRunLine: `${awayTeam} +0.5 ${formatOdds(totalData.overPrice)} / ${homeTeam} -0.5 ${formatOdds(totalData.underPrice)}`,
    firstFiveTotal: `O/U ${hasValue(totalData.line) ? round2(Number(totalData.line) * 0.56) : "—"} (Over ${formatOdds(totalData.overPrice)} / Under ${formatOdds(totalData.underPrice)})`,

    fairMlAway: modelOutputs.fairMlAway,
    fairMlHome: modelOutputs.fairMlHome,
    fairTotal: modelOutputs.fairTotal,

    awayWinProb: modelOutputs.awayWinProb,
    homeWinProb: modelOutputs.homeWinProb,
    awayEdgePct: modelOutputs.awayEdgePct,
    homeEdgePct: modelOutputs.homeEdgePct,
    overEdgePct: modelOutputs.overEdgePct,
    underEdgePct: modelOutputs.underEdgePct,

    moneylineConfidence: {
      away: modelOutputs.awayWinProb,
      home: modelOutputs.homeWinProb
    },
    totalConfidence: {
      over: modelOutputs.overConfidence,
      under: modelOutputs.underConfidence
    },
    runLineConfidence: {
      away: modelOutputs.awayRunLineConfidence,
      home: modelOutputs.homeRunLineConfidence
    },
    firstFiveMoneylineConfidence: {
      away: modelOutputs.firstFiveAwayWinProb,
      home: modelOutputs.firstFiveHomeWinProb
    },
    firstFiveTotalConfidence: {
      over: modelOutputs.firstFiveOverProb,
      under: modelOutputs.firstFiveUnderProb
    },
    firstFiveRunLineConfidence: {
      away: round2(clamp(50 + ((modelOutputs.firstFiveAwayWinProb - 50) * 0.85), 35, 76)),
      home: round2(clamp(50 + ((modelOutputs.firstFiveHomeWinProb - 50) * 0.85), 35, 76))
    },

    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource,
    officialLineupAvailable: lineupContext.officialLineupAvailable,
    projectedLineupUsed: lineupContext.projectedLineupUsed,
    projectedLineups: lineupContext.projectedLineups,
    officialLineups: lineupContext.officialLineups,

    bestBet: best.bestBet || "Pass",
    bestBetType: best.bestBetType || "Side",
    bestBetOdds: hasValue(best.oddsPrice) ? Number(best.oddsPrice) : null,
    confidence: best.confidence || "Low",
    confidenceScore: hasValue(best.confidenceScore) ? best.confidenceScore : 0,
    recommendedTiming: best.recommendedTiming || "No playable edge",
    recommendedStakeUnits: hasValue(best.recommendedStakeUnits) ? best.recommendedStakeUnits : 0,
    reasons: safeArray(best.reasons),

    topPropOverall: topProp,
    topPropOverallReason: topProp
      ? buildTopPropOverallReason(topPropCandidate, lineupContext)
      : propResult.status,
    propStatus: propResult.status,

    componentScores,
    riskWarnings,
    parkFactor,
    debug: {
      topCandidates: safeArray(scoredCandidates).slice(0, 7).map(c => ({
        bestBet: c.bestBet,
        bestBetType: c.bestBetType,
        marketFamily: c.marketFamily,
        edgePct: c.edgePct,
        valueScore: c.valueScore,
        contextScore: c.contextScore,
        dataCompleteness: c.dataCompleteness,
        finalScore: c.finalScore,
        confidence: c.confidence,
        slateRank: c.slateRank
      })),
      lineupDiagnostics: lineupContext.lineupDebug,
      dataAvailability: {
        officialLineupAvailable: lineupContext.officialLineupAvailable,
        hitterPropGenerated: safeArray(scoredCandidates).some(c => c.marketFamily === "prop" && /Hits|Total Bases|Home Runs/.test(c.bestBet || "")),
        underGenerated: safeArray(scoredCandidates).some(c => c.bestBetType === "Total" && /^Under /.test(c.bestBet || "")),
        f5Generated: safeArray(scoredCandidates).some(c => c.marketFamily === "f5")
      }
    }
  };
}

async function fetchPropCandidatesForEventCached(eventId, apiKey, contextBits) {
  const cacheKey = String(eventId);
  const cached = PROP_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PROP_CACHE_TTL_MS) return cached.value;

  const value = await fetchPropCandidatesForEvent(eventId, apiKey, contextBits);
  PROP_CACHE.set(cacheKey, { ts: Date.now(), value });
  return value;
}

async function fetchPropCandidatesForEvent(eventId, apiKey, contextBits) {
  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&bookmakers=betmgm` +
    `&oddsFormat=american` +
    `&markets=${encodeURIComponent(SUPPORTED_PROP_MARKETS.join(","))}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        candidates: [],
        topProp: null,
        status: "No supported BetMGM prop returned.",
        lineupMode: contextBits.lineupContext?.lineupMode || "projected",
        lineupSource: contextBits.lineupContext?.lineupSource || "unknown"
      };
    }

    const data = await res.json();
    const bookmaker = safeArray(data?.bookmakers)[0];
    const markets = safeArray(bookmaker?.markets);

    const candidates = [];
    markets.forEach(market => {
      const key = String(market?.key || "");
      if (!SUPPORTED_PROP_MARKETS.includes(key)) return;

      const groups = groupPropOutcomesByDescription(safeArray(market?.outcomes));
      Object.keys(groups).forEach(desc => {
        const pair = groups[desc];
        const candidate = buildPropCandidateFromPair(key, desc, pair, contextBits);
        if (candidate) candidates.push(candidate);
      });
    });

    const ranked = candidates
      .slice()
      .sort((a, b) => {
        if (Math.abs(Number(b.edgePct || 0)) !== Math.abs(Number(a.edgePct || 0))) {
          return Math.abs(Number(b.edgePct || 0)) - Math.abs(Number(a.edgePct || 0));
        }
        return Number(b.contextTilt || 0) - Number(a.contextTilt || 0);
      });

    return {
      candidates: ranked,
      topProp: ranked[0] || null,
      status: ranked.length ? "Supported prop candidates returned." : "No supported BetMGM prop returned.",
      lineupMode: contextBits.lineupContext?.lineupMode || "projected",
      lineupSource: contextBits.lineupContext?.lineupSource || "unknown"
    };
  } catch (e) {
    return {
      candidates: [],
      topProp: null,
      status: "No supported BetMGM prop returned.",
      lineupMode: contextBits.lineupContext?.lineupMode || "projected",
      lineupSource: contextBits.lineupContext?.lineupSource || "unknown"
    };
  }
}

function groupPropOutcomesByDescription(outcomes) {
  const map = {};
  safeArray(outcomes).forEach(outcome => {
    const desc = String(outcome?.description || outcome?.name || "").trim();
    if (!desc) return;
    if (!map[desc]) map[desc] = [];
    map[desc].push(outcome);
  });
  return map;
}

function buildPropCandidateFromPair(marketKey, description, outcomes, contextBits) {
  const overOutcome = safeArray(outcomes).find(o => String(o.name || "").toLowerCase() === "over");
  const underOutcome = safeArray(outcomes).find(o => String(o.name