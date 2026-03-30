module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
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
        debugUrl: baseUrl
      });
    }

    const oddsData = await oddsResponse.json();
    const upcomingGames = (Array.isArray(oddsData) ? oddsData : []).filter(game => {
      if (!game || !game.commence_time) return false;
      return new Date(game.commence_time).getTime() > Date.now();
    });

    const limitedGames = upcomingGames.slice(0, 12);

    const scheduleCache = new Map();
    const teamScheduleCache = new Map();

    const games = await Promise.all(
      limitedGames.map(async (game, index) => {
        const bookmaker = Array.isArray(game.bookmakers) ? game.bookmakers[0] : null;
        const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = normalizeTeamName(game.home_team || "Home");
        const awayTeam = normalizeTeamName(game.away_team || "Away");
        const commenceTime = game.commence_time || null;

        const moneylineData = parseMoneyline(h2hMarket, homeTeam, awayTeam);
        const spreadData = parseSpreads(spreadMarket, homeTeam, awayTeam);
        const totalData = parseTotals(totalMarket);

        const currentGameContext = await buildCurrentGameContext({
          homeTeam,
          awayTeam,
          commenceTime,
          scheduleCache
        });

        const lineupContext = buildLineupContext({
          homeTeam,
          awayTeam,
          mlbLineups
        });

        const scheduleTravelContext = await buildScheduleTravelContext({
          homeTeam,
          awayTeam,
          commenceTime,
          currentGameContext,
          teamScheduleCache
        });

        const propResult = await fetchTopPropForEvent(game.id, apiKey, lineupContext);

        const { componentScores, componentScoresNumeric } = buildComponentScores({
          moneylineData,
          totalData,
          lineupContext,
          scheduleTravelContext,
          currentGameContext
        });

        const modelOutputs = buildModelOutputs({
          componentScoresNumeric,
          moneylineData,
          totalData,
          lineupContext,
          propResult
        });

        const recommendation = buildRecommendation({
          homeTeam,
          awayTeam,
          moneylineData,
          totalData,
          modelOutputs,
          componentScoresNumeric,
          propResult
        });

        return {
          id: String(index + 1),
          eventId: game.id,
          rawCommenceTime: commenceTime || null,
          time: commenceTime ? formatEtTime(commenceTime) : "TBD",
          away: awayTeam,
          home: homeTeam,

          moneyline: moneylineData.display,
          runLine: spreadData.display,
          total: totalData.display,

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

          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource,
          officialLineupAvailable: lineupContext.officialLineupAvailable,
          projectedLineupUsed: lineupContext.projectedLineupUsed,
          projectedLineups: lineupContext.projectedLineups,
          officialLineups: lineupContext.officialLineups,

          bestBet: recommendation.bestBet,
          bestBetType: recommendation.bestBetType,
          confidence: recommendation.confidence,
          confidenceScore: recommendation.confidenceScore,
          recommendedTiming: recommendation.recommendedTiming,
          recommendedStakeUnits: recommendation.recommendedStakeUnits,
          reasons: recommendation.reasons,

          topPropOverall: propResult.topProp,
          topPropOverallReason: propResult.topProp
            ? buildTopPropOverallReason(propResult.topProp, lineupContext)
            : propResult.status,
          propStatus: propResult.status,

          componentScores,
          riskWarnings: recommendation.riskWarnings
        };
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      notes: [
        "Schedule/rest/travel driver now uses previous-game context and approximate travel burden.",
        "Lineup driver uses MLB official lineups when both batting orders are confirmed.",
        "Other driver cards now return explicit status text instead of blank placeholders."
      ],
      games
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not load odds data",
      details: error && error.message ? error.message : String(error)
    });
  }
};

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

  const cleaned = html
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
      const block = lines.slice(i, Math.min(i + 180, lines.length));

      const awayMarker =
        findIndexInBlock(block, `${teamAbbrevHint(away)} Lineup`) ??
        findIndexInBlock(block, `${away} Lineup`);

      const homeMarker =
        findIndexInBlock(block, `${teamAbbrevHint(home)} Lineup`) ??
        findIndexInBlock(block, `${home} Lineup`);

      const awayPlayers = awayMarker !== null ? extractNinePlayers(block, awayMarker + 1) : [];
      const homePlayers = homeMarker !== null ? extractNinePlayers(block, homeMarker + 1) : [];

      map[key] = {
        awayTeam: away,
        homeTeam: home,
        awayPlayers,
        homePlayers
      };
    }
  }

  return map;
}

function findIndexInBlock(block, marker) {
  for (let i = 0; i < block.length; i++) {
    if (block[i] === marker) return i;
  }
  return null;
}

function extractNinePlayers(block, startIndex) {
  const players = [];
  for (let i = startIndex; i < block.length && players.length < 9; i++) {
    const line = block[i];

    if (/^\d+\.\s+TBD$/i.test(line)) {
      return [];
    }

    const withPos = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]+$/);
    if (withPos) {
      players.push(withPos[1].trim());
      continue;
    }

    const noPos = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)$/);
    if (noPos) {
      players.push(noPos[1].trim());
      continue;
    }
  }
  return players.length === 9 ? players : [];
}

function buildLineupContext({ homeTeam, awayTeam, mlbLineups }) {
  const key = matchupKey(awayTeam, homeTeam);
  const official = mlbLineups[key];

  const hasOfficial =
    official &&
    Array.isArray(official.awayPlayers) &&
    official.awayPlayers.length === 9 &&
    Array.isArray(official.homePlayers) &&
    official.homePlayers.length === 9;

  const projectedLineups = {
    away: buildProjectedLineupShell(awayTeam),
    home: buildProjectedLineupShell(homeTeam)
  };

  const officialLineups = hasOfficial
    ? {
        away: {
          team: awayTeam,
          status: "official",
          players: official.awayPlayers.map(name => ({ name }))
        },
        home: {
          team: homeTeam,
          status: "official",
          players: official.homePlayers.map(name => ({ name }))
        }
      }
    : {
        away: null,
        home: null
      };

  return {
    lineupMode: hasOfficial ? "official" : "projected",
    lineupSource: hasOfficial ? "MLB Starting Lineups" : "Projected lineup feed",
    officialLineupAvailable: hasOfficial,
    projectedLineupUsed: !hasOfficial,
    projectedLineups,
    officialLineups,
    display: hasOfficial
      ? "Official lineups posted for both teams."
      : "Projected mode — official lineups not fully posted yet."
  };
}

function buildProjectedLineupShell(teamName) {
  return {
    team: teamName,
    status: "projected",
    players: [],
    note: "Projected lineup placeholder. Connect projected lineup feed to populate."
  };
}

async function buildCurrentGameContext({ homeTeam, awayTeam, commenceTime, scheduleCache }) {
  const dateEt = getEtDateString(commenceTime || new Date().toISOString());
  let schedule = scheduleCache.get(dateEt);

  if (!schedule) {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateEt}`);
      schedule = response.ok ? await response.json() : null;
    } catch (e) {
      schedule = null;
    }
    scheduleCache.set(dateEt, schedule);
  }

  const matchedGame = findMatchingGameInSchedule(schedule, awayTeam, homeTeam);
  const homeVenue = TEAM_HOME_CONTEXT[homeTeam] || null;

  return {
    gamePk: matchedGame ? matchedGame.gamePk : null,
    currentVenue: homeVenue,
    currentScheduleGame: matchedGame || null,
    parkWeatherDisplay: buildParkWeatherDisplay(homeVenue),
    parkWeatherScore: 0
  };
}

async function buildScheduleTravelContext({
  homeTeam,
  awayTeam,
  commenceTime,
  currentGameContext,
  teamScheduleCache
}) {
  const currentStart = commenceTime ? new Date(commenceTime) : new Date();
  const homePrev = await fetchPreviousGameContext(homeTeam, currentStart, teamScheduleCache);
  const awayPrev = await fetchPreviousGameContext(awayTeam, currentStart, teamScheduleCache);

  const currentVenue = currentGameContext.currentVenue || TEAM_HOME_CONTEXT[homeTeam] || null;

  const homeRestInfo = deriveRestTravelInfo(homePrev, currentVenue, currentStart);
  const awayRestInfo = deriveRestTravelInfo(awayPrev, currentVenue, currentStart);

  const sideEdge = round2(
    (awayRestInfo.penaltyScore - homeRestInfo.penaltyScore)
  );

  const bullpenEdge = round2(
    (awayRestInfo.bullpenPenalty - homeRestInfo.bullpenPenalty)
  );

  return {
    display:
      `Away: ${awayRestInfo.display} | Home: ${homeRestInfo.display}`,
    score: clamp(sideEdge, -2, 2),
    bullpenDisplay:
      `Away bullpen: ${awayRestInfo.bullpenDisplay} | Home bullpen: ${homeRestInfo.bullpenDisplay}`,
    bullpenScore: clamp(bullpenEdge, -2, 2),
    home: homeRestInfo,
    away: awayRestInfo
  };
}

async function fetchPreviousGameContext(teamName, currentStart, teamScheduleCache) {
  const teamId = TEAM_IDS[teamName];
  if (!teamId) {
    return null;
  }

  const endDate = getEtDateString(currentStart.toISOString());
  const startDate = getEtDateString(new Date(currentStart.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString());
  const cacheKey = `${teamId}|${startDate}|${endDate}`;

  let schedule = teamScheduleCache.get(cacheKey);
  if (!schedule) {
    try {
      const url =
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}` +
        `&startDate=${startDate}&endDate=${endDate}&hydrate=linescore`;
      const response = await fetch(url);
      schedule = response.ok ? await response.json() : null;
    } catch (e) {
      schedule = null;
    }
    teamScheduleCache.set(cacheKey, schedule);
  }

  const previous = pickMostRecentCompletedGame(schedule, teamId, currentStart);
  if (!previous) return null;

  const prevHomeTeam = normalizeTeamName(previous.teams?.home?.team?.name || "");
  const prevVenue = TEAM_HOME_CONTEXT[prevHomeTeam] || null;

  return {
    gamePk: previous.gamePk || null,
    teamId,
    previousGame: previous,
    venue: prevVenue
  };
}

function pickMostRecentCompletedGame(schedule, teamId, currentStart) {
  const allGames = flattenScheduleGames(schedule).filter(game => {
    const gameDate = new Date(game.gameDate);
    const teamInGame =
      game.teams?.away?.team?.id === teamId ||
      game.teams?.home?.team?.id === teamId;

    const state = String(game.status?.detailedState || "");
    const isComplete = /final|game over/i.test(state);

    return teamInGame && isComplete && gameDate.getTime() < currentStart.getTime();
  });

  allGames.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  return allGames[0] || null;
}

function deriveRestTravelInfo(prevContext, currentVenue, currentStart) {
  if (!prevContext || !prevContext.previousGame) {
    return {
      hoursRest: null,
      travelMiles: null,
      timeZoneShift: null,
      extraInnings: false,
      penaltyScore: 0,
      bullpenPenalty: 0,
      display: "No recent completed game found.",
      bullpenDisplay: "No recent bullpen proxy available."
    };
  }

  const previousGame = prevContext.previousGame;
  const prevVenue = prevContext.venue;

  const prevStart = new Date(previousGame.gameDate);
  const innings = Number(previousGame.linescore?.currentInning || previousGame.linescore?.scheduledInnings || 9);
  const estimatedDurationHours = 3 + Math.max(0, innings - 9) * 0.25;
  const prevEnd = new Date(prevStart.getTime() + estimatedDurationHours * 60 * 60 * 1000);

  const hoursRest = round1((currentStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60));
  const travelMiles =
    prevVenue && currentVenue
      ? round0(haversineMiles(prevVenue.lat, prevVenue.lon, currentVenue.lat, currentVenue.lon))
      : null;

  const timeZoneShift =
    prevVenue && currentVenue
      ? Math.abs((currentVenue.utcOffset || 0) - (prevVenue.utcOffset || 0))
      : null;

  const prevLocalHour = getLocalHour(prevStart, prevVenue ? prevVenue.timeZone : "America/New_York");
  const currentLocalHour = getLocalHour(currentStart, currentVenue ? currentVenue.timeZone : "America/New_York");
  const nightToDayFlag = prevLocalHour >= 18 && currentLocalHour <= 13 && hoursRest !== null && hoursRest < 20;
  const extraInnings = innings > 9;
  const sameVenue = !!(prevVenue && currentVenue && prevVenue.name === currentVenue.name);

  let penalty = 0;

  if (hoursRest !== null) {
    if (hoursRest < 16) penalty += 1.2;
    else if (hoursRest < 20) penalty += 0.7;
    else if (hoursRest < 24) penalty += 0.3;
    else if (hoursRest >= 40) penalty -= 0.2;
  }

  if (nightToDayFlag) penalty += 0.7;
  if (extraInnings) penalty += 0.5;

  if (travelMiles !== null) {
    if (travelMiles >= 1500) penalty += 1.0;
    else if (travelMiles >= 900) penalty += 0.7;
    else if (travelMiles >= 300) penalty += 0.3;
  }

  if (timeZoneShift !== null) {
    if (timeZoneShift >= 2) penalty += 0.5;
    else if (timeZoneShift >= 1) penalty += 0.2;
  }

  if (sameVenue) penalty -= 0.2;

  const bullpenPenalty = clamp(
    (hoursRest !== null && hoursRest < 20 ? 0.4 : 0) +
      (extraInnings ? 0.6 : 0) +
      (nightToDayFlag ? 0.3 : 0),
    0,
    2
  );

  const displayParts = [];
  displayParts.push(hoursRest !== null ? `${hoursRest}h rest` : "rest unknown");
  displayParts.push(travelMiles !== null ? `${travelMiles} mi travel` : "travel unknown");
  displayParts.push(timeZoneShift !== null ? `${timeZoneShift} TZ` : "TZ unknown");
  if (nightToDayFlag) displayParts.push("night→day");
  if (extraInnings) displayParts.push("extra innings");
  if (sameVenue) displayParts.push("same venue");

  const bullpenBits = [];
  if (extraInnings) bullpenBits.push("extra innings last game");
  if (nightToDayFlag) bullpenBits.push("night→day turnaround");
  if (hoursRest !== null && hoursRest < 20) bullpenBits.push("short rest");
  if (!bullpenBits.length) bullpenBits.push("normal proxy");

  return {
    hoursRest,
    travelMiles,
    timeZoneShift,
    extraInnings,
    nightToDayFlag,
    sameVenue,
    penaltyScore: clamp(penalty, -1, 2),
    bullpenPenalty,
    display: displayParts.join(", "),
    bullpenDisplay: bullpenBits.join(", ")
  };
}

function buildComponentScores({
  moneylineData,
  totalData,
  lineupContext,
  scheduleTravelContext,
  currentGameContext
}) {
  const homeMarketLean =
    moneylineData.homeProb !== null && moneylineData.awayProb !== null
      ? clamp((moneylineData.homeProb - moneylineData.awayProb) * 4, -2, 2)
      : 0;

  const totalMarketLean =
    totalData.overProb !== null && totalData.underProb !== null
      ? clamp((totalData.overProb - totalData.underProb) * 4, -2, 2)
      : 0;

  const lineupNumeric = lineupContext.officialLineupAvailable ? 0.25 : 0.0;

  const componentScores = {
    side: {
      startingPitcher: "Starter-form driver pending dedicated pitcher-form feed.",
      bullpen: scheduleTravelContext.bullpenDisplay,
      lineup: lineupContext.display,
      offenseVsHand: "Offense-vs-hand split driver pending split feed.",
      defense: "Defense / catcher driver pending fielding and framing feed.",
      parkWeather: currentGameContext.parkWeatherDisplay,
      scheduleTravel: scheduleTravelContext.display,
      marketContext: `Market lean ${signedPct(round1(homeMarketLean * 10))}`
    },
    total: {
      starterRunSuppression: "Starter-total driver pending dedicated starter feed.",
      bullpenRunSuppression: scheduleTravelContext.bullpenDisplay,
      offenseQuality: "Offense-quality driver pending advanced hitting feed.",
      lineups: lineupContext.display,
      parkFactor: currentGameContext.parkWeatherDisplay,
      weather: currentGameContext.parkWeatherDisplay,
      catcherDefense: "Catcher-defense driver pending catcher feed.",
      marketContext: `Market lean ${signedPct(round1(totalMarketLean * 10))}`
    }
  };

  const componentScoresNumeric = {
    side: {
      startingPitcher: 0,
      bullpen: scheduleTravelContext.bullpenScore,
      lineup: lineupNumeric,
      offenseVsHand: 0,
      defense: 0,
      parkWeather: currentGameContext.parkWeatherScore || 0,
      scheduleTravel: scheduleTravelContext.score,
      marketContext: round2(homeMarketLean)
    },
    total: {
      starterRunSuppression: 0,
      bullpenRunSuppression: -scheduleTravelContext.bullpenScore * 0.15,
      offenseQuality: 0,
      lineups: lineupNumeric,
      parkFactor: 0,
      weather: 0,
      catcherDefense: 0,
      marketContext: round2(totalMarketLean)
    }
  };

  return { componentScores, componentScoresNumeric };
}

function buildModelOutputs({ componentScoresNumeric, moneylineData, totalData, lineupContext, propResult }) {
  const sideComposite =
    (0.28 * componentScoresNumeric.side.startingPitcher) +
    (0.16 * componentScoresNumeric.side.bullpen) +
    (0.14 * componentScoresNumeric.side.lineup) +
    (0.12 * componentScoresNumeric.side.offenseVsHand) +
    (0.08 * componentScoresNumeric.side.defense) +
    (0.06 * componentScoresNumeric.side.parkWeather) +
    (0.11 * componentScoresNumeric.side.scheduleTravel) +
    (0.05 * componentScoresNumeric.side.marketContext);

  const totalComposite =
    (0.24 * componentScoresNumeric.total.starterRunSuppression) +
    (0.16 * componentScoresNumeric.total.bullpenRunSuppression) +
    (0.18 * componentScoresNumeric.total.offenseQuality) +
    (0.10 * componentScoresNumeric.total.lineups) +
    (0.12 * componentScoresNumeric.total.parkFactor) +
    (0.10 * componentScoresNumeric.total.weather) +
    (0.05 * componentScoresNumeric.total.catcherDefense) +
    (0.05 * componentScoresNumeric.total.marketContext);

  const marketHomeProb = moneylineData.homeProb ?? 0.50;
  const marketAwayProb = moneylineData.awayProb ?? 0.50;

  const homeWinProb = clamp(marketHomeProb + (sideComposite * 0.04), 0.15, 0.85);
  const awayWinProb = clamp(1 - homeWinProb, 0.15, 0.85);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketTotalLine = totalData.point ?? null;
  const marketOverProb = totalData.overProb ?? 0.50;

  let fairTotal = null;
  if (marketTotalLine !== null) {
    fairTotal = round1(marketTotalLine + (totalComposite * 0.45));
  }

  const fairOverProb = clamp(marketOverProb + (totalComposite * 0.05), 0.15, 0.85);
  const fairUnderProb = clamp(1 - fairOverProb, 0.15, 0.85);

  const marketSpreadFav = deriveSpreadFavorite(moneylineData);
  const homeRunLineConfidence = clamp(homeWinProb + (marketSpreadFav === "home" ? 0.06 : -0.02), 0.10, 0.90);
  const awayRunLineConfidence = clamp(awayWinProb + (marketSpreadFav === "away" ? 0.06 : -0.02), 0.10, 0.90);

  const propConfidenceCap = lineupContext.officialLineupAvailable ? 100 : 69;
  if (propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
    propResult.topProp.modelProb = Math.min(propResult.topProp.modelProb, propConfidenceCap);
    propResult.topProp.confidence = propResult.topProp.modelProb >= 60 ? "Medium" : "Low";
    if (lineupContext.officialLineupAvailable && propResult.topProp.modelProb >= 70) {
      propResult.topProp.confidence = "High";
    }
  }

  return {
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

function buildRecommendation({
  homeTeam,
  awayTeam,
  moneylineData,
  totalData,
  modelOutputs,
  componentScoresNumeric,
  propResult
}) {
  const candidates = [];

  if (typeof modelOutputs.homeEdgePct === "number") {
    candidates.push({
      bestBet: `${homeTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.homeEdgePct,
      reasons: buildSideReasons(homeTeam, "home", modelOutputs, componentScoresNumeric, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.homeEdgePct)
    });
  }

  if (typeof modelOutputs.awayEdgePct === "number") {
    candidates.push({
      bestBet: `${awayTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.awayEdgePct,
      reasons: buildSideReasons(awayTeam, "away", modelOutputs, componentScoresNumeric, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.awayEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.overEdgePct === "number") {
    candidates.push({
      bestBet: `Over ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.overEdgePct,
      reasons: buildTotalReasons("Over", totalData.point, modelOutputs),
      scoreForConfidence: Math.abs(modelOutputs.overEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.underEdgePct === "number") {
    candidates.push({
      bestBet: `Under ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.underEdgePct,
      reasons: buildTotalReasons("Under", totalData.point, modelOutputs),
      scoreForConfidence: Math.abs(modelOutputs.underEdgePct)
    });
  }

  if (propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
    const propEdge = Math.abs(propResult.topProp.modelProb - 50);
    candidates.push({
      bestBet: `${propResult.topProp.player} ${propResult.topProp.market}`,
      bestBetType: "Prop",
      edge: propEdge,
      reasons: [
        `Lineup mode used: ${propResult.lineupMode}.`,
        `Lineup source used: ${propResult.lineupSource}.`,
        `Implied market-based prop probability is ${propResult.topProp.modelProb}%.`,
        propResult.lineupMode === "projected"
          ? "Projected-lineup props are capped until official lineups are posted."
          : "Official lineup mode is active for this prop."
      ],
      scoreForConfidence: propEdge
    });
  }

  const positiveCandidates = candidates.filter(c => typeof c.edge === "number" && c.edge > 0);
  const best = positiveCandidates.sort((a, b) => b.edge - a.edge)[0];

  if (!best) {
    return {
      bestBet: "Pass",
      bestBetType: "Pass",
      confidence: "Low",
      confidenceScore: 0,
      recommendedTiming: "Pass",
      recommendedStakeUnits: 0,
      reasons: [
        "No positive edge was created by the current model.",
        "No bet is better than a bad bet."
      ],
      riskWarnings: buildRiskWarnings(componentScoresNumeric)
    };
  }

  const confidenceScore = round1(best.scoreForConfidence);
  const confidence = confidenceFromEdge(best.scoreForConfidence);
  const recommendedTiming = timingFromContext(componentScoresNumeric, best.bestBetType, best.edge);
  const recommendedStakeUnits = stakeFromConfidence(confidence);

  return {
    bestBet: best.bestBet,
    bestBetType: best.bestBetType,
    confidence,
    confidenceScore,
    recommendedTiming,
    recommendedStakeUnits,
    reasons: best.reasons,
    riskWarnings: buildRiskWarnings(componentScoresNumeric)
  };
}

function buildSideReasons(teamName, side, modelOutputs, componentScoresNumeric, moneylineData) {
  const winProb = side === "home" ? modelOutputs.homeWinProb : modelOutputs.awayWinProb;
  const fairPrice = side === "home" ? modelOutputs.fairMlHome : modelOutputs.fairMlAway;
  const edgePct = side === "home" ? modelOutputs.homeEdgePct : modelOutputs.awayEdgePct;
  const marketProb = side === "home" ? moneylineData.homeProb : moneylineData.awayProb;

  return [
    `${teamName} fair moneyline projects to ${formatAmerican(fairPrice)}.`,
    `Model win probability is ${winProb}% versus market implied ${toPctNumber(marketProb)}%.`,
    `Estimated edge is ${signedPct(edgePct)}.`,
    `Schedule / travel numeric contribution: ${signedPct(round1(componentScoresNumeric.side.scheduleTravel * 10))}.`
  ];
}

function buildTotalReasons(direction, line, modelOutputs) {
  const edge = direction === "Over" ? modelOutputs.overEdgePct : modelOutputs.underEdgePct;

  return [
    `Fair total projects to ${modelOutputs.fairTotal !== null ? modelOutputs.fairTotal : "N/A"} against market ${line}.`,
    `${direction} edge is estimated at ${signedPct(edge)}.`,
    "Current total model improves once weather, park, bullpen, and catcher inputs are fully live."
  ];
}

function buildRiskWarnings(componentScoresNumeric) {
  const warnings = [];
  if (componentScoresNumeric.side.startingPitcher === 0) warnings.push("Starter-form model is not fully wired yet.");
  if (componentScoresNumeric.side.offenseVsHand === 0) warnings.push("Offense-vs-hand split model is not fully wired yet.");
  if (componentScoresNumeric.side.defense === 0) warnings.push("Defense/catcher model is not fully wired yet.");
  return warnings;
}

function timingFromContext(componentScoresNumeric, bestBetType, edge) {
  if (edge <= 0) return "Pass";
  if (bestBetType === "Total" && componentScoresNumeric.total.weather === 0) return "Wait for weather";
  if ((bestBetType === "Side" || bestBetType === "Prop") && componentScoresNumeric.side.lineup === 0) return "Wait for lineup";
  if (edge >= 4) return "Bet now";
  return "Wait for better number";
}

function stakeFromConfidence(confidence) {
  if (confidence === "High") return 1.5;
  if (confidence === "Medium") return 1.0;
  if (confidence === "Low") return 0.5;
  return 0;
}

function confidenceFromEdge(edgeAbsPct) {
  if (edgeAbsPct >= 6) return "High";
  if (edgeAbsPct >= 3) return "Medium";
  return "Low";
}

async function fetchTopPropForEvent(eventId, apiKey, lineupContext) {
  const propMarketGroups = [
    ["pitcher_strikeouts"],
    ["pitcher_outs"],
    ["batter_hits", "batter_total_bases"],
    ["batter_home_runs"]
  ];

  const triedMarkets = [];

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

      let bestProp = null;

      for (const market of markets) {
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        for (const outcome of outcomes) {
          if (!passesLineupScenario(outcome, market.key, lineupContext)) continue;

          const score = scorePropOutcome(market.key, outcome, lineupContext);
          if (!bestProp || score > bestProp._score) {
            bestProp = {
              player: outcome.description || outcome.name || "Unknown Player",
              market: buildPropLabel(market.key, outcome),
              modelProb: propPriceToProb(outcome.price),
              reasons: buildPropReasons(market.key, outcome, lineupContext),
              lineupMode: lineupContext.lineupMode,
              lineupSource: lineupContext.lineupSource,
              rankingScore: score,
              _score: score
            };
          }
        }
      }

      if (bestProp) {
        delete bestProp._score;
        return {
          topProp: bestProp,
          status: lineupContext.lineupMode === "official"
            ? "Live BetMGM prop returned using official lineup mode."
            : "Live BetMGM prop returned using projected lineup mode.",
          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource
        };
      }
    } catch (error) {}
  }

  return {
    topProp: null,
    status: "No supported BetMGM prop returned. Checked: " + triedMarkets.join(" | "),
    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource
  };
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported BetMGM prop returned.";

  const reasons = [];
  reasons.push("This was the highest-scoring supported prop returned by BetMGM.");
  if (typeof topProp.rankingScore === "number") reasons.push(`Ranking score: ${topProp.rankingScore}.`);
  reasons.push(`Market: ${topProp.market}.`);
  if (typeof topProp.modelProb === "number") reasons.push(`Its current model probability graded at ${topProp.modelProb}%.`);
  if (lineupContext.lineupMode === "official") {
    reasons.push("It was evaluated using official lineup mode, which allows stronger confidence.");
  } else {
    reasons.push("It was evaluated using projected lineup mode, so confidence is capped until official lineups post.");
  }
  if (Array.isArray(topProp.reasons) && topProp.reasons.length) reasons.push(topProp.reasons[0]);
  return reasons.join(" ");
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

function scorePropOutcome(marketKey, outcome, lineupContext) {
  let score = 0;
  if (outcome.name === "Over") score += 20;
  if (typeof outcome.price === "number" && outcome.price < 0) {
    score += Math.min(Math.abs(outcome.price), 250) / 10;
  }
  if (marketKey === "pitcher_strikeouts") score += 8;
  if (marketKey === "pitcher_outs") score += 7;
  if (marketKey === "batter_total_bases") score += 6;
  if (marketKey === "batter_hits") score += 5;
  if (marketKey === "batter_home_runs") score += 2;

  if (lineupContext.lineupMode === "official") score += 8;
  else score -= 4;

  return score;
}

function buildPropLabel(marketKey, outcome) {
  const pointText =
    outcome.point !== undefined && outcome.point !== null
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

function buildPropReasons(marketKey, outcome, lineupContext) {
  const reasons = [];
  reasons.push(`Lineup mode: ${lineupContext.lineupMode}.`);
  reasons.push(`Lineup source: ${lineupContext.lineupSource}.`);

  if (outcome.name === "Over") reasons.push("Current phase-1 logic prefers the over side.");
  else if (outcome.name === "Under") reasons.push("Current phase-1 logic prefers the under side.");

  if (typeof outcome.price === "number") {
    if (outcome.price < 0) reasons.push(`Book prices this as a favored outcome at ${formatAmerican(outcome.price)}.`);
    else reasons.push(`Book prices this as a plus-money outcome at ${formatAmerican(outcome.price)}.`);
  }

  if (lineupContext.lineupMode === "projected") {
    reasons.push("Projected-lineup props are capped until official lineups are connected.");
  } else {
    reasons.push("Official lineup mode supports stronger prop confidence.");
  }

  switch (marketKey) {
    case "pitcher_strikeouts": reasons.push("Pitcher strikeout props are a strong first prop category to track."); break;
    case "pitcher_outs": reasons.push("Pitcher outs can be steadier than higher-variance hitter props."); break;
    case "batter_total_bases": reasons.push("Total bases props are useful for power-hitter evaluation."); break;
    case "batter_hits": reasons.push("Hits props are generally steadier than home run props."); break;
    case "batter_home_runs": reasons.push("Home run props are more volatile than most prop types."); break;
  }

  return reasons;
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
    return { display: "N/A", homePoint: null, awayPoint: null, homePrice: null, awayPrice: null };
  }

  const home = market.outcomes.find(o => normalizeTeamName(o.name) === homeTeam);
  const away = market.outcomes.find(o => normalizeTeamName(o.name) === awayTeam);

  if (!home || !away) {
    return { display: "N/A", homePoint: null, awayPoint: null, homePrice: null, awayPrice: null };
  }

  return {
    display:
      `${awayTeam} ${formatSpread(away.point)} (${formatAmerican(away.price)}) / ` +
      `${homeTeam} ${formatSpread(home.point)} (${formatAmerican(home.price)})`,
    homePoint: home.point,
    awayPoint: away.point,
    homePrice: home.price,
    awayPrice: away.price
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

function findMatchingGameInSchedule(scheduleJson, awayTeam, homeTeam) {
  const games = flattenScheduleGames(scheduleJson);
  return games.find(game => {
    const away = normalizeTeamName(game.teams?.away?.team?.name || "");
    const home = normalizeTeamName(game.teams?.home?.team?.name || "");
    return away === awayTeam && home === homeTeam;
  }) || null;
}

function flattenScheduleGames(scheduleJson) {
  const dates = Array.isArray(scheduleJson?.dates) ? scheduleJson.dates : [];
  const out = [];
  for (const d of dates) {
    if (Array.isArray(d.games)) out.push(...d.games);
  }
  return out;
}

function buildParkWeatherDisplay(venue) {
  if (!venue) return "Park / weather driver pending venue context.";
  if (venue.roof === "roof" || venue.roof === "retractable") {
    return `${venue.name}: roof-capable park; live weather feed not wired.`;
  }
  return `${venue.name}: open-air park; live weather feed not wired.`;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getLocalHour(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false
  }).format(date);
  return Number(parts);
}

function getEtDateString(isoString) {
  return new Date(isoString).toLocaleDateString("en-CA", {
    timeZone: "America/New_York"
  });
}

function formatEtTime(isoString) {
  const t = new Date(isoString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  });
  return t + " ET";
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
    .replace(/^D-backs$/i, "Arizona Diamondbacks")
    .replace(/^A's$/i, "Athletics");
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

function teamAbbrevHint(name) {
  return TEAM_ABBREV[name] || name.split(" ").map(w => w[0]).join("").toUpperCase();
}

function deriveSpreadFavorite(moneylineData) {
  if (moneylineData.homeProb === null || moneylineData.awayProb === null) return null;
  if (moneylineData.homeProb > moneylineData.awayProb) return "home";
  if (moneylineData.awayProb > moneylineData.homeProb) return "away";
  return null;
}

function americanToProb(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return null;
  const p = Number(price);
  if (p < 0) return Math.abs(p) / (Math.abs(p) + 100);
  return 100 / (p + 100);
}

function probToAmerican(prob) {
  if (prob === null || prob === undefined) return null;
  if (prob <= 0 || prob >= 1) return null;
  if (prob >= 0.5) return Math.round((-100 * prob) / (1 - prob));
  return Math.round((100 * (1 - prob)) / prob);
}

function propPriceToProb(price) {
  const prob = americanToProb(price);
  if (prob === null) return null;
  return Math.round(prob * 100);
}

function formatAmerican(price) {
  if (price === null || price === undefined) return "N/A";
  return price > 0 ? `+${price}` : `${price}`;
}

function formatSpread(point) {
  if (point === null || point === undefined) return "N/A";
  return point > 0 ? `+${point}` : `${point}`;
}

function toPctNumber(value) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100);
}

function toEdgePct(modelProb, marketProb) {
  if (modelProb === null || marketProb === null || modelProb === undefined || marketProb === undefined) return null;
  return round1((modelProb - marketProb) * 100);
}

function signedPct(value) {
  if (value === null || value === undefined) return "N/A";
  return `${value > 0 ? "+" : ""}${round1(value)}%`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round0(n) {
  return Math.round(n);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const TEAM_IDS = {
  "Arizona Diamondbacks": 109,
  "Athletics": 133,
  "Atlanta Braves": 144,
  "Baltimore Orioles": 110,
  "Boston Red Sox": 111,
  "Chicago Cubs": 112,
  "Chicago White Sox": 145,
  "Cincinnati Reds": 113,
  "Cleveland Guardians": 114,
  "Colorado Rockies": 115,
  "Detroit Tigers": 116,
  "Houston Astros": 117,
  "Kansas City Royals": 118,
  "Los Angeles Angels": 108,
  "Los Angeles Dodgers": 119,
  "Miami Marlins": 146,
  "Milwaukee Brewers": 158,
  "Minnesota Twins": 142,
  "New York Mets": 121,
  "New York Yankees": 147,
  "Philadelphia Phillies": 143,
  "Pittsburgh Pirates": 134,
  "San Diego Padres": 135,
  "San Francisco Giants": 137,
  "Seattle Mariners": 136,
  "St. Louis Cardinals": 138,
  "Tampa Bay Rays": 139,
  "Texas Rangers": 140,
  "Toronto Blue Jays": 141,
  "Washington Nationals": 120
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

const TEAM_HOME_CONTEXT = {
  "Arizona Diamondbacks": { name: "Chase Field", lat: 33.4453, lon: -112.0667, timeZone: "America/Phoenix", utcOffset: -7, roof: "retractable" },
  "Athletics": { name: "Sutter Health Park", lat: 38.5803, lon: -121.5136, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "open" },
  "Atlanta Braves": { name: "Truist Park", lat: 33.8907, lon: -84.4677, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Baltimore Orioles": { name: "Oriole Park at Camden Yards", lat: 39.2838, lon: -76.6217, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Boston Red Sox": { name: "Fenway Park", lat: 42.3467, lon: -71.0972, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Chicago Cubs": { name: "Wrigley Field", lat: 41.9484, lon: -87.6553, timeZone: "America/Chicago", utcOffset: -5, roof: "open" },
  "Chicago White Sox": { name: "Rate Field", lat: 41.8300, lon: -87.6338, timeZone: "America/Chicago", utcOffset: -5, roof: "open" },
  "Cincinnati Reds": { name: "Great American Ball Park", lat: 39.0979, lon: -84.5081, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Cleveland Guardians": { name: "Progressive Field", lat: 41.4962, lon: -81.6852, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Colorado Rockies": { name: "Coors Field", lat: 39.7559, lon: -104.9942, timeZone: "America/Denver", utcOffset: -6, roof: "open" },
  "Detroit Tigers": { name: "Comerica Park", lat: 42.3390, lon: -83.0485, timeZone: "America/Detroit", utcOffset: -4, roof: "open" },
  "Houston Astros": { name: "Daikin Park", lat: 29.7572, lon: -95.3555, timeZone: "America/Chicago", utcOffset: -5, roof: "retractable" },
  "Kansas City Royals": { name: "Kauffman Stadium", lat: 39.0517, lon: -94.4803, timeZone: "America/Chicago", utcOffset: -5, roof: "open" },
  "Los Angeles Angels": { name: "Angel Stadium", lat: 33.8003, lon: -117.8827, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "open" },
  "Los Angeles Dodgers": { name: "Dodger Stadium", lat: 34.0739, lon: -118.2400, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "open" },
  "Miami Marlins": { name: "loanDepot park", lat: 25.7781, lon: -80.2197, timeZone: "America/New_York", utcOffset: -4, roof: "retractable" },
  "Milwaukee Brewers": { name: "American Family Field", lat: 43.0280, lon: -87.9712, timeZone: "America/Chicago", utcOffset: -5, roof: "retractable" },
  "Minnesota Twins": { name: "Target Field", lat: 44.9817, lon: -93.2776, timeZone: "America/Chicago", utcOffset: -5, roof: "open" },
  "New York Mets": { name: "Citi Field", lat: 40.7571, lon: -73.8458, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "New York Yankees": { name: "Yankee Stadium", lat: 40.8296, lon: -73.9262, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Philadelphia Phillies": { name: "Citizens Bank Park", lat: 39.9061, lon: -75.1665, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Pittsburgh Pirates": { name: "PNC Park", lat: 40.4469, lon: -80.0057, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "San Diego Padres": { name: "Petco Park", lat: 32.7073, lon: -117.1566, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "open" },
  "San Francisco Giants": { name: "Oracle Park", lat: 37.7786, lon: -122.3893, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "open" },
  "Seattle Mariners": { name: "T-Mobile Park", lat: 47.5914, lon: -122.3325, timeZone: "America/Los_Angeles", utcOffset: -7, roof: "retractable" },
  "St. Louis Cardinals": { name: "Busch Stadium", lat: 38.6226, lon: -90.1928, timeZone: "America/Chicago", utcOffset: -5, roof: "open" },
  "Tampa Bay Rays": { name: "George M. Steinbrenner Field", lat: 27.9800, lon: -82.5062, timeZone: "America/New_York", utcOffset: -4, roof: "open" },
  "Texas Rangers": { name: "Globe Life Field", lat: 32.7513, lon: -97.0825, timeZone: "America/Chicago", utcOffset: -5, roof: "retractable" },
  "Toronto Blue Jays": { name: "Rogers Centre", lat: 43.6414, lon: -79.3894, timeZone: "America/Toronto", utcOffset: -4, roof: "retractable" },
  "Washington Nationals": { name: "Nationals Park", lat: 38.8730, lon: -77.0074, timeZone: "America/New_York", utcOffset: -4, roof: "open" }
};