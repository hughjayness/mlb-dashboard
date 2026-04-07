const PROP_CACHE_TTL_MS = 60 * 1000;
const PROP_CACHE = global.__BOBBY_MLB_PROP_CACHE__ || new Map();
if (!global.__BOBBY_MLB_PROP_CACHE__) global.__BOBBY_MLB_PROP_CACHE__ = PROP_CACHE;

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
  const currentSeason = new Date().getFullYear();
  const shouldLoadProps = viewMode === "props";
  const propsGameLimit = 4;
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

    const games = await Promise.all(limitedGames.map(async (game, index) => {
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
        propResult = await fetchPropCandidatesForEventCached(game.id, apiKey, lineupContext, viewMode);
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
        lineupContext,
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
      const scoredWithCorrelation = applyPerGameRanking(scoredCandidates);
      const filteredForView = filterCandidatesForView(scoredWithCorrelation, viewMode);
      const bestCandidate = chooseBestCandidate(filteredForView, scoredWithCorrelation);
      const topPropCandidate = chooseTopPropCandidate(scoredWithCorrelation);
      const riskWarnings = buildRiskWarnings(componentScores, bestCandidate, scoredWithCorrelation);

      const payload = buildGamePayload({
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
        scoredCandidates: scoredWithCorrelation,
        parkFactor,
        currentSeason
      });

      return payload;
    }));

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      mode: viewMode,
      notes: [
        "All bet types remain eligible; confidence is determined by price favorability plus baseball-context scoring.",
        shouldLoadProps
          ? "Props mode evaluates hitter and pitcher props directly and ranks them inside the candidate pool."
          : "Props are rate-limited outside props mode to avoid API frequency-limit failures.",
        "Unders and overs are both explicitly generated and scored."
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
    homeId: scheduleGame?.teams?.home?.probablePitcher?.id || null
  };
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

  const lines = cleaned
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "@") continue;

    if (i + 2 < lines.length && lines[i + 1] === "@") {
      const away = normalizeTeamName(lines[i]);
      const home = normalizeTeamName(lines[i + 2]);
      const key = matchupKey(away, home);
      const block = lines.slice(i, Math.min(i + 220, lines.length));
      const lineupGroups = extractTeamLineupGroups(block, away, home);
      const awayPlayers = firstValidLineup(lineupGroups.away);
      const homePlayers = firstValidLineup(lineupGroups.home);
      map[key] = { awayTeam: away, homeTeam: home, awayPlayers, homePlayers };
    }
  }

  return map;
}

function extractTeamLineupGroups(block, awayTeam, homeTeam) {
  const result = { away: [], home: [] };

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    if (line === `${teamAbbrevHint(awayTeam)} Lineup` || line === `${awayTeam} Lineup`) {
      result.away.push(extractOneLineup(block, i + 1));
    }
    if (line === `${teamAbbrevHint(homeTeam)} Lineup` || line === `${homeTeam} Lineup`) {
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

    const fullNameMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]+$/);
    if (fullNameMatch) {
      players.push(fullNameMatch[1].trim());
      continue;
    }

    const shortNameMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z]{1,3}$/);
    if (shortNameMatch) {
      players.push(shortNameMatch[1].trim());
      continue;
    }

    const noPosMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)$/);
    if (noPosMatch) {
      players.push(noPosMatch[1].trim());
      continue;
    }

    if (players.length >= 9) break;
  }
  return players;
}

function firstValidLineup(groups) {
  if (!Array.isArray(groups)) return [];
  for (const g of groups) {
    if (Array.isArray(g) && g.length === 9) return g;
  }
  return [];
}

function buildLineupContext({ homeTeam, awayTeam, mlbLineups, probablePitchers, scheduleGame }) {
  const key = matchupKey(awayTeam, homeTeam);
  const official = mlbLineups[key];
  const hasOfficial =
    official &&
    Array.isArray(official.awayPlayers) && official.awayPlayers.length === 9 &&
    Array.isArray(official.homePlayers) && official.homePlayers.length === 9;

  const projectedLineups = {
    away: buildProjectedLineupShell(awayTeam),
    home: buildProjectedLineupShell(homeTeam)
  };

  const officialLineups = hasOfficial
    ? {
        away: { team: awayTeam, status: "official", players: official.awayPlayers.map((name, idx) => ({ name, lineupIndex: idx + 1 })) },
        home: { team: homeTeam, status: "official", players: official.homePlayers.map((name, idx) => ({ name, lineupIndex: idx + 1 })) }
      }
    : { away: null, home: null };

  return {
    lineupMode: hasOfficial ? "official" : "projected",
    lineupSource: hasOfficial ? "MLB Starting Lineups" : "Projected lineup feed",
    officialLineupAvailable: hasOfficial,
    projectedLineupUsed: !hasOfficial,
    projectedLineups,
    officialLineups,
    probablePitchers,
    gamePk: scheduleGame?.gamePk || null,
    venueName: scheduleGame?.venue?.name || null
  };
}

function buildProjectedLineupShell(teamName) {
  return {
    team: teamName,
    status: "projected",
    players: [],
    note: "Projected lineup placeholder."
  };
}

