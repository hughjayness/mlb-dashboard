const PROP_CACHE_TTL_MS = 60 * 1000;
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

module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const requestedView = String((req && req.query && req.query.view) || "full").toLowerCase();
  const viewMode = requestedView === "props" ? "props" : (requestedView === "f5" ? "f5" : "full");
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const shouldLoadProps = viewMode === "props";
  const propsGameLimit = 5;
  const fullGameLimit = 10;

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

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = normalizeTeamName(game.home_team || "Home");
        const awayTeam = normalizeTeamName(game.away_team || "Away");

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
          propResult = await fetchPropCandidatesForEventCached(game.id, apiKey, lineupContext);
        }

        const componentScores = buildComponentScores({
          moneylineData,
          totalData,
          lineupContext,
          parkFactor,
          probablePitchers
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
          moneylineData,
          totalData,
          parkFactor
        });

        const context = {
          viewMode,
          gameId: game.id,
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
        "Official lineup composition is used when a full matchup is successfully parsed.",
        "Debug diagnostics now include lineup matching and lineup counts.",
        shouldLoadProps
          ? "Props mode evaluates hitter and pitcher props directly."
          : "Props are skipped outside props mode to reduce rate-limit pressure."
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

async function buildScheduleCache(games) {
  const uniqueDates = new Set();
  (Array.isArray(games) ? games : []).forEach(game => {
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

function getGameDateEt(rawIso) {
  if (!rawIso) return null;
  try {
    return new Date(rawIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch (e) {
    return null;
  }
}

async function fetchScheduleForDate(dateEt) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(dateEt)}`;
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
  if (cached && (Date.now() - cached.ts) < 6 * 60 * 60 * 1000) return cached.value;

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

function getParkFactor(homeTeam) {
  return HITTER_PARK_FACTORS[normalizeTeamName(homeTeam)] || 1.0;
}

async function fetchOfficialLineupsFromMLB() {
  const url = "https://www.mlb.com/starting-lineups";

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" }
    });

    if (!response.ok) return {};

    const html = await response.text();
    return parseMLBStartingLineups(html);
  } catch (error) {
    return {};
  }
}

function parseMLBStartingLineups(html) {
  const map = {};

  const cleaned = String(html || "")
    .replace(/\r/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n");

  const lines = cleaned.split("\n").map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "@") continue;

    if (i + 2 < lines.length && lines[i + 1] === "@") {
      const away = normalizeTeamName(lines[i]);
      const home = normalizeTeamName(lines[i + 2]);
      const key = matchupKey(away, home);
      const block = lines.slice(i, Math.min(i + 320, lines.length));

      const lineupGroups = extractTeamLineupGroups(block, away, home);
      const awayPlayers = firstValidLineup(lineupGroups.away);
      const homePlayers = firstValidLineup(lineupGroups.home);

      map[key] = {
        awayTeam: away,
        homeTeam: home,
        awayPlayers,
        homePlayers,
        awayCount: awayPlayers.length,
        homeCount: homePlayers.length
      };
    }
  }

  return map;
}

function extractTeamLineupGroups(block, awayTeam, homeTeam) {
  const result = { away: [], home: [] };

  for (let i = 0; i < block.length; i++) {
    const line = block[i];

    if (
      line === `${teamAbbrevHint(awayTeam)} Lineup` ||
      line === `${awayTeam} Lineup` ||
      line === `${stripTeamCity(awayTeam)} Lineup`
    ) {
      result.away.push(extractOneLineup(block, i + 1));
    }

    if (
      line === `${teamAbbrevHint(homeTeam)} Lineup` ||
      line === `${homeTeam} Lineup` ||
      line === `${stripTeamCity(homeTeam)} Lineup`
    ) {
      result.home.push(extractOneLineup(block, i + 1));
    }
  }

  return result;
}

function extractOneLineup(block, startIndex) {
  const players = [];

  for (let i = startIndex; i < block.length; i++) {
    const line = block[i];

    if (/Lineup$/.test(line) && players.length > 0) break;
    if (/^Gameday/.test(line) && players.length > 0) break;
    if (/^\d+\.\s+TBD$/i.test(line)) return [];

    const fullNameMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]+$/);
    if (fullNameMatch) {
      players.push({
        lineupIndex: Number(fullNameMatch[1]),
        name: sanitizePlayerName(fullNameMatch[2]),
        bats: fullNameMatch[3].toUpperCase()
      });
      continue;
    }

    const shortNameMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z]{1,3}$/);
    if (shortNameMatch) {
      players.push({
        lineupIndex: Number(shortNameMatch[1]),
        name: sanitizePlayerName(shortNameMatch[2]),
        bats: shortNameMatch[3].toUpperCase()
      });
      continue;
    }

    const noPosMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)$/);
    if (noPosMatch) {
      players.push({
        lineupIndex: Number(noPosMatch[1]),
        name: sanitizePlayerName(noPosMatch[2]),
        bats: noPosMatch[3].toUpperCase()
      });
      continue;
    }

    const looserMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)/);
    if (looserMatch) {
      players.push({
        lineupIndex: Number(looserMatch[1]),
        name: sanitizePlayerName(looserMatch[2]),
        bats: looserMatch[3].toUpperCase()
      });
      continue;
    }

    if (players.length >= 9) break;
  }

  return dedupeAndSortLineup(players);
}

function dedupeAndSortLineup(players) {
  const map = new Map();
  for (const p of players) {
    const key = `${Number(p.lineupIndex || 0)}|${normalizeName(p.name)}`;
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values())
    .sort((a, b) => Number(a.lineupIndex || 99) - Number(b.lineupIndex || 99))
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

function sanitizePlayerName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\-$/, "")
    .trim();
}

function stripTeamCity(teamName) {
  const parts = String(teamName || "").trim().split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : teamName;
}
const PROP_CACHE_TTL_MS = 60 * 1000;
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

module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const requestedView = String((req && req.query && req.query.view) || "full").toLowerCase();
  const viewMode = requestedView === "props" ? "props" : (requestedView === "f5" ? "f5" : "full");
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const shouldLoadProps = viewMode === "props";
  const propsGameLimit = 5;
  const fullGameLimit = 10;

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

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = normalizeTeamName(game.home_team || "Home");
        const awayTeam = normalizeTeamName(game.away_team || "Away");

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
          propResult = await fetchPropCandidatesForEventCached(game.id, apiKey, lineupContext);
        }

        const componentScores = buildComponentScores({
          moneylineData,
          totalData,
          lineupContext,
          parkFactor,
          probablePitchers
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
          moneylineData,
          totalData,
          parkFactor
        });

        const context = {
          viewMode,
          gameId: game.id,
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
        "Official lineup composition is used when a full matchup is successfully parsed.",
        "Debug diagnostics now include lineup matching and lineup counts.",
        shouldLoadProps
          ? "Props mode evaluates hitter and pitcher props directly."
          : "Props are skipped outside props mode to reduce rate-limit pressure."
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

async function buildScheduleCache(games) {
  const uniqueDates = new Set();
  (Array.isArray(games) ? games : []).forEach(game => {
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

function getGameDateEt(rawIso) {
  if (!rawIso) return null;
  try {
    return new Date(rawIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch (e) {
    return null;
  }
}

async function fetchScheduleForDate(dateEt) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(dateEt)}`;
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
  if (cached && (Date.now() - cached.ts) < 6 * 60 * 60 * 1000) return cached.value;

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

function getParkFactor(homeTeam) {
  return HITTER_PARK_FACTORS[normalizeTeamName(homeTeam)] || 1.0;
}

async function fetchOfficialLineupsFromMLB() {
  const url = "https://www.mlb.com/starting-lineups";

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" }
    });

    if (!response.ok) return {};

    const html = await response.text();
    return parseMLBStartingLineups(html);
  } catch (error) {
    return {};
  }
}

function parseMLBStartingLineups(html) {
  const map = {};

  const cleaned = String(html || "")
    .replace(/\r/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n");

  const lines = cleaned.split("\n").map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "@") continue;

    if (i + 2 < lines.length && lines[i + 1] === "@") {
      const away = normalizeTeamName(lines[i]);
      const home = normalizeTeamName(lines[i + 2]);
      const key = matchupKey(away, home);
      const block = lines.slice(i, Math.min(i + 320, lines.length));

      const lineupGroups = extractTeamLineupGroups(block, away, home);
      const awayPlayers = firstValidLineup(lineupGroups.away);
      const homePlayers = firstValidLineup(lineupGroups.home);

      map[key] = {
        awayTeam: away,
        homeTeam: home,
        awayPlayers,
        homePlayers,
        awayCount: awayPlayers.length,
        homeCount: homePlayers.length
      };
    }
  }

  return map;
}

function extractTeamLineupGroups(block, awayTeam, homeTeam) {
  const result = { away: [], home: [] };

  for (let i = 0; i < block.length; i++) {
    const line = block[i];

    if (
      line === `${teamAbbrevHint(awayTeam)} Lineup` ||
      line === `${awayTeam} Lineup` ||
      line === `${stripTeamCity(awayTeam)} Lineup`
    ) {
      result.away.push(extractOneLineup(block, i + 1));
    }

    if (
      line === `${teamAbbrevHint(homeTeam)} Lineup` ||
      line === `${homeTeam} Lineup` ||
      line === `${stripTeamCity(homeTeam)} Lineup`
    ) {
      result.home.push(extractOneLineup(block, i + 1));
    }
  }

  return result;
}

function extractOneLineup(block, startIndex) {
  const players = [];

  for (let i = startIndex; i < block.length; i++) {
    const line = block[i];

    if (/Lineup$/.test(line) && players.length > 0) break;
    if (/^Gameday/.test(line) && players.length > 0) break;
    if (/^\d+\.\s+TBD$/i.test(line)) return [];

    const fullNameMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]+$/);
    if (fullNameMatch) {
      players.push({
        lineupIndex: Number(fullNameMatch[1]),
        name: sanitizePlayerName(fullNameMatch[2]),
        bats: fullNameMatch[3].toUpperCase()
      });
      continue;
    }

    const shortNameMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z]{1,3}$/);
    if (shortNameMatch) {
      players.push({
        lineupIndex: Number(shortNameMatch[1]),
        name: sanitizePlayerName(shortNameMatch[2]),
        bats: shortNameMatch[3].toUpperCase()
      });
      continue;
    }

    const noPosMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)$/);
    if (noPosMatch) {
      players.push({
        lineupIndex: Number(noPosMatch[1]),
        name: sanitizePlayerName(noPosMatch[2]),
        bats: noPosMatch[3].toUpperCase()
      });
      continue;
    }

    const looserMatch = line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)/);
    if (looserMatch) {
      players.push({
        lineupIndex: Number(looserMatch[1]),
        name: sanitizePlayerName(looserMatch[2]),
        bats: looserMatch[3].toUpperCase()
      });
      continue;
    }

    if (players.length >= 9) break;
  }

  return dedupeAndSortLineup(players);
}

function dedupeAndSortLineup(players) {
  const map = new Map();
  for (const p of players) {
    const key = `${Number(p.lineupIndex || 0)}|${normalizeName(p.name)}`;
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values())
    .sort((a, b) => Number(a.lineupIndex || 99) - Number(b.lineupIndex || 99))
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

function sanitizePlayerName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\-$/, "")
    .trim();
}

function stripTeamCity(teamName) {
  const parts = String(teamName || "").trim().split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : teamName;
}
function filterCandidatesForView(candidates, viewMode) {
  const arr = Array.isArray(candidates) ? candidates : [];
  if (viewMode === "props") return arr.filter(c => c.marketFamily === "prop");
  if (viewMode === "f5") return arr.filter(c => c.marketFamily === "f5");
  return arr.filter(c => c.marketFamily === "full");
}

function chooseBestCandidate(filteredForView, allCandidates, viewMode) {
  const filtered = Array.isArray(filteredForView) ? filteredForView : [];

  if (viewMode === "f5" || viewMode === "props") {
    return filtered.length ? filtered[0] : null;
  }

  const fallback = Array.isArray(allCandidates) ? allCandidates : [];
  return filtered.length ? filtered[0] : (fallback.length ? fallback[0] : null);
}

function chooseTopPropCandidate(candidates) {
  return (Array.isArray(candidates) ? candidates : []).find(c => c.marketFamily === "prop") || null;
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
  const best = bestCandidate || {
    bestBet: "Pass",
    bestBetType: "Pass",
    oddsPrice: null,
    confidence: "Low",
    confidenceScore: 0,
    reasons: ["No candidate cleared the current thresholds."],
    recommendedTiming: "Pass",
    recommendedStakeUnits: 0
  };

  const topProp = topPropCandidate ? convertCandidateToTopProp(topPropCandidate, lineupContext) : propResult.topProp || null;

  return {
    id: String(index + 1),
    eventId: originalGame.id,
    rawCommenceTime: originalGame.commence_time || null,
    time: originalGame.commence_time
      ? (() => {
          const t = new Date(originalGame.commence_time).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York"
          });
          return t + " ET";
        })()
      : "TBD",
    away: awayTeam,
    home: homeTeam,
    probablePitchers,
    viewMode,

    moneyline: moneylineData.display,
    runLine: spreadData.display,
    total: totalData.display,
    firstFiveMoneyline: "N/A",
    firstFiveRunLine: "N/A",
    firstFiveTotal: "N/A",

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
    firstFiveMoneylineConfidence: { away: null, home: null },
    firstFiveTotalConfidence: { over: null, under: null },
    firstFiveRunLineConfidence: { away: null, home: null },

    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource,
    officialLineupAvailable: lineupContext.officialLineupAvailable,
    projectedLineupUsed: lineupContext.projectedLineupUsed,
    projectedLineups: lineupContext.projectedLineups,
    officialLineups: lineupContext.officialLineups,

    bestBet: best.bestBet,
    bestBetType: best.bestBetType,
    bestBetOdds: best.oddsPrice,
    confidence: best.confidence,
    confidenceScore: best.confidenceScore,
    recommendedTiming: best.recommendedTiming,
    recommendedStakeUnits: best.recommendedStakeUnits,
    reasons: best.reasons,

    topPropOverall: topProp,
    topPropOverallReason: topProp
      ? buildTopPropOverallReason(topProp, lineupContext)
      : propResult.status,
    propStatus: propResult.status,

    componentScores,
    riskWarnings,
    parkFactor,
    debug: {
      topCandidates: scoredCandidates.slice(0, 7).map(c => ({
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
        hitterPropGenerated: scoredCandidates.some(c => c.marketFamily === "prop" && /Hits|Total Bases|Home Runs/.test(c.bestBet)),
        underGenerated: scoredCandidates.some(c => c.bestBetType === "Total" && /^Under /.test(c.bestBet))
      }
    }
  };
}

function getValueScore(candidate) {
  const edge = Math.abs(Number(candidate.edgePct || 0));
  const juiceBonus = getPriceDisciplineBonus(candidate.oddsPrice);
  const fairProbBonus = candidate.fairProb != null && candidate.impliedProb != null
    ? Math.max(0, (candidate.fairProb - candidate.impliedProb) * 0.06)
    : 0;
  return round2((edge * 1.08) + juiceBonus + fairProbBonus);
}

function getContextScore(candidate, context) {
  const lineupBonus = context.lineupContext.officialLineupAvailable ? 0.85 : -0.25;
  const parkTilt = getCandidateParkTilt(candidate, context.parkFactor || 1.0);
  const starterKnownBonus =
    context.probablePitchers.away !== "TBD" && context.probablePitchers.home !== "TBD"
      ? 0.45
      : 0;
  const marketShapeBonus = getMarketShapeBonus(candidate, context);
  const missingDataPenalty = getMissingDataPenalty(context.componentScores);
  return round2(lineupBonus + parkTilt + starterKnownBonus + marketShapeBonus - missingDataPenalty);
}

function getMissingDataPenalty(componentScores) {
  let penalty = 0;
  if (componentScores?.liveFeedStatus?.bullpen !== "live") penalty += 0.25;
  if (componentScores?.liveFeedStatus?.scheduleTravel !== "live") penalty += 0.18;
  if (componentScores?.liveFeedStatus?.defense === "placeholder") penalty += 0.08;
  return penalty;
}

function getCandidateParkTilt(candidate, parkFactor) {
  if (candidate.marketFamily === "prop") {
    if (/Home Runs|Total Bases|Hits/.test(candidate.bestBet)) {
      if (/ Over /.test(candidate.bestBet)) return round2((parkFactor - 1) * 4.0);
      if (/ Under /.test(candidate.bestBet)) return round2((1 - parkFactor) * 4.0);
    }
    return 0;
  }

  if (candidate.bestBetType === "Total") {
    if (/^Over /.test(candidate.bestBet)) return round2((parkFactor - 1) * 4.8);
    if (/^Under /.test(candidate.bestBet)) return round2((1 - parkFactor) * 4.8);
  }

  return 0;
}

function getMarketShapeBonus(candidate, context) {
  if (candidate.bestBetType === "Side") {
    return Math.abs(context.modelOutputs.sideComposite || 0) * 1.5;
  }

  if (candidate.bestBetType === "Total") {
    if (/^Under /.test(candidate.bestBet)) {
      const lowTotalBonus = context.totalData.point != null && context.totalData.point <= 8 ? 0.8 : 0.15;
      return (Math.abs(context.modelOutputs.totalComposite || 0) * 1.4) + lowTotalBonus;
    }
    return Math.abs(context.modelOutputs.totalComposite || 0) * 1.4;
  }

  if (candidate.bestBetType === "Run Line") {
    return Math.abs(context.modelOutputs.sideComposite || 0) * 1.0;
  }

  if (candidate.marketFamily === "prop") {
    return Math.abs(candidate.contextTilt || 0) * 1.2;
  }

  return 0;
}

function getDataCompleteness(componentScores, lineupContext) {
  let score = 0;
  if (lineupContext?.officialLineupAvailable) score += 25;
  if (componentScores?.side?.startingPitcher && Math.abs(componentScores.side.startingPitcher) > 0.05) score += 20;
  if (componentScores?.side?.lineup && Math.abs(componentScores.side.lineup) > 0.05) score += 15;
  if (componentScores?.total?.parkFactor && Math.abs(componentScores.total.parkFactor) > 0.05) score += 15;
  if (componentScores?.liveFeedStatus?.marketContext === "live") score += 20;
  return Math.min(score, 100);
}

function getThresholdsForBetType(bestBetType, marketFamily, candidateType) {
  const key = marketFamily === "prop" ? "prop" : (bestBetType || "Other");

  switch (key) {
    case "Side":
      return { high: 9.6, medium: 5.6, minEdgeHigh: 2.6, minEdgeMedium: 1.0 };
    case "Total":
      return { high: 9.4, medium: 5.5, minEdgeHigh: 2.4, minEdgeMedium: 1.0 };
    case "Run Line":
      return { high: 10.3, medium: 5.9, minEdgeHigh: 3.0, minEdgeMedium: 1.3 };
    case "prop":
      return /Home Runs/.test(candidateType || "")
        ? { high: 10.9, medium: 6.0, minEdgeHigh: 3.3, minEdgeMedium: 1.5 }
        : { high: 9.8, medium: 5.7, minEdgeHigh: 2.6, minEdgeMedium: 1.2 };
    default:
      return { high: 9.8, medium: 5.7, minEdgeHigh: 2.6, minEdgeMedium: 1.1 };
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

  if (
    finalScore >= thresholds.medium &&
    edge >= thresholds.minEdgeMedium
  ) {
    return "Medium";
  }

  return "Low";
}

function recommendStakeUnits(finalScore, confidence) {
  if (confidence === "High") return finalScore >= 10.8 ? 1.25 : 1.0;
  if (confidence === "Medium") return 0.5;
  return 0.25;
}

function findPlayerInOfficialLineups(playerName, lineupContext) {
  const target = normalizeName(playerName);
  const sides = [
    { side: "away", lineup: lineupContext?.officialLineups?.away },
    { side: "home", lineup: lineupContext?.officialLineups?.home }
  ];

  for (const entry of sides) {
    const players = Array.isArray(entry.lineup?.players) ? entry.lineup.players : [];
    for (const player of players) {
      const current = normalizeName(player?.name || "");
      if (!current) continue;
      if (current === target || current.includes(target) || target.includes(current)) {
        return {
          teamSide: entry.side,
          lineupIndex: Number(player.lineupIndex || 0) || null,
          bats: player.bats || null,
          name: player.name
        };
      }
    }
  }

  return null;
}

function getLineupSlotBonus(slot) {
  if (slot == null) return 0;
  if (slot <= 2) return 1.0;
  if (slot <= 5) return 0.65;
  if (slot <= 7) return 0.20;
  return -0.25;
}

function getOpposingPitcherHand(teamSide, lineupContext) {
  if (teamSide === "away") return lineupContext?.probablePitchers?.homeHand || null;
  if (teamSide === "home") return lineupContext?.probablePitchers?.awayHand || null;
  return null;
}

function getPlatoonBonus(bats, pitcherHand) {
  if (!bats || !pitcherHand) return 0;
  if (bats === "S") return 0.35;
  if (bats === "L" && pitcherHand === "R") return 0.55;
  if (bats === "R" && pitcherHand === "L") return 0.50;
  if (bats === pitcherHand) return -0.25;
  return 0;
}

function getTeamEnvironmentBonus(teamSide, lineupContext) {
  const lineup = teamSide === "away" ? lineupContext?.officialLineups?.away : lineupContext?.officialLineups?.home;
  const players = Array.isArray(lineup?.players) ? lineup.players : [];
  if (!players.length) return 0;

  let topOrderScore = 0;
  players.forEach(player => {
    const slot = Number(player.lineupIndex || 0);
    if (slot >= 1 && slot <= 3) topOrderScore += 0.15;
    if (slot >= 4 && slot <= 5) topOrderScore += 0.08;
  });

  return round2(topOrderScore);
}

function getPitcherPropLineupAdjustment(playerName, marketKey, lineupContext) {
  const target = normalizeName(playerName);
  const probableAway = normalizeName(lineupContext?.probablePitchers?.away || "");
  const probableHome = normalizeName(lineupContext?.probablePitchers?.home || "");

  let pitcherSide = null;
  if (target === probableAway || probableAway.includes(target) || target.includes(probableAway)) pitcherSide = "away";
  if (target === probableHome || probableHome.includes(target) || target.includes(probableHome)) pitcherSide = "home";
  if (!pitcherSide) return 0;

  const opposingLineup = pitcherSide === "away" ? lineupContext?.officialLineups?.home : lineupContext?.officialLineups?.away;
  const pitcherHand = pitcherSide === "away" ? lineupContext?.probablePitchers?.awayHand : lineupContext?.probablePitchers?.homeHand;
  const players = Array.isArray(opposingLineup?.players) ? opposingLineup.players : [];
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

function getLineupStrengthTilt(lineupContext) {
  const away = Array.isArray(lineupContext?.officialLineups?.away?.players) ? lineupContext.officialLineups.away.players : [];
  const home = Array.isArray(lineupContext?.officialLineups?.home?.players) ? lineupContext.officialLineups.home.players : [];
  if (!away.length || !home.length) return 0;

  const awayScore = away.reduce((sum, p) => sum + getLineupSlotBonus(Number(p.lineupIndex || 0)), 0);
  const homeScore = home.reduce((sum, p) => sum + getLineupSlotBonus(Number(p.lineupIndex || 0)), 0);
  return round2((homeScore - awayScore) / 6);
}