async function fetchPropCandidatesForEventCached(eventId, apiKey, lineupContext, viewMode) {
  const cacheKey = JSON.stringify({
    eventId,
    lineupMode: lineupContext?.lineupMode || "unknown",
    officialLineupAvailable: !!lineupContext?.officialLineupAvailable,
    viewMode
  });

  const cached = PROP_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PROP_CACHE_TTL_MS) return cached.value;

  const value = await fetchPropCandidatesForEvent(eventId, apiKey, lineupContext);
  PROP_CACHE.set(cacheKey, { ts: Date.now(), value });
  if (PROP_CACHE.size > 100) {
    const firstKey = PROP_CACHE.keys().next().value;
    if (firstKey) PROP_CACHE.delete(firstKey);
  }
  return value;
}

async function fetchPropCandidatesForEvent(eventId, apiKey, lineupContext) {
  const propMarketGroups = [
    ["pitcher_strikeouts"],
    ["pitcher_outs"],
    ["batter_hits", "batter_total_bases"],
    ["batter_home_runs"]
  ];

  const triedMarkets = [];
  let candidates = [];

  for (const group of propMarketGroups) {
    triedMarkets.push(group.join(", "));
    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&bookmakers=betmgm` +
      `&markets=${group.join(",")}` +
      `&oddsFormat=american`;

    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      const bookmaker = Array.isArray(data.bookmakers) ? data.bookmakers[0] : null;
      const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];
      candidates = candidates.concat(extractPropCandidates(markets, lineupContext));
    } catch (error) {}
  }

  candidates = candidates.sort((a, b) => (b.preScore || 0) - (a.preScore || 0));
  const topProp = candidates[0] ? convertCandidateToTopProp(candidates[0], lineupContext) : null;

  return {
    candidates,
    topProp,
    status: candidates.length
      ? (lineupContext.lineupMode === "official"
          ? "Live BetMGM prop candidates returned using official lineup mode."
          : "Live BetMGM prop candidates returned using projected lineup mode.")
      : "No supported BetMGM prop returned. Checked: " + triedMarkets.join(" | "),
    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource
  };
}

function extractPropCandidates(markets, lineupContext) {
  const out = [];
  for (const market of Array.isArray(markets) ? markets : []) {
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
    for (const outcome of outcomes) {
      if (!outcome || !outcome.description) continue;
      if (!passesLineupScenario(outcome, market.key, lineupContext)) continue;

      const candidate = buildPropCandidateFromOutcome(market.key, outcome, lineupContext);
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

function buildPropCandidateFromOutcome(marketKey, outcome, lineupContext) {
  const marketLabel = buildPropLabel(marketKey, outcome);
  const marketProb = americanToProb(outcome.price);
  if (marketProb == null) return null;

  const playerName = outcome.description || outcome.name || "Unknown Player";
  const isHitterMarket = /^batter_/.test(marketKey);
  const officialLineupBonus = lineupContext.officialLineupAvailable ? 0.8 : -0.6;
  const lineupSlotBonus = getLineupSlotBonus(playerName, lineupContext);
  const marketBias = getPropMarketBias(marketKey, outcome);
  const priceDiscipline = getPriceDisciplineBonus(outcome.price);
  const contextTilt = officialLineupBonus + lineupSlotBonus + marketBias + priceDiscipline;
  const fairProb = clamp(marketProb + (contextTilt * 0.0125), 0.08, 0.92);
  const edgePct = round1((fairProb - marketProb) * 100);
  const preScore = round2(Math.abs(edgePct) + contextTilt * 1.15 + (isHitterMarket ? 0.4 : 0.2));

  const bestBetType = marketKey === "pitcher_strikeouts" || marketKey === "pitcher_outs" || /^batter_/.test(marketKey)
    ? "Prop"
    : "Prop";

  return {
    marketFamily: "prop",
    marketKey,
    player: playerName,
    bestBet: `${playerName} ${marketLabel}`,
    bestBetType,
    oddsPrice: typeof outcome.price === "number" ? outcome.price : null,
    impliedProb: toPctNumber(marketProb),
    fairProb: toPctNumber(fairProb),
    edgePct,
    preScore,
    contextTilt: round2(contextTilt),
    reasons: buildPropReasonsV2(marketKey, outcome, lineupContext, edgePct, fairProb),
    candidateMeta: {
      player: playerName,
      market: marketLabel,
      side: outcome.name,
      point: outcome.point,
      lineupSlotBonus,
      officialLineupAvailable: lineupContext.officialLineupAvailable
    }
  };
}

function buildComponentScores({ moneylineData, totalData, lineupContext, parkFactor, probablePitchers }) {
  const homeMarketLean =
    moneylineData.homeProb !== null && moneylineData.awayProb !== null
      ? clamp((moneylineData.homeProb - moneylineData.awayProb) * 4, -2, 2)
      : 0;

  const totalMarketLean =
    totalData.overProb !== null && totalData.underProb !== null
      ? clamp((totalData.overProb - totalData.underProb) * 4, -2, 2)
      : 0;

  const lineupScore = lineupContext.officialLineupAvailable ? 0.55 : 0.10;
  const probablePitcherKnown = probablePitchers.away !== "TBD" && probablePitchers.home !== "TBD";
  const starterScore = probablePitcherKnown ? 0.35 : 0.0;
  const parkScore = round2((parkFactor - 1.0) * 10);

  return {
    side: {
      startingPitcher: starterScore,
      bullpen: 0,
      lineup: lineupScore,
      offenseVsHand: 0,
      defense: 0,
      parkWeather: round2(parkScore * 0.25),
      scheduleTravel: 0,
      marketContext: round2(homeMarketLean)
    },
    total: {
      starterRunSuppression: round2(-starterScore * 0.35),
      bullpenRunSuppression: 0,
      offenseQuality: 0,
      lineups: lineupScore,
      parkFactor: parkScore,
      weather: 0,
      catcherDefense: 0,
      marketContext: round2(totalMarketLean)
    },
    liveFeedStatus: {
      startingPitcher: probablePitcherKnown ? "probable" : "placeholder",
      bullpen: "placeholder",
      lineup: lineupContext.officialLineupAvailable ? "official" : "projected",
      offenseVsHand: "placeholder",
      defense: "placeholder",
      parkWeather: "park-only",
      scheduleTravel: "placeholder",
      marketContext: "live"
    }
  };
}
function buildModelOutputs({ componentScores, moneylineData, totalData, lineupContext, parkFactor }) {
  const sideComposite =
    (0.28 * componentScores.side.startingPitcher) +
    (0.12 * componentScores.side.bullpen) +
    (0.18 * componentScores.side.lineup) +
    (0.12 * componentScores.side.offenseVsHand) +
    (0.05 * componentScores.side.defense) +
    (0.08 * componentScores.side.parkWeather) +
    (0.05 * componentScores.side.scheduleTravel) +
    (0.12 * componentScores.side.marketContext);

  const totalComposite =
    (0.18 * componentScores.total.starterRunSuppression) +
    (0.15 * componentScores.total.bullpenRunSuppression) +
    (0.15 * componentScores.total.offenseQuality) +
    (0.10 * componentScores.total.lineups) +
    (0.20 * componentScores.total.parkFactor) +
    (0.12 * componentScores.total.weather) +
    (0.10 * componentScores.total.catcherDefense);

  const marketHomeProb = moneylineData.homeProb ?? 0.50;
  const marketAwayProb = moneylineData.awayProb ?? 0.50;
  const homeWinProb = clamp(marketHomeProb + (sideComposite * 0.03), 0.15, 0.85);
  const awayWinProb = clamp(1 - homeWinProb, 0.15, 0.85);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketTotalLine = totalData.point ?? null;
  const marketOverProb = totalData.overProb ?? 0.50;
  let fairTotal = null;
  if (marketTotalLine !== null) {
    fairTotal = round1(marketTotalLine + (totalComposite * 0.40));
  }

  const parkOverLean = parkFactor > 1 ? (parkFactor - 1) * 0.8 : (parkFactor - 1) * 0.4;
  const fairOverProb = clamp(marketOverProb + (totalComposite * 0.018) + parkOverLean, 0.15, 0.85);
  const fairUnderProb = clamp(1 - fairOverProb, 0.15, 0.85);

  const marketSpreadFav = deriveSpreadFavorite(moneylineData);
  const homeRunLineConfidence = clamp(homeWinProb + (marketSpreadFav === "home" ? 0.05 : -0.02), 0.10, 0.90);
  const awayRunLineConfidence = clamp(awayWinProb + (marketSpreadFav === "away" ? 0.05 : -0.02), 0.10, 0.90);

  return {
    sideComposite: round2(sideComposite),
    totalComposite: round2(totalComposite),
    fairMlAway,
    fairMlHome,
    fairTotal,
    awayWinProb: toPctNumber(awayWinProb),
    homeWinProb: toPctNumber(homeWinProb),
    awayEdgePct: toEdgePct(awayWinProb, marketAwayProb),
    homeEdgePct: toEdgePct(homeWinProb, marketHomeProb),
    overEdgePct: toEdgePct(fairOverProb, marketOverProb),
    underEdgePct: toEdgePct(fairUnderProb, 1 - marketOverProb),
    overConfidence: toPctNumber(fairOverProb),
    underConfidence: toPctNumber(fairUnderProb),
    awayRunLineConfidence: toPctNumber(awayRunLineConfidence),
    homeRunLineConfidence: toPctNumber(homeRunLineConfidence)
  };
}

function generateAllCandidates(context) {
  const out = [];
  const { awayTeam, homeTeam, moneylineData, totalData, spreadData, modelOutputs, propCandidates } = context;

  if (moneylineData.awayPrice != null) {
    out.push({
      marketFamily: "full",
      candidateType: "moneyline",
      teamSide: "away",
      bestBet: `${awayTeam} ML`,
      bestBetType: "Side",
      oddsPrice: moneylineData.awayPrice,
      impliedProb: toPctNumber(moneylineData.awayProb),
      fairProb: modelOutputs.awayWinProb,
      edgePct: modelOutputs.awayEdgePct,
      reasons: buildSideReasons(awayTeam, "away", modelOutputs, context.componentScores, moneylineData)
    });
  }

  if (moneylineData.homePrice != null) {
    out.push({
      marketFamily: "full",
      candidateType: "moneyline",
      teamSide: "home",
      bestBet: `${homeTeam} ML`,
      bestBetType: "Side",
      oddsPrice: moneylineData.homePrice,
      impliedProb: toPctNumber(moneylineData.homeProb),
      fairProb: modelOutputs.homeWinProb,
      edgePct: modelOutputs.homeEdgePct,
      reasons: buildSideReasons(homeTeam, "home", modelOutputs, context.componentScores, moneylineData)
    });
  }

  if (totalData.point != null) {
    out.push({
      marketFamily: "full",
      candidateType: "total-over",
      totalSide: "over",
      bestBet: `Over ${totalData.point}`,
      bestBetType: "Total",
      oddsPrice: totalData.overPrice,
      impliedProb: toPctNumber(totalData.overProb),
      fairProb: modelOutputs.overConfidence,
      edgePct: modelOutputs.overEdgePct,
      reasons: buildTotalReasons("Over", totalData.point, modelOutputs, context.componentScores)
    });
    out.push({
      marketFamily: "full",
      candidateType: "total-under",
      totalSide: "under",
      bestBet: `Under ${totalData.point}`,
      bestBetType: "Total",
      oddsPrice: totalData.underPrice,
      impliedProb: toPctNumber(totalData.underProb),
      fairProb: modelOutputs.underConfidence,
      edgePct: modelOutputs.underEdgePct,
      reasons: buildTotalReasons("Under", totalData.point, modelOutputs, context.componentScores)
    });
  }

  if (spreadData.awayPrice != null && spreadData.awayPoint != null) {
    out.push({
      marketFamily: "full",
      candidateType: "runline-away",
      teamSide: "away",
      bestBet: `${awayTeam} ${formatSpread(spreadData.awayPoint)}`,
      bestBetType: "Run Line",
      oddsPrice: spreadData.awayPrice,
      impliedProb: toPctNumber(spreadData.awayProb),
      fairProb: modelOutputs.awayRunLineConfidence,
      edgePct: toEdgePct((modelOutputs.awayRunLineConfidence || 50) / 100, spreadData.awayProb),
      reasons: buildRunLineReasons(awayTeam, spreadData.awayPoint, "away", context)
    });
  }

  if (spreadData.homePrice != null && spreadData.homePoint != null) {
    out.push({
      marketFamily: "full",
      candidateType: "runline-home",
      teamSide: "home",
      bestBet: `${homeTeam} ${formatSpread(spreadData.homePoint)}`,
      bestBetType: "Run Line",
      oddsPrice: spreadData.homePrice,
      impliedProb: toPctNumber(spreadData.homeProb),
      fairProb: modelOutputs.homeRunLineConfidence,
      edgePct: toEdgePct((modelOutputs.homeRunLineConfidence || 50) / 100, spreadData.homeProb),
      reasons: buildRunLineReasons(homeTeam, spreadData.homePoint, "home", context)
    });
  }

  for (const propCandidate of Array.isArray(propCandidates) ? propCandidates : []) {
    out.push(propCandidate);
  }

  return out.filter(c => c && c.bestBet && c.oddsPrice != null && isFinite(Number(c.edgePct)));
}

function scoreCandidates(context, candidates) {
  return (Array.isArray(candidates) ? candidates : []).map(candidate => {
    const valueScore = getValueScore(candidate);
    const contextScore = getContextScore(candidate, context);
    const completenessScore = getDataCompleteness(context.componentScores, context.lineupContext);
    const marketThresholds = getThresholdsForBetType(candidate.bestBetType, candidate.marketFamily, candidate.candidateType);
    const finalScore = round2((0.56 * valueScore) + (0.44 * contextScore) + (completenessScore / 18));
    const confidence = determineConfidenceTier(finalScore, marketThresholds);

    return Object.assign({}, candidate, {
      valueScore: round2(valueScore),
      contextScore: round2(contextScore),
      dataCompleteness: completenessScore,
      finalScore,
      confidence,
      confidenceScore: finalScore,
      marketThresholds,
      recommendedTiming: context.lineupContext.officialLineupAvailable ? "Now" : "Wait for official lineups",
      recommendedStakeUnits: recommendStakeUnits(finalScore, confidence)
    });
  });
}

function applyPerGameRanking(candidates) {
  const sorted = (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  return sorted.map((candidate, idx) => Object.assign({}, candidate, { slateRank: idx + 1 }));
}

function filterCandidatesForView(candidates, viewMode) {
  const arr = Array.isArray(candidates) ? candidates : [];
  if (viewMode === "props") return arr.filter(c => c.marketFamily === "prop");
  if (viewMode === "f5") return arr.filter(c => c.marketFamily === "f5");
  return arr.filter(c => c.marketFamily === "full");
}

function chooseBestCandidate(filteredForView, allCandidates) {
  const pool = filteredForView && filteredForView.length ? filteredForView : (Array.isArray(allCandidates) ? allCandidates : []);
  return pool.length ? pool[0] : null;
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
  parkFactor,
  currentSeason
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
    season: currentSeason,
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
      topCandidates: scoredCandidates.slice(0, 5).map(c => ({
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
      dataAvailability: {
        officialLineupAvailable: lineupContext.officialLineupAvailable,
        probablePitchersKnown: probablePitchers.away !== "TBD" && probablePitchers.home !== "TBD",
        propsLoaded: Array.isArray(propResult.candidates) && propResult.candidates.length > 0,
        parkFactorAvailable: parkFactor != null
      },
      interpretation: {
        underGenerated: scoredCandidates.some(c => c.bestBetType === "Total" && /^Under /.test(c.bestBet)),
        hitterPropGenerated: scoredCandidates.some(c => c.marketFamily === "prop" && /Hits|Total Bases|Home Runs/.test(c.bestBet)),
        propsMode: viewMode === "props"
      }
    }
  };
}

function getValueScore(candidate) {
  const edge = Math.abs(Number(candidate.edgePct || 0));
  const juiceBonus = getPriceDisciplineBonus(candidate.oddsPrice);
  const fairProbBonus = candidate.fairProb != null && candidate.impliedProb != null
    ? Math.max(0, (candidate.fairProb - candidate.impliedProb) * 0.08)
    : 0;
  return round2((edge * 1.15) + juiceBonus + fairProbBonus);
}

function getContextScore(candidate, context) {
  const lineupBonus = context.lineupContext.officialLineupAvailable ? 1.2 : -0.5;
  const parkFactor = context.parkFactor || 1.0;
  const parkTilt = getCandidateParkTilt(candidate, parkFactor);
  const starterKnownBonus = context.probablePitchers.away !== "TBD" && context.probablePitchers.home !== "TBD" ? 0.7 : 0;
  const marketShapeBonus = getMarketShapeBonus(candidate, context);
  return round2(lineupBonus + parkTilt + starterKnownBonus + marketShapeBonus);
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
    if (/^Over /.test(candidate.bestBet)) return round2((parkFactor - 1) * 5.0);
    if (/^Under /.test(candidate.bestBet)) return round2((1 - parkFactor) * 5.0);
  }

  if (candidate.bestBetType === "Run Line" || candidate.bestBetType === "Side") {
    return 0;
  }

  return 0;
}

function getMarketShapeBonus(candidate, context) {
  if (candidate.bestBetType === "Side") {
    return Math.abs(context.modelOutputs.sideComposite || 0) * 1.8;
  }
  if (candidate.bestBetType === "Total") {
    if (/^Under /.test(candidate.bestBet)) {
      const lowTotalBonus = context.totalData.point != null && context.totalData.point <= 8 ? 1.0 : 0.2;
      return (Math.abs(context.modelOutputs.totalComposite || 0) * 1.6) + lowTotalBonus;
    }
    return Math.abs(context.modelOutputs.totalComposite || 0) * 1.6;
  }
  if (candidate.bestBetType === "Run Line") {
    return Math.abs(context.modelOutputs.sideComposite || 0) * 1.2;
  }
  if (candidate.marketFamily === "prop") {
    return Math.abs(candidate.contextTilt || 0) * 1.4;
  }
  return 0;
}

function getDataCompleteness(componentScores, lineupContext) {
  let score = 0;
  if (lineupContext?.officialLineupAvailable) score += 30;
  if (componentScores?.side?.startingPitcher && Math.abs(componentScores.side.startingPitcher) > 0.05) score += 20;
  if (componentScores?.side?.lineup && Math.abs(componentScores.side.lineup) > 0.05) score += 15;
  if (componentScores?.total?.parkFactor && Math.abs(componentScores.total.parkFactor) > 0.05) score += 15;
  if (componentScores?.liveFeedStatus?.marketContext === "live") score += 20;
  return Math.min(score, 100);
}

function getThresholdsForBetType(bestBetType, marketFamily, candidateType) {
  const key = marketFamily === "prop" ? "prop" : (bestBetType || "Other");
  switch (key) {
    case "Side": return { high: 8.4, medium: 4.8 };
    case "Total": return { high: 8.3, medium: 4.6 };
    case "Run Line": return { high: 9.2, medium: 5.0 };
    case "F5 Side": return { high: 10.2, medium: 5.6 };
    case "F5 Total": return { high: 10.0, medium: 5.4 };
    case "F5 Run Line": return { high: 10.8, medium: 5.8 };
    case "prop": return { high: /Home Runs/.test(candidateType || "") ? 11.2 : 9.8, medium: 5.2 };
    default: return { high: 9.5, medium: 5.0 };
  }
}

function determineConfidenceTier(finalScore, thresholds) {
  if (finalScore >= thresholds.high) return "High";
  if (finalScore >= thresholds.medium) return "Medium";
  return "Low";
}

function recommendStakeUnits(finalScore, confidence) {
  if (confidence === "High") return finalScore >= 11 ? 1.5 : 1.0;
  if (confidence === "Medium") return 0.5;
  return 0.25;
}

function getPropMarketBias(marketKey, outcome) {
  let bias = 0;
  if (marketKey === "pitcher_strikeouts") bias += outcome.name === "Under" ? 0.55 : 0.35;
  if (marketKey === "pitcher_outs") bias += outcome.name === "Under" ? 0.45 : 0.30;
  if (marketKey === "batter_hits") bias += outcome.name === "Over" ? 0.35 : 0.25;
  if (marketKey === "batter_total_bases") bias += outcome.name === "Over" ? 0.30 : 0.20;
  if (marketKey === "batter_home_runs") bias += outcome.name === "Over" ? -0.75 : -1.0;
  if (typeof outcome.point === "number") {
    if (marketKey === "pitcher_strikeouts" && outcome.name === "Over" && outcome.point >= 7.5) bias -= 0.45;
    if (marketKey === "pitcher_strikeouts" && outcome.name === "Under" && outcome.point >= 7.5) bias += 0.20;
    if (marketKey === "batter_hits" && outcome.point >= 1.5 && outcome.name === "Over") bias -= 0.20;
    if (marketKey === "batter_total_bases" && outcome.point >= 2.5 && outcome.name === "Over") bias -= 0.25;
  }
  return bias;
}

function getPriceDisciplineBonus(price) {
  if (price == null || !isFinite(Number(price))) return 0;
  const p = Number(price);
  if (p >= 100 && p <= 165) return 0.9;
  if (p > 165) return 0.5;
  if (p <= -170) return -1.0;
  if (p <= -140) return -0.45;
  return 0.2;
}

function getLineupSlotBonus(playerName, lineupContext) {
  const slot = findPlayerLineupSlot(playerName, lineupContext);
  if (slot == null) return lineupContext.officialLineupAvailable ? -0.8 : 0;
  if (slot <= 2) return 1.0;
  if (slot <= 5) return 0.6;
  if (slot <= 7) return 0.2;
  return -0.35;
}

function findPlayerLineupSlot(playerName, lineupContext) {
  const target = normalizeName(playerName);
  const sides = [lineupContext?.officialLineups?.away, lineupContext?.officialLineups?.home];
  for (const side of sides) {
    const players = Array.isArray(side?.players) ? side.players : [];
    for (const player of players) {
      const current = normalizeName(player?.name || player);
      if (!current) continue;
      if (current === target || current.includes(target) || target.includes(current)) {
        return Number(player.lineupIndex || 0) || null;
      }
    }
  }
  return null;
}

function buildPropReasonsV2(marketKey, outcome, lineupContext, edgePct, fairProb) {
  const reasons = [];
  reasons.push(`Market implied probability is ${toPctNumber(americanToProb(outcome.price))}%.`);
  reasons.push(`Model fair probability is ${toPctNumber(fairProb)}%.`);
  reasons.push(`Estimated edge is ${signedPct(edgePct)}.`);
  reasons.push(`Lineup mode: ${lineupContext.lineupMode}.`);
  if (/^batter_/.test(marketKey)) {
    const slot = findPlayerLineupSlot(outcome.description, lineupContext);
    if (slot) reasons.push(`Player is in lineup spot ${slot}.`);
    else reasons.push("Lineup slot could not be confirmed.");
  }
  switch (marketKey) {
    case "pitcher_strikeouts": reasons.push("Pitcher strikeout candidate was scored with explicit over/under consideration."); break;
    case "pitcher_outs": reasons.push("Pitcher outs candidate was scored as a leash-and-efficiency market."); break;
    case "batter_hits": reasons.push("Hitter hits candidate is included in the ranking pool, not hidden behind a pitcher-only prop screen."); break;
    case "batter_total_bases": reasons.push("Total bases candidate is explicitly evaluated as a hitter-driven prop."); break;
    case "batter_home_runs": reasons.push("Home run props stay eligible, but they need a much stronger score to rate as high confidence."); break;
  }
  return reasons;
}

function buildRunLineReasons(teamName, point, side, context) {
  return [
    `${teamName} run line at ${formatSpread(point)} remains eligible if side edge and price discipline both clear threshold.`,
    `Model side composite is ${formatSignedNumber(context.modelOutputs.sideComposite)}.`,
    `Official lineups ${context.lineupContext.officialLineupAvailable ? "are" : "are not"} available.`
  ];
}

function buildRiskWarnings(componentScores, bestCandidate, candidates) {
  const warnings = [];
  if (componentScores.liveFeedStatus.startingPitcher === "placeholder") warnings.push("Starting pitcher inputs are still limited to probable-pitcher availability, not full starter projections.");
  if (componentScores.liveFeedStatus.bullpen !== "live") warnings.push("Bullpen fatigue and availability are not yet fully live.");
  if (componentScores.liveFeedStatus.lineup === "projected") warnings.push("Official lineups are not posted yet.");
  if (componentScores.liveFeedStatus.scheduleTravel !== "live") warnings.push("Travel and rest are not yet fully live.");
  if (!candidates.some(c => c.bestBetType === "Total" && /^Under /.test(c.bestBet))) warnings.push("No total-under candidate cleared the scoring floor for this game.");
  if (bestCandidate && bestCandidate.marketFamily === "prop" && /Home Runs/.test(bestCandidate.bestBet)) warnings.push("Home run props remain high variance even when they rate well.");
  return warnings;
}

function convertCandidateToTopProp(candidate, lineupContext) {
  if (!candidate || candidate.marketFamily !== "prop") return null;
  return {
    player: candidate.candidateMeta?.player || candidate.player || "Unknown Player",
    market: candidate.candidateMeta?.market || candidate.bestBet.replace(/^.*?\s(Pitcher Strikeouts|Pitcher Outs|Hits|Total Bases|Home Runs.*)$/i, "$1"),
    price: candidate.oddsPrice,
    modelProb: candidate.fairProb,
    reasons: candidate.reasons,
    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource,
    rankingScore: candidate.finalScore || candidate.preScore || 0,
    confidence: candidate.confidence || "Low"
  };
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported BetMGM prop returned.";
  const reasons = [];
  reasons.push("This was the highest-scoring prop candidate after price and baseball-context scoring.");
  if (typeof topProp.rankingScore === "number") reasons.push(`Ranking score: ${round2(topProp.rankingScore)}.`);
  reasons.push(`Market: ${topProp.market}.`);
  if (typeof topProp.price === "number") reasons.push(`Book price: ${formatAmerican(topProp.price)}.`);
  if (typeof topProp.modelProb === "number") reasons.push(`Fair probability: ${topProp.modelProb}%.`);
  reasons.push(`Lineup mode: ${lineupContext.lineupMode}.`);
  return reasons.join(" ");
}

function buildSideReasons(teamName, side, modelOutputs, componentScores, moneylineData) {
  const winProb = side === "home" ? modelOutputs.homeWinProb : modelOutputs.awayWinProb;
  const fairPrice = side === "home" ? modelOutputs.fairMlHome : modelOutputs.fairMlAway;
  const edgePct = side === "home" ? modelOutputs.homeEdgePct : modelOutputs.awayEdgePct;
  const marketProb = side === "home" ? moneylineData.homeProb : moneylineData.awayProb;
  return [
    `${teamName} fair moneyline projects to ${formatAmerican(fairPrice)}.`,
    `Model win probability is ${winProb}% versus market implied ${toPctNumber(marketProb)}%.`,
    `Estimated edge is ${signedPct(edgePct)}.`,
    componentScores.liveFeedStatus.startingPitcher === "probable"
      ? "Probable pitchers are known for this matchup."
      : "Probable pitchers are not fully confirmed yet."
  ];
}
function buildTotalReasons(direction, line, modelOutputs, componentScores) {
  const edge = direction === "Over" ? modelOutputs.overEdgePct : modelOutputs.underEdgePct;
  const fairProb = direction === "Over" ? modelOutputs.overConfidence : modelOutputs.underConfidence;
  return [
    `Fair total projects to ${modelOutputs.fairTotal !== null ? modelOutputs.fairTotal : "N/A"} against market ${line}.`,
    `${direction} fair probability is ${fairProb}%.`,
    `${direction} edge is estimated at ${signedPct(edge)}.`,
    direction === "Under"
      ? "Under is explicitly scored, not treated as a fallback after over logic."
      : "Over is explicitly scored against the same baseline as the under."
  ];
}

function parseMoneyline(market, homeTeam, awayTeam) {
  if (!market || !Array.isArray(market.outcomes) || market.outcomes.length < 2) {
    return { display: "N/A", homePrice: null, awayPrice: null, homeProb: null, awayProb: null };
  }
  const home = market.outcomes.find(o => normalizeTeamName(o.name) === homeTeam);
  const away = market.outcomes.find(o => normalizeTeamName(o.name) === awayTeam);
  if (!home || !away) {
    return { display: "N/A", homePrice: null, awayPrice: null, homeProb: null, awayProb: null };
  }
  return {
    display: `${awayTeam} ${formatAmerican(away.price)} / ${homeTeam} ${formatAmerican(home.price)}`,
    homePrice: home.price,
    awayPrice: away.price,
    homeProb: americanToProb(home.price),
    awayProb: americanToProb(away.price)
  };
}

function parseSpreads(market, homeTeam, awayTeam) {
  if (!market || !Array.isArray(market.outcomes) || market.outcomes.length < 2) {
    return { display: "N/A", homePoint: null, awayPoint: null, homePrice: null, awayPrice: null, homeProb: null, awayProb: null };
  }
  const home = market.outcomes.find(o => normalizeTeamName(o.name) === homeTeam);
  const away = market.outcomes.find(o => normalizeTeamName(o.name) === awayTeam);
  if (!home || !away) {
    return { display: "N/A", homePoint: null, awayPoint: null, homePrice: null, awayPrice: null, homeProb: null, awayProb: null };
  }
  return {
    display: `${awayTeam} ${formatSpread(away.point)} (${formatAmerican(away.price)}) / ${homeTeam} ${formatSpread(home.point)} (${formatAmerican(home.price)})`,
    homePoint: home.point,
    awayPoint: away.point,
    homePrice: home.price,
    awayPrice: away.price,
    homeProb: americanToProb(home.price),
    awayProb: americanToProb(away.price)
  };
}

function parseTotals(market) {
  if (!market || !Array.isArray(market.outcomes) || market.outcomes.length < 2) {
    return { display: "N/A", point: null, overPrice: null, underPrice: null, overProb: null, underProb: null };
  }
  const over = market.outcomes.find(o => o.name === "Over");
  const under = market.outcomes.find(o => o.name === "Under");
  if (!over || !under) {
    return { display: "N/A", point: null, overPrice: null, underPrice: null, overProb: null, underProb: null };
  }
  return {
    display: `O/U ${over.point} (O ${formatAmerican(over.price)} / U ${formatAmerican(under.price)})`,
    point: over.point,
    overPrice: over.price,
    underPrice: under.price,
    overProb: americanToProb(over.price),
    underProb: americanToProb(under.price)
  };
}

function deriveSpreadFavorite(moneylineData) {
  if (moneylineData.homeProb == null || moneylineData.awayProb == null) return null;
  if (moneylineData.homeProb > moneylineData.awayProb) return "home";
  if (moneylineData.awayProb > moneylineData.homeProb) return "away";
  return null;
}

function passesLineupScenario(outcome, marketKey, lineupContext) {
  if (!outcome || !outcome.description) return true;
  if (marketKey.indexOf("pitcher_") === 0) return true;
  const playerName = normalizeName(outcome.description);
  const activeLineup = getActiveLineupPlayers(lineupContext);
  if (!activeLineup.length) return true;
  return activeLineup.some(name => {
    const n = normalizeName(name);
    return n === playerName || n.includes(playerName) || playerName.includes(n);
  });
}

function getActiveLineupPlayers(lineupContext) {
  const mode = lineupContext.lineupMode;
  const source = mode === "official" ? lineupContext.officialLineups : lineupContext.projectedLineups;
  const players = [];
  ["away", "home"].forEach(side => {
    if (source && source[side] && Array.isArray(source[side].players)) {
      source[side].players.forEach(p => {
        if (typeof p === "string") players.push(p);
        else if (p && p.name) players.push(p.name);
      });
    }
  });
  return players;
}

function buildPropLabel(marketKey, outcome) {
  const pointText = outcome.point !== undefined && outcome.point !== null
    ? ` ${outcome.name} ${outcome.point}`
    : ` ${outcome.name}`;
  switch (marketKey) {
    case "pitcher_strikeouts": return `Pitcher Strikeouts${pointText}`;
    case "pitcher_outs": return `Pitcher Outs${pointText}`;
    case "batter_total_bases": return `Total Bases${pointText}`;
    case "batter_hits": return `Hits${pointText}`;
    case "batter_home_runs": return `Home Runs${pointText}`;
    default: return `${marketKey}${pointText}`;
  }
}

function americanToProb(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return null;
  const p = Number(price);
  if (p < 0) return Math.abs(p) / (Math.abs(p) + 100);
  return 100 / (p + 100);
}

function probToAmerican(prob) {
  if (prob == null || prob <= 0 || prob >= 1) return null;
  if (prob >= 0.5) return Math.round((-100 * prob) / (1 - prob));
  return Math.round((100 * (1 - prob)) / prob);
}

function formatAmerican(price) {
  if (price === null || price === undefined) return "N/A";
  return Number(price) > 0 ? `+${price}` : `${price}`;
}

function formatSpread(point) {
  if (point === null || point === undefined) return "N/A";
  return Number(point) > 0 ? `+${point}` : `${point}`;
}

function toPctNumber(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 100);
}

function toEdgePct(modelProb, marketProb) {
  if (modelProb == null || marketProb == null) return null;
  return round1((Number(modelProb) - Number(marketProb)) * 100);
}

function signedPct(value) {
  if (value == null) return "N/A";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${round1(n)}%`;
}

function formatSignedNumber(value) {
  if (value == null || !isFinite(Number(value))) return "N/A";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${round2(n)}`;
}

function matchupKey(away, home) {
  return `${normalizeTeamName(away)}@@${normalizeTeamName(home)}`;
}

function normalizeTeamName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Chi White Sox$/i, "Chicago White Sox")
    .replace(/^Chi Cubs$/i, "Chicago Cubs")
    .replace(/^NY Yankees$/i, "New York Yankees")
    .replace(/^NY Mets$/i, "New York Mets")
    .replace(/^LA Angels$/i, "Los Angeles Angels")
    .replace(/^LA Dodgers$/i, "Los Angeles Dodgers")
    .replace(/^DBacks$/i, "Arizona Diamondbacks")
    .replace(/^Athletics$/i, "Athletics");
}

function teamAbbrevHint(name) {
  const map = {
    "Minnesota Twins": "MIN",
    "Baltimore Orioles": "BAL",
    "Texas Rangers": "TEX",
    "Philadelphia Phillies": "PHI",
    "Washington Nationals": "WSH",
    "Chicago Cubs": "CHC",
    "Cleveland Guardians": "CLE",
    "Seattle Mariners": "SEA",
    "New York Yankees": "NYY",
    "New York Mets": "NYM",
    "Los Angeles Angels": "LAA",
    "Los Angeles Dodgers": "LAD",
    "Chicago White Sox": "CWS",
    "Boston Red Sox": "BOS",
    "Athletics": "ATH",
    "Arizona Diamondbacks": "ARI"
  };
  return map[name] || name.split(" ").map(w => w[0]).join("").toUpperCase();
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n)));
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}