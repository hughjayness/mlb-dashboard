module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const modeRaw = String((req.query && (req.query.view || req.query.mode)) || "full").toLowerCase();
  const viewMode = modeRaw === "f5" ? "f5" : modeRaw === "props" ? "props" : "full";

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
    const [oddsResponse, mlbLineups, teamStatsMap] = await Promise.all([
      fetch(baseUrl),
      fetchOfficialLineupsFromMLB(),
      fetchTeamSeasonStatsMap()
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

    const limitedGames = upcomingGames.slice(0, 10);

    const datesNeeded = Array.from(new Set(
      limitedGames
        .flatMap(g => getScheduleDateCandidates(toDateEt(g.commence_time)))
        .filter(Boolean)
    ));

    const scheduleMap = await fetchScheduleContextsForDates(datesNeeded);
    const pitcherStatsMap = await fetchPitcherStatsMapFromSchedules(scheduleMap);

    const games = await Promise.all(
      limitedGames.map(async (game, index) => {
        const bookmaker = Array.isArray(game.bookmakers) ? game.bookmakers[0] : null;
        const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = normalizeTeamName(game.home_team || "Home");
        const awayTeam = normalizeTeamName(game.away_team || "Away");
        const dateEt = toDateEt(game.commence_time);

        const moneylineData = parseMoneyline(h2hMarket, homeTeam, awayTeam);
        const spreadData = parseSpreads(spreadMarket, homeTeam, awayTeam);
        const totalData = parseTotals(totalMarket);
        const firstFiveData = viewMode === "f5"
          ? await fetchFirstFiveMarketsForEvent({
              eventId: game.id,
              apiKey,
              homeTeam,
              awayTeam
            })
          : {
              moneyline: { display: "N/A", homePrice: null, awayPrice: null, homeProb: null, awayProb: null },
              spread: { display: "N/A", homePoint: null, awayPoint: null, homePrice: null, awayPrice: null },
              total: { display: "N/A", point: null, overPrice: null, underPrice: null, overProb: null, underProb: null },
              status: "F5 lookup skipped for current mode."
            };

        const lineupContext = buildLineupContext({
          homeTeam,
          awayTeam,
          mlbLineups
        });

        const gameContext = findGameContextAcrossSchedules({
          scheduleMap,
          targetDateEt: dateEt,
          awayTeam,
          homeTeam,
          pitcherStatsMap,
          rawCommenceTime: game.commence_time
        });
        const parkContext = getParkContext(homeTeam);

        const componentScores = buildComponentScores({
          homeTeam,
          awayTeam,
          moneylineData,
          totalData,
          lineupContext,
          gameContext,
          teamStatsMap,
          parkContext
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
          moneylineData,
          totalData
        });

        const firstFiveModelOutputs = buildFirstFiveModelOutputs({
          componentScores,
          firstFiveData
        });

        const propResult = viewMode === "props"
          ? await maybeFetchTopPropForEvent({
              eventId: game.id,
              apiKey,
              lineupContext,
              modelOutputs
            })
          : {
              topProp: null,
              status: "Prop lookup skipped for current mode.",
              lineupMode: lineupContext.lineupMode,
              lineupSource: lineupContext.lineupSource
            };

        const recommendation = buildRecommendation({
          homeTeam,
          awayTeam,
          moneylineData,
          spreadData,
          totalData,
          firstFiveData,
          modelOutputs,
          firstFiveModelOutputs,
          componentScores,
          propResult,
          viewMode
        });

        return {
          id: String(index + 1),
          eventId: game.id,
          rawCommenceTime: game.commence_time || null,
          time: game.commence_time
            ? (() => {
                const t = new Date(game.commence_time).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York"
                });
                return t + " ET";
              })()
            : "TBD",
          away: awayTeam,
          home: homeTeam,
          viewMode,

          moneyline: moneylineData.display,
          runLine: spreadData.display,
          total: totalData.display,
          firstFiveMoneyline: firstFiveData.moneyline.display,
          firstFiveRunLine: firstFiveData.spread.display,
          firstFiveTotal: firstFiveData.total.display,

          fairMlAway: modelOutputs.fairMlAway,
          fairMlHome: modelOutputs.fairMlHome,
          fairTotal: modelOutputs.fairTotal,
          fairF5MlAway: firstFiveModelOutputs.fairMlAway,
          fairF5MlHome: firstFiveModelOutputs.fairMlHome,
          fairF5Total: firstFiveModelOutputs.fairTotal,

          awayWinProb: modelOutputs.awayWinProb,
          homeWinProb: modelOutputs.homeWinProb,

          awayEdgePct: modelOutputs.awayEdgePct,
          homeEdgePct: modelOutputs.homeEdgePct,
          overEdgePct: modelOutputs.overEdgePct,
          underEdgePct: modelOutputs.underEdgePct,
          awayF5EdgePct: firstFiveModelOutputs.awayEdgePct,
          homeF5EdgePct: firstFiveModelOutputs.homeEdgePct,
          overF5EdgePct: firstFiveModelOutputs.overEdgePct,
          underF5EdgePct: firstFiveModelOutputs.underEdgePct,

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
            away: firstFiveModelOutputs.awayWinProb,
            home: firstFiveModelOutputs.homeWinProb
          },
          firstFiveTotalConfidence: {
            over: firstFiveModelOutputs.overConfidence,
            under: firstFiveModelOutputs.underConfidence
          },
          firstFiveRunLineConfidence: {
            away: firstFiveModelOutputs.awayRunLineConfidence,
            home: firstFiveModelOutputs.homeRunLineConfidence
          },

          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource,
          officialLineupAvailable: lineupContext.officialLineupAvailable,
          projectedLineupUsed: lineupContext.projectedLineupUsed,
          projectedLineups: lineupContext.projectedLineups,
          officialLineups: lineupContext.officialLineups,

          probablePitchers: componentScores.meta && componentScores.meta.probablePitchers ? componentScores.meta.probablePitchers : null,

          bestBet: recommendation.bestBet,
          bestBetType: recommendation.bestBetType,
          bestBetOdds: deriveBestBetOdds({
            recommendation,
            moneylineData,
            spreadData,
            totalData,
            firstFiveData,
            propResult,
            homeTeam,
            awayTeam
          }),
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
          riskWarnings: recommendation.riskWarnings,

          debug: buildDebugBlock({
            homeTeam,
            awayTeam,
            moneylineData,
            spreadData,
            totalData,
            lineupContext,
            gameContext,
            teamStatsMap,
            parkContext,
            componentScores,
            modelOutputs,
            firstFiveData,
            firstFiveModelOutputs,
            recommendation
          })
        };
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      notes: [
        "Debug mode is active.",
        "Team stats now use the MLB team-stats endpoint and probable pitcher stats use a dedicated people lookup.",
        "Use each game's debug block to confirm non-zero driver inputs are now being populated."
      ],
      viewMode,
      games
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not load odds data",
      details: error && error.message ? error.message : String(error)
    });
  }
};

const CACHE = {
  lineups: { expires: 0, data: {} },
  teamStats: { expires: 0, data: {} },
  scheduleByDate: Object.create(null),
  pitcherStatsByIds: Object.create(null),
  propsByEvent: Object.create(null),
  firstFiveByEvent: Object.create(null)
};

const CACHE_TTL_MS = {
  lineups: 5 * 60 * 1000,
  teamStats: 15 * 60 * 1000,
  schedule: 5 * 60 * 1000,
  pitcherStats: 15 * 60 * 1000,
  props: 3 * 60 * 1000,
  firstFive: 3 * 60 * 1000
};

const PARK_CONTEXT = {
  "Arizona Diamondbacks": { factor: 1.02, roof: "retractable" },
  "Atlanta Braves": { factor: 1.01, roof: "open" },
  "Baltimore Orioles": { factor: 0.98, roof: "open" },
  "Boston Red Sox": { factor: 1.03, roof: "open" },
  "Chicago Cubs": { factor: 1.00, roof: "open" },
  "Chicago White Sox": { factor: 1.01, roof: "open" },
  "Cincinnati Reds": { factor: 1.05, roof: "open" },
  "Cleveland Guardians": { factor: 0.98, roof: "open" },
  "Colorado Rockies": { factor: 1.18, roof: "open" },
  "Detroit Tigers": { factor: 0.97, roof: "open" },
  "Houston Astros": { factor: 1.00, roof: "retractable" },
  "Kansas City Royals": { factor: 0.97, roof: "open" },
  "Los Angeles Angels": { factor: 1.00, roof: "open" },
  "Los Angeles Dodgers": { factor: 0.99, roof: "open" },
  "Miami Marlins": { factor: 0.95, roof: "retractable" },
  "Milwaukee Brewers": { factor: 1.01, roof: "retractable" },
  "Minnesota Twins": { factor: 1.01, roof: "open" },
  "New York Mets": { factor: 0.98, roof: "open" },
  "New York Yankees": { factor: 1.04, roof: "open" },
  "Athletics": { factor: 0.97, roof: "open" },
  "Philadelphia Phillies": { factor: 1.03, roof: "open" },
  "Pittsburgh Pirates": { factor: 0.97, roof: "open" },
  "San Diego Padres": { factor: 0.95, roof: "open" },
  "San Francisco Giants": { factor: 0.93, roof: "open" },
  "Seattle Mariners": { factor: 0.94, roof: "open" },
  "St. Louis Cardinals": { factor: 1.00, roof: "open" },
  "Tampa Bay Rays": { factor: 0.95, roof: "dome" },
  "Texas Rangers": { factor: 1.03, roof: "retractable" },
  "Toronto Blue Jays": { factor: 1.01, roof: "retractable" },
  "Washington Nationals": { factor: 1.02, roof: "open" }
};

async function fetchOfficialLineupsFromMLB() {
  const now = Date.now();
  if (CACHE.lineups.expires > now && CACHE.lineups.data) return CACHE.lineups.data;

  const url = "https://www.mlb.com/starting-lineups";

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" }
    });

    if (!response.ok) return CACHE.lineups.data || {};

    const html = await response.text();
    const parsed = parseMLBStartingLineups(html);

    CACHE.lineups = {
      expires: now + CACHE_TTL_MS.lineups,
      data: parsed
    };

    return parsed;
  } catch (error) {
    return CACHE.lineups.data || {};
  }
}

async function fetchTeamSeasonStatsMap() {
  const now = Date.now();
  if (CACHE.teamStats.expires > now && CACHE.teamStats.data) return CACHE.teamStats.data;

  const url = "https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting,pitching&sportIds=1";

  try {
    const response = await fetch(url);
    if (!response.ok) return CACHE.teamStats.data || {};

    const json = await response.json();
    const statsBlocks = Array.isArray(json.stats) ? json.stats : [];
    const map = {};

    for (const block of statsBlocks) {
      const groupName = getGroupName(block && block.group);
      const splits = Array.isArray(block && block.splits) ? block.splits : [];

      for (const split of splits) {
        const team = split && split.team ? split.team : null;
        const stat = split && split.stat ? split.stat : null;
        const teamName = normalizeTeamName(team && team.name);

        if (!teamName || !stat || !groupName) continue;
        if (!map[teamName]) map[teamName] = { teamId: team && team.id ? team.id : null, hitting: {}, pitching: {} };

        if (groupName === "hitting") {
          map[teamName].hitting = stat;
        } else if (groupName === "pitching") {
          map[teamName].pitching = stat;
        }
      }
    }

    CACHE.teamStats = {
      expires: now + CACHE_TTL_MS.teamStats,
      data: map
    };

    return map;
  } catch (error) {
    return CACHE.teamStats.data || {};
  }
}

async function fetchScheduleContextsForDates(dateList) {
  const out = {};
  for (const dateEt of dateList) {
    out[dateEt] = await fetchScheduleContextForDate(dateEt);
  }
  return out;
}

function getScheduleDateCandidates(dateEt) {
  if (!dateEt) return [];
  const base = new Date(dateEt + "T12:00:00-04:00");
  if (isNaN(base.getTime())) return [dateEt];
  const prev = new Date(base.getTime() - 24 * 60 * 60 * 1000);
  const next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  return [formatDateEt(prev), dateEt, formatDateEt(next)];
}

function formatDateEt(dateObj) {
  return dateObj.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function fetchScheduleContextForDate(dateEt) {
  if (!dateEt) return null;

  const now = Date.now();
  const cached = CACHE.scheduleByDate[dateEt];
  if (cached && cached.expires > now) return cached.data;

  const url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=probablePitcher(note)&date=" + encodeURIComponent(dateEt);

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    CACHE.scheduleByDate[dateEt] = {
      expires: now + CACHE_TTL_MS.schedule,
      data
    };
    return data;
  } catch (error) {
    return null;
  }
}

async function fetchPitcherStatsMapFromSchedules(scheduleMap) {
  const pitcherIds = [];

  Object.keys(scheduleMap || {}).forEach(dateKey => {
    const schedule = scheduleMap[dateKey];
    const dates = Array.isArray(schedule && schedule.dates) ? schedule.dates : [];
    dates.forEach(dateObj => {
      const games = Array.isArray(dateObj && dateObj.games) ? dateObj.games : [];
      games.forEach(game => {
        const awayId = game && game.teams && game.teams.away && game.teams.away.probablePitcher && game.teams.away.probablePitcher.id;
        const homeId = game && game.teams && game.teams.home && game.teams.home.probablePitcher && game.teams.home.probablePitcher.id;
        if (awayId) pitcherIds.push(String(awayId));
        if (homeId) pitcherIds.push(String(homeId));
      });
    });
  });

  const uniqueIds = Array.from(new Set(pitcherIds));
  if (!uniqueIds.length) return {};

  const uncachedIds = uniqueIds.filter(id => {
    const cached = CACHE.pitcherStatsByIds[id];
    return !(cached && cached.expires > Date.now());
  });

  if (uncachedIds.length) {
    const chunks = chunkArray(uncachedIds, 25);
    for (const chunk of chunks) {
      const url =
        "https://statsapi.mlb.com/api/v1/people?personIds=" + encodeURIComponent(chunk.join(",")) +
        "&hydrate=stats(group=[pitching],type=[season])";

      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const json = await response.json();
        const people = Array.isArray(json.people) ? json.people : [];

        people.forEach(person => {
          const stat = extractPitchingStatFromPerson(person);
          CACHE.pitcherStatsByIds[String(person.id)] = {
            expires: Date.now() + CACHE_TTL_MS.pitcherStats,
            data: {
              id: person.id || null,
              name: person.fullName || person.name || "TBD",
              era: toNumber(stat && stat.era),
              whip: toNumber(stat && (stat.whip || stat.walksAndHitsPerInningPitched)),
              inningsPitched: inningsToDecimal(stat && stat.inningsPitched),
              strikeOuts: toNumber(stat && stat.strikeOuts)
            }
          };
        });
      } catch (error) {}
    }
  }

  const out = {};
  uniqueIds.forEach(id => {
    const cached = CACHE.pitcherStatsByIds[id];
    if (cached && cached.data) out[id] = cached.data;
  });

  return out;
}

function extractPitchingStatFromPerson(person) {
  const statsBlocks = Array.isArray(person && person.stats) ? person.stats : [];
  for (const block of statsBlocks) {
    const groupName = getGroupName(block && block.group);
    const typeName = getTypeName(block && block.type);
    const splits = Array.isArray(block && block.splits) ? block.splits : [];
    if (groupName !== "pitching") continue;
    if (typeName !== "season" && typeName !== "statsSingleSeason") continue;
    if (splits[0] && splits[0].stat) return splits[0].stat;
  }
  for (const block of statsBlocks) {
    const splits = Array.isArray(block && block.splits) ? block.splits : [];
    if (splits[0] && splits[0].stat) return splits[0].stat;
  }
  return {};
}

function getGroupName(groupObj) {
  const raw = groupObj && (groupObj.displayName || groupObj.name || groupObj.type);
  return raw ? String(raw).toLowerCase() : null;
}

function getTypeName(typeObj) {
  const raw = typeObj && (typeObj.displayName || typeObj.name);
  return raw ? String(raw).toLowerCase() : null;
}

function findGameContextAcrossSchedules({ scheduleMap, targetDateEt, awayTeam, homeTeam, pitcherStatsMap, rawCommenceTime }) {
  const targetDates = getScheduleDateCandidates(targetDateEt);
  const candidates = [];
  const targetTs = rawCommenceTime ? new Date(rawCommenceTime).getTime() : null;

  targetDates.forEach(dateKey => {
    const scheduleJson = scheduleMap && scheduleMap[dateKey] ? scheduleMap[dateKey] : null;
    const dates = Array.isArray(scheduleJson && scheduleJson.dates) ? scheduleJson.dates : [];
    for (const date of dates) {
      const games = Array.isArray(date && date.games) ? date.games : [];
      for (const game of games) {
        const away = normalizeTeamName(game && game.teams && game.teams.away && game.teams.away.team && game.teams.away.team.name);
        const home = normalizeTeamName(game && game.teams && game.teams.home && game.teams.home.team && game.teams.home.team.name);
        if (away !== awayTeam || home !== homeTeam) continue;
        const gameTs = game && game.gameDate ? new Date(game.gameDate).getTime() : null;
        const distance = targetTs && gameTs ? Math.abs(targetTs - gameTs) : 0;
        candidates.push({ game, dateKey, distance });
      }
    }
  });

  if (!candidates.length) {
    return {
      awayProbablePitcher: null,
      homeProbablePitcher: null,
      debugMeta: {
        scheduleMatchFound: false,
        scheduleMatchedDate: null,
        matchedGamePk: null
      }
    };
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const selected = candidates[0].game;
  const awayProbable = selected && selected.teams && selected.teams.away && selected.teams.away.probablePitcher;
  const homeProbable = selected && selected.teams && selected.teams.home && selected.teams.home.probablePitcher;

  return {
    awayProbablePitcher: mergeProbablePitcher(awayProbable, pitcherStatsMap),
    homeProbablePitcher: mergeProbablePitcher(homeProbable, pitcherStatsMap),
    debugMeta: {
      scheduleMatchFound: true,
      scheduleMatchedDate: candidates[0].dateKey || null,
      matchedGamePk: selected && selected.gamePk ? selected.gamePk : null
    }
  };
}

function mergeProbablePitcher(probablePitcher, pitcherStatsMap) {
  if (!probablePitcher) return null;
  const id = probablePitcher.id ? String(probablePitcher.id) : null;
  const stats = id && pitcherStatsMap[id] ? pitcherStatsMap[id] : null;

  return {
    id: probablePitcher.id || null,
    name: probablePitcher.fullName || probablePitcher.name || "TBD",
    era: stats ? stats.era : null,
    whip: stats ? stats.whip : null,
    inningsPitched: stats ? stats.inningsPitched : null,
    strikeOuts: stats ? stats.strikeOuts : null
  };
}

function getParkContext(homeTeam) {
  return PARK_CONTEXT[normalizeTeamName(homeTeam)] || { factor: 1.00, roof: "unknown" };
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
      const block = lines.slice(i, Math.min(i + 220, lines.length));

      const lineupGroups = extractTeamLineupGroups(block, away, home);
      const awayPlayers = firstValidLineup(lineupGroups.away);
      const homePlayers = firstValidLineup(lineupGroups.home);

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
    : { away: null, home: null };

  return {
    lineupMode: hasOfficial ? "official" : "projected",
    lineupSource: hasOfficial ? "MLB Starting Lineups" : "Projected lineup feed",
    officialLineupAvailable: hasOfficial,
    projectedLineupUsed: !hasOfficial,
    projectedLineups,
    officialLineups
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
function buildComponentScores({
  homeTeam,
  awayTeam,
  moneylineData,
  totalData,
  lineupContext,
  gameContext,
  teamStatsMap,
  parkContext
}) {
  const homeTeamStats = teamStatsMap[homeTeam] || {};
  const awayTeamStats = teamStatsMap[awayTeam] || {};

  const homeOffenseScore = scoreOffense(homeTeamStats.hitting);
  const awayOffenseScore = scoreOffense(awayTeamStats.hitting);

  const homeBullpenScore = scoreTeamPitching(homeTeamStats.pitching);
  const awayBullpenScore = scoreTeamPitching(awayTeamStats.pitching);

  const homeStarterScore = scorePitcher(gameContext && gameContext.homeProbablePitcher);
  const awayStarterScore = scorePitcher(gameContext && gameContext.awayProbablePitcher);

  const homeMarketProb = moneylineData.homeProb;
  const awayMarketProb = moneylineData.awayProb;
  const marketSideLean =
    homeMarketProb !== null && awayMarketProb !== null
      ? clamp((homeMarketProb - awayMarketProb) * 4, -2, 2)
      : 0;

  const marketTotalLean =
    totalData.overProb !== null && totalData.underProb !== null
      ? clamp((totalData.overProb - totalData.underProb) * 4, -2, 2)
      : 0;

  const offenseDiff = clamp(homeOffenseScore - awayOffenseScore, -2.2, 2.2);
  const bullpenDiff = clamp(homeBullpenScore - awayBullpenScore, -2.2, 2.2);
  const starterDiff = clamp(homeStarterScore - awayStarterScore, -2.5, 2.5);
  const lineupDirection = offenseDiff === 0 ? 0 : (lineupContext.officialLineupAvailable ? 0.25 : -0.10) * (offenseDiff > 0 ? 1 : -1);

  const parkFactor = toNumber(parkContext && parkContext.factor) || 1;
  const parkTotalLean = clamp((parkFactor - 1) * 8, -1.5, 1.5);

  const starterSuppression = clamp(-((homeStarterScore + awayStarterScore) / 2), -2.5, 2.5);
  const bullpenSuppression = clamp(-((homeBullpenScore + awayBullpenScore) / 2), -2.0, 2.0);
  const offenseTotalLean = clamp((homeOffenseScore + awayOffenseScore) / 2, -2.0, 2.0);
  const lineupTotalLean = lineupContext.officialLineupAvailable ? 0.15 : -0.10;

  return {
    side: {
      startingPitcher: round2(starterDiff),
      bullpen: round2(bullpenDiff),
      lineup: round2(lineupDirection),
      offenseVsHand: round2(offenseDiff),
      defense: 0,
      parkWeather: round2(parkTotalLean * 0.20),
      scheduleTravel: 0,
      marketContext: round2(marketSideLean)
    },
    total: {
      starterRunSuppression: round2(starterSuppression),
      bullpenRunSuppression: round2(bullpenSuppression),
      offenseQuality: round2(offenseTotalLean),
      lineups: round2(lineupTotalLean),
      parkFactor: round2(parkTotalLean),
      weather: 0,
      catcherDefense: 0,
      marketContext: round2(marketTotalLean)
    },
    liveFeedStatus: {
      startingPitcher: gameContext && gameContext.homeProbablePitcher && gameContext.awayProbablePitcher ? "live" : "missing",
      bullpen: homeTeamStats.pitching && Object.keys(homeTeamStats.pitching).length ? "live" : "missing",
      lineup: lineupContext.officialLineupAvailable ? "official" : "projected",
      offenseVsHand: homeTeamStats.hitting && Object.keys(homeTeamStats.hitting).length ? "live" : "missing",
      defense: "missing",
      parkWeather: parkContext ? "static" : "missing",
      scheduleTravel: "missing",
      marketContext: "live"
    },
    meta: {
      probablePitchers: {
        away: gameContext && gameContext.awayProbablePitcher ? gameContext.awayProbablePitcher.name : "TBD",
        home: gameContext && gameContext.homeProbablePitcher ? gameContext.homeProbablePitcher.name : "TBD"
      },
      scheduleDebug: gameContext && gameContext.debugMeta ? gameContext.debugMeta : null,
      park: {
        factor: parkFactor,
        roof: parkContext && parkContext.roof ? parkContext.roof : "unknown"
      }
    }
  };
}

function buildModelOutputs({ componentScores, moneylineData, totalData }) {
  const sideComposite =
    (0.33 * componentScores.side.startingPitcher) +
    (0.18 * componentScores.side.bullpen) +
    (0.10 * componentScores.side.lineup) +
    (0.17 * componentScores.side.offenseVsHand) +
    (0.02 * componentScores.side.defense) +
    (0.03 * componentScores.side.parkWeather) +
    (0.02 * componentScores.side.scheduleTravel) +
    (0.15 * componentScores.side.marketContext);

  const totalComposite =
    (0.23 * componentScores.total.starterRunSuppression) +
    (0.16 * componentScores.total.bullpenRunSuppression) +
    (0.20 * componentScores.total.offenseQuality) +
    (0.05 * componentScores.total.lineups) +
    (0.16 * componentScores.total.parkFactor) +
    (0.05 * componentScores.total.weather) +
    (0.00 * componentScores.total.catcherDefense) +
    (0.15 * componentScores.total.marketContext);

  const marketHomeProb = moneylineData.homeProb ?? 0.50;
  const marketAwayProb = moneylineData.awayProb ?? 0.50;

  const homeWinProb = clamp(marketHomeProb + (sideComposite * 0.045), 0.15, 0.85);
  const awayWinProb = clamp(1 - homeWinProb, 0.15, 0.85);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketTotalLine = totalData.point ?? null;
  const marketOverProb = totalData.overProb ?? 0.50;

  let fairTotal = null;
  if (marketTotalLine !== null) {
    fairTotal = round1(marketTotalLine + (totalComposite * 0.55));
  }

  const fairOverProb = clamp(marketOverProb + (totalComposite * 0.05), 0.15, 0.85);
  const fairUnderProb = clamp(1 - fairOverProb, 0.15, 0.85);

  const marketSpreadFav = deriveSpreadFavorite(moneylineData);
  const homeRunLineConfidence = clamp(homeWinProb + (marketSpreadFav === "home" ? 0.06 : -0.02), 0.10, 0.90);
  const awayRunLineConfidence = clamp(awayWinProb + (marketSpreadFav === "away" ? 0.06 : -0.02), 0.10, 0.90);

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

async function fetchFirstFiveMarketsForEvent({ eventId, apiKey, homeTeam, awayTeam }) {
  const now = Date.now();
  const cached = CACHE.firstFiveByEvent[eventId];
  if (cached && cached.expires > now) return cached.data;

  const empty = {
    moneyline: { display: "N/A", homePrice: null, awayPrice: null, homeProb: null, awayProb: null },
    spread: {
      display: "N/A",
      homePoint: null,
      awayPoint: null,
      homePrice: null,
      awayPrice: null,
      homeProb: null,
      awayProb: null
    },
    total: { display: "N/A", point: null, overPrice: null, underPrice: null, overProb: null, underProb: null },
    fetched: false
  };

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&bookmakers=betmgm` +
    `&markets=h2h_1st_5_innings,spreads_1st_5_innings,totals_1st_5_innings` +
    `&oddsFormat=american`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      CACHE.firstFiveByEvent[eventId] = { expires: now + CACHE_TTL_MS.firstFive, data: empty };
      return empty;
    }

    const data = await response.json();
    const bookmaker = Array.isArray(data.bookmakers) ? data.bookmakers[0] : null;
    const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

    const out = {
      moneyline: parseMoneyline(markets.find(m => m.key === "h2h_1st_5_innings"), homeTeam, awayTeam),
      spread: parseSpreads(markets.find(m => m.key === "spreads_1st_5_innings"), homeTeam, awayTeam),
      total: parseTotals(markets.find(m => m.key === "totals_1st_5_innings")),
      fetched: true
    };

    CACHE.firstFiveByEvent[eventId] = {
      expires: now + CACHE_TTL_MS.firstFive,
      data: out
    };

    return out;
  } catch (error) {
    CACHE.firstFiveByEvent[eventId] = { expires: now + CACHE_TTL_MS.firstFive, data: empty };
    return empty;
  }
}

function buildFirstFiveModelOutputs({ componentScores, firstFiveData }) {
  const sideComposite =
    (0.52 * componentScores.side.startingPitcher) +
    (0.10 * componentScores.side.lineup) +
    (0.20 * componentScores.side.offenseVsHand) +
    (0.03 * componentScores.side.parkWeather) +
    (0.15 * componentScores.side.marketContext);

  const totalComposite =
    (0.48 * componentScores.total.starterRunSuppression) +
    (0.22 * componentScores.total.offenseQuality) +
    (0.08 * componentScores.total.lineups) +
    (0.07 * componentScores.total.parkFactor) +
    (0.15 * componentScores.total.marketContext);

  const moneylineData = firstFiveData && firstFiveData.moneyline ? firstFiveData.moneyline : {};
  const totalData = firstFiveData && firstFiveData.total ? firstFiveData.total : {};

  const marketHomeProb = moneylineData.homeProb ?? 0.50;
  const marketAwayProb = moneylineData.awayProb ?? 0.50;

  const homeWinProb = clamp(marketHomeProb + (sideComposite * 0.055), 0.15, 0.85);
  const awayWinProb = clamp(1 - homeWinProb, 0.15, 0.85);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketTotalLine = totalData.point ?? null;
  const marketOverProb = totalData.overProb ?? 0.50;

  let fairTotal = null;
  if (marketTotalLine !== null) {
    fairTotal = round1(marketTotalLine + (totalComposite * 0.40));
  }

  const fairOverProb = clamp(marketOverProb + (totalComposite * 0.055), 0.15, 0.85);
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
    awayEdgePct: moneylineData.awayProb !== null && moneylineData.awayProb !== undefined ? toEdgePct(awayWinProb, moneylineData.awayProb) : null,
    homeEdgePct: moneylineData.homeProb !== null && moneylineData.homeProb !== undefined ? toEdgePct(homeWinProb, moneylineData.homeProb) : null,
    overEdgePct: totalData.overProb !== null && totalData.overProb !== undefined ? toEdgePct(fairOverProb, totalData.overProb) : null,
    underEdgePct: totalData.underProb !== null && totalData.underProb !== undefined ? toEdgePct(fairUnderProb, totalData.underProb) : null,
    overConfidence: toPctNumber(fairOverProb),
    underConfidence: toPctNumber(fairUnderProb),
    awayRunLineConfidence: toPctNumber(awayRunLineConfidence),
    homeRunLineConfidence: toPctNumber(homeRunLineConfidence)
  };
}

function deriveSpreadFavorite(moneylineData) {
  if (moneylineData.homeProb === null || moneylineData.awayProb === null) return null;
  if (moneylineData.homeProb > moneylineData.awayProb) return "home";
  if (moneylineData.awayProb > moneylineData.homeProb) return "away";
  return null;
}

async function maybeFetchTopPropForEvent({ eventId, apiKey, lineupContext, modelOutputs }) {
  const maxGameEdge = Math.max(
    Math.abs(modelOutputs.homeEdgePct || 0),
    Math.abs(modelOutputs.awayEdgePct || 0),
    Math.abs(modelOutputs.overEdgePct || 0),
    Math.abs(modelOutputs.underEdgePct || 0)
  );

  const shouldFetch =
    lineupContext.officialLineupAvailable ||
    maxGameEdge >= 4.0;

  if (!shouldFetch) {
    return {
      topProp: null,
      status: "Prop lookup skipped to improve performance for a low-priority game.",
      lineupMode: lineupContext.lineupMode,
      lineupSource: lineupContext.lineupSource
    };
  }

  return fetchTopPropForEvent(eventId, apiKey, lineupContext);
}


function buildFirstFiveLogicContext(componentScores, modelOutputs, firstFiveModelOutputs) {
  const starterEdge = Math.abs(toNumber(componentScores && componentScores.side && componentScores.side.startingPitcher) || 0);
  const bullpenEdge = Math.abs(toNumber(componentScores && componentScores.side && componentScores.side.bullpen) || 0);
  const offenseEdge = Math.abs(toNumber(componentScores && componentScores.side && componentScores.side.offenseVsHand) || 0);
  const lineupEdge = Math.abs(toNumber(componentScores && componentScores.side && componentScores.side.lineup) || 0);
  const starterSuppression = Math.abs(toNumber(componentScores && componentScores.total && componentScores.total.starterRunSuppression) || 0);
  const bullpenSuppression = Math.abs(toNumber(componentScores && componentScores.total && componentScores.total.bullpenRunSuppression) || 0);

  const starterDrivenSide = starterEdge >= 0.55 && starterEdge >= (bullpenEdge + 0.15);
  const bullpenCouldDiluteSide = bullpenEdge >= starterEdge + 0.20;
  const strongFullGameBullpenSignal = bullpenEdge >= 0.65;
  const sideEdgeGap =
    Math.max(
      Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.homeEdgePct) || 0),
      Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.awayEdgePct) || 0)
    ) -
    Math.max(
      Math.abs(toNumber(modelOutputs && modelOutputs.homeEdgePct) || 0),
      Math.abs(toNumber(modelOutputs && modelOutputs.awayEdgePct) || 0)
    );

  const starterDrivenTotal = starterSuppression >= 0.55 && starterSuppression >= (bullpenSuppression + 0.12);
  const bullpenCouldDiluteTotal = bullpenSuppression >= starterSuppression + 0.20;
  const totalEdgeGap =
    Math.max(
      Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.overEdgePct) || 0),
      Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.underEdgePct) || 0)
    ) -
    Math.max(
      Math.abs(toNumber(modelOutputs && modelOutputs.overEdgePct) || 0),
      Math.abs(toNumber(modelOutputs && modelOutputs.underEdgePct) || 0)
    );

  return {
    starterEdge: round2(starterEdge),
    bullpenEdge: round2(bullpenEdge),
    offenseEdge: round2(offenseEdge),
    lineupEdge: round2(lineupEdge),
    starterSuppression: round2(starterSuppression),
    bullpenSuppression: round2(bullpenSuppression),
    starterDrivenSide,
    bullpenCouldDiluteSide,
    strongFullGameBullpenSignal,
    sideEdgeGap: round2(sideEdgeGap),
    starterDrivenTotal,
    bullpenCouldDiluteTotal,
    totalEdgeGap: round2(totalEdgeGap)
  };
}

function shouldIncludeFirstFiveSideCandidate(side, firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores) {
  if (!firstFiveData || !firstFiveData.moneyline) return false;
  const edge = Math.abs(toNumber(side === "home" ? firstFiveModelOutputs.homeEdgePct : firstFiveModelOutputs.awayEdgePct) || 0);
  const starterRaw = Math.abs(toNumber(componentScores && componentScores.side && componentScores.side.startingPitcher) || 0);
  if (edge < 1.8) return false;
  if (starterRaw < 0.45) return false;
  if (!(firstFiveLogic.starterDrivenSide || firstFiveLogic.sideEdgeGap >= 0.5 || firstFiveLogic.bullpenCouldDiluteSide)) return false;
  return true;
}

function shouldIncludeFirstFiveTotalCandidate(firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores) {
  if (!firstFiveData || !firstFiveData.total || firstFiveData.total.point === null) return false;
  const edge = Math.max(
    Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.overEdgePct) || 0),
    Math.abs(toNumber(firstFiveModelOutputs && firstFiveModelOutputs.underEdgePct) || 0)
  );
  const starterSuppression = Math.abs(toNumber(componentScores && componentScores.total && componentScores.total.starterRunSuppression) || 0);
  if (edge < 1.7) return false;
  if (starterSuppression < 0.45) return false;
  if (!(firstFiveLogic.starterDrivenTotal || firstFiveLogic.totalEdgeGap >= 0.45 || firstFiveLogic.bullpenCouldDiluteTotal)) return false;
  return true;
}

function f5SideReasonTag(firstFiveLogic) {
  if (firstFiveLogic.bullpenCouldDiluteSide) return "F5 is preferred because the starting-pitcher edge is stronger than the full-game bullpen path.";
  if (firstFiveLogic.starterDrivenSide) return "F5 is preferred because this side edge is front-loaded in the probable starter matchup.";
  return "F5 is preferred because the early-game edge grades better than the full-game version.";
}

function f5TotalReasonTag(firstFiveLogic) {
  if (firstFiveLogic.bullpenCouldDiluteTotal) return "F5 is preferred because the starter-based total read is stronger than the bullpen portion of the game.";
  if (firstFiveLogic.starterDrivenTotal) return "F5 is preferred because the projected run environment is being driven by the starting pitchers.";
  return "F5 is preferred because the early total grades better than the full-game total.";
}

function buildRecommendation({
  homeTeam,
  awayTeam,
  moneylineData,
  spreadData,
  totalData,
  firstFiveData,
  modelOutputs,
  firstFiveModelOutputs,
  componentScores,
  propResult,
  viewMode
}) {
  const gameCandidates = [];
  const allowFullGame = viewMode === "full";
  const allowFirstFive = viewMode === "f5";
  const allowProps = viewMode === "props";
  const firstFiveLogic = buildFirstFiveLogicContext(componentScores, modelOutputs, firstFiveModelOutputs);

  if (allowFullGame && typeof modelOutputs.homeEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${homeTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.homeEdgePct,
      reasons: buildSideReasons(homeTeam, "home", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.homeEdgePct)
    });
  }

  if (allowFullGame && typeof modelOutputs.awayEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${awayTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.awayEdgePct,
      reasons: buildSideReasons(awayTeam, "away", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.awayEdgePct)
    });
  }

  if (allowFullGame && totalData.point !== null && typeof modelOutputs.overEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Over ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.overEdgePct,
      reasons: buildTotalReasons("Over", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.overEdgePct)
    });
  }

  if (allowFullGame && totalData.point !== null && typeof modelOutputs.underEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Under ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.underEdgePct,
      reasons: buildTotalReasons("Under", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.underEdgePct)
    });
  }

  if (allowFullGame && spreadData.homePoint !== null && spreadData.awayPoint !== null && typeof modelOutputs.homeEdgePct === "number" && typeof modelOutputs.awayEdgePct === "number") {
    if (modelOutputs.homeEdgePct > 0 && spreadData.homePoint < 0) {
      gameCandidates.push({
        bestBet: `${homeTeam} ${formatSpread(spreadData.homePoint)}`,
        bestBetType: "Run Line",
        edge: round1(modelOutputs.homeEdgePct - 0.6),
        reasons: buildRunLineReasons(homeTeam, spreadData.homePoint, "home", modelOutputs, componentScores),
        scoreForConfidence: Math.abs(round1(modelOutputs.homeEdgePct - 0.6))
      });
    }
    if (modelOutputs.awayEdgePct > 0 && spreadData.awayPoint < 0) {
      gameCandidates.push({
        bestBet: `${awayTeam} ${formatSpread(spreadData.awayPoint)}`,
        bestBetType: "Run Line",
        edge: round1(modelOutputs.awayEdgePct - 0.6),
        reasons: buildRunLineReasons(awayTeam, spreadData.awayPoint, "away", modelOutputs, componentScores),
        scoreForConfidence: Math.abs(round1(modelOutputs.awayEdgePct - 0.6))
      });
    }
  }

  if (allowFirstFive && typeof firstFiveModelOutputs.homeEdgePct === "number" && shouldIncludeFirstFiveSideCandidate("home", firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
    gameCandidates.push({
      bestBet: `${homeTeam} F5 ML`,
      bestBetType: "F5 Side",
      edge: firstFiveModelOutputs.homeEdgePct + Math.max(0, firstFiveLogic.sideEdgeGap * 0.35),
      reasons: buildFirstFiveSideReasons(homeTeam, "home", firstFiveModelOutputs, componentScores, firstFiveData.moneyline).concat([f5SideReasonTag(firstFiveLogic)]),
      scoreForConfidence: Math.abs(firstFiveModelOutputs.homeEdgePct) + Math.max(0, firstFiveLogic.sideEdgeGap * 0.35)
    });
  }

  if (allowFirstFive && typeof firstFiveModelOutputs.awayEdgePct === "number" && shouldIncludeFirstFiveSideCandidate("away", firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
    gameCandidates.push({
      bestBet: `${awayTeam} F5 ML`,
      bestBetType: "F5 Side",
      edge: firstFiveModelOutputs.awayEdgePct + Math.max(0, firstFiveLogic.sideEdgeGap * 0.35),
      reasons: buildFirstFiveSideReasons(awayTeam, "away", firstFiveModelOutputs, componentScores, firstFiveData.moneyline).concat([f5SideReasonTag(firstFiveLogic)]),
      scoreForConfidence: Math.abs(firstFiveModelOutputs.awayEdgePct) + Math.max(0, firstFiveLogic.sideEdgeGap * 0.35)
    });
  }

  if (allowFirstFive && typeof firstFiveModelOutputs.overEdgePct === "number" && shouldIncludeFirstFiveTotalCandidate(firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
    gameCandidates.push({
      bestBet: `F5 Over ${firstFiveData.total.point}`,
      bestBetType: "F5 Total",
      edge: firstFiveModelOutputs.overEdgePct + Math.max(0, firstFiveLogic.totalEdgeGap * 0.30),
      reasons: buildFirstFiveTotalReasons("Over", firstFiveData.total.point, firstFiveModelOutputs, componentScores).concat([f5TotalReasonTag(firstFiveLogic)]),
      scoreForConfidence: Math.abs(firstFiveModelOutputs.overEdgePct) + Math.max(0, firstFiveLogic.totalEdgeGap * 0.30)
    });
  }

  if (allowFirstFive && typeof firstFiveModelOutputs.underEdgePct === "number" && shouldIncludeFirstFiveTotalCandidate(firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
    gameCandidates.push({
      bestBet: `F5 Under ${firstFiveData.total.point}`,
      bestBetType: "F5 Total",
      edge: firstFiveModelOutputs.underEdgePct + Math.max(0, firstFiveLogic.totalEdgeGap * 0.30),
      reasons: buildFirstFiveTotalReasons("Under", firstFiveData.total.point, firstFiveModelOutputs, componentScores).concat([f5TotalReasonTag(firstFiveLogic)]),
      scoreForConfidence: Math.abs(firstFiveModelOutputs.underEdgePct) + Math.max(0, firstFiveLogic.totalEdgeGap * 0.30)
    });
  }

  if (allowFirstFive && firstFiveData && firstFiveData.spread && firstFiveData.spread.homePoint !== null && firstFiveData.spread.awayPoint !== null) {
    if (typeof firstFiveModelOutputs.homeEdgePct === "number" && firstFiveModelOutputs.homeEdgePct > 0 && firstFiveData.spread.homePoint < 0 && shouldIncludeFirstFiveSideCandidate("home", firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
      gameCandidates.push({
        bestBet: `${homeTeam} F5 ${formatSpread(firstFiveData.spread.homePoint)}`,
        bestBetType: "F5 Run Line",
        edge: round1(firstFiveModelOutputs.homeEdgePct - 0.2 + Math.max(0, firstFiveLogic.sideEdgeGap * 0.25)),
        reasons: buildFirstFiveRunLineReasons(homeTeam, firstFiveData.spread.homePoint, "home", firstFiveModelOutputs, componentScores).concat([f5SideReasonTag(firstFiveLogic)]),
        scoreForConfidence: Math.abs(round1(firstFiveModelOutputs.homeEdgePct - 0.2 + Math.max(0, firstFiveLogic.sideEdgeGap * 0.25)))
      });
    }
    if (typeof firstFiveModelOutputs.awayEdgePct === "number" && firstFiveModelOutputs.awayEdgePct > 0 && firstFiveData.spread.awayPoint < 0 && shouldIncludeFirstFiveSideCandidate("away", firstFiveLogic, firstFiveModelOutputs, firstFiveData, componentScores)) {
      gameCandidates.push({
        bestBet: `${awayTeam} F5 ${formatSpread(firstFiveData.spread.awayPoint)}`,
        bestBetType: "F5 Run Line",
        edge: round1(firstFiveModelOutputs.awayEdgePct - 0.2 + Math.max(0, firstFiveLogic.sideEdgeGap * 0.25)),
        reasons: buildFirstFiveRunLineReasons(awayTeam, firstFiveData.spread.awayPoint, "away", firstFiveModelOutputs, componentScores).concat([f5SideReasonTag(firstFiveLogic)]),
        scoreForConfidence: Math.abs(round1(firstFiveModelOutputs.awayEdgePct - 0.2 + Math.max(0, firstFiveLogic.sideEdgeGap * 0.25)))
      });
    }
  }

  const positiveGames = gameCandidates.filter(c => typeof c.edge === "number" && c.edge > 0);
  const bestGame = positiveGames.sort((a, b) => b.edge - a.edge)[0] || null;

  let best = bestGame;

  if (allowProps && propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
    const propEdge = Math.abs(propResult.topProp.modelProb - 50);
    const propCandidate = {
      bestBet: `${propResult.topProp.player} ${propResult.topProp.market}`,
      bestBetType: "Prop",
      edge: propEdge,
      reasons: [
        `Lineup mode used: ${propResult.lineupMode}.`,
        `Lineup source used: ${propResult.lineupSource}.`,
        `Implied market-based prop probability is ${propResult.topProp.modelProb}%.`,
        propResult.lineupMode === "projected"
          ? "Projected-lineup props are intentionally capped until official lineups are connected."
          : "Official lineup mode is active for this prop."
      ],
      scoreForConfidence: propEdge
    };

    const propMustBeatBy = 0.8;
    if (!bestGame || propCandidate.edge >= bestGame.edge + propMustBeatBy) {
      best = propCandidate;
    }
  }

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
      riskWarnings: buildRiskWarnings(componentScores)
    };
  }

  const confidenceScore = round1(best.scoreForConfidence);
  const confidence = confidenceFromEdge(best.scoreForConfidence);

  return {
    bestBet: best.bestBet,
    bestBetType: best.bestBetType,
    confidence,
    confidenceScore,
    recommendedTiming: "—",
    recommendedStakeUnits: null,
    reasons: best.reasons,
    riskWarnings: buildRiskWarnings(componentScores)
  };
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
    return {
      display: "N/A",
      homePoint: null,
      awayPoint: null,
      homePrice: null,
      awayPrice: null,
      homeProb: null,
      awayProb: null
    };
  }

  const home = market.outcomes.find(o => normalizeTeamName(o.name) === homeTeam);
  const away = market.outcomes.find(o => normalizeTeamName(o.name) === awayTeam);

  if (!home || !away) {
    return {
      display: "N/A",
      homePoint: null,
      awayPoint: null,
      homePrice: null,
      awayPrice: null,
      homeProb: null,
      awayProb: null
    };
  }

  return {
    display:
      `${awayTeam} ${formatSpread(away.point)} (${formatAmerican(away.price)}) / ` +
      `${homeTeam} ${formatSpread(home.point)} (${formatAmerican(home.price)})`,
    homePoint: numberOrNull(home.point),
    awayPoint: numberOrNull(away.point),
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
    "Athletics": "ATH"
  };
  return map[name] || name.split(" ").map(w => w[0]).join("").toUpperCase();
}

function confidenceFromEdge(edgeAbsPct) {
  if (edgeAbsPct >= 6) return "High";
  if (edgeAbsPct >= 3) return "Medium";
  return "Low";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toDateEt(isoString) {
  if (!isoString) return null;
  try {
    return new Date(isoString).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch (error) {
    return null;
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrNull(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function inningsToDecimal(ip) {
  if (ip === null || ip === undefined || ip === "") return null;
  const parts = String(ip).split(".");
  const whole = Number(parts[0] || 0);
  const frac = Number(parts[1] || 0);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;
  return whole + (frac / 3);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function scorePitcher(pitcher) {
  if (!pitcher) return 0;

  let score = 0;
  if (pitcher.era !== null) score += clamp((4.20 - pitcher.era) * 0.75, -1.5, 1.5);
  if (pitcher.whip !== null) score += clamp((1.30 - pitcher.whip) * 2.2, -1.2, 1.2);

  if (pitcher.strikeOuts !== null && pitcher.inningsPitched && pitcher.inningsPitched > 0) {
    const k9 = (pitcher.strikeOuts / pitcher.inningsPitched) * 9;
    score += clamp((k9 - 8.5) * 0.12, -1.0, 1.0);
  }

  return clamp(round2(score), -2.5, 2.5);
}

function scoreTeamPitching(stat) {
  if (!stat || !Object.keys(stat).length) return 0;

  let score = 0;
  const era = toNumber(stat.era);
  const whip = toNumber(stat.whip || stat.walksAndHitsPerInningPitched);
  const strikeOuts = toNumber(stat.strikeOuts);
  const inningsPitched = inningsToDecimal(stat.inningsPitched);

  if (era !== null) score += clamp((4.20 - era) * 0.55, -1.2, 1.2);
  if (whip !== null) score += clamp((1.30 - whip) * 1.8, -1.0, 1.0);

  if (strikeOuts !== null && inningsPitched && inningsPitched > 0) {
    const k9 = (strikeOuts / inningsPitched) * 9;
    score += clamp((k9 - 8.6) * 0.08, -0.7, 0.7);
  }

  return clamp(round2(score), -2.0, 2.0);
}

function scoreOffense(stat) {
  if (!stat || !Object.keys(stat).length) return 0;

  let score = 0;
  const ops = toNumber(stat.ops);
  const obp = toNumber(stat.obp);
  const slg = toNumber(stat.slg);
  const runs = toNumber(stat.runs);
  const games = toNumber(stat.gamesPlayed);

  if (ops !== null) score += clamp((ops - 0.720) * 8.0, -1.4, 1.4);
  if (obp !== null) score += clamp((obp - 0.315) * 8.0, -0.8, 0.8);
  if (slg !== null) score += clamp((slg - 0.390) * 5.5, -0.8, 0.8);
  if (runs !== null && games && games > 0) {
    const rpg = runs / games;
    score += clamp((rpg - 4.40) * 0.40, -0.8, 0.8);
  }

  return clamp(round2(score), -2.2, 2.2);
}

async function fetchTopPropForEvent(eventId, apiKey, lineupContext) {
  const now = Date.now();
  const cached = CACHE.propsByEvent[eventId];
  if (cached && cached.expires > now) return cached.data;

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
              price: typeof outcome.price === "number" ? outcome.price : null,
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
        const result = {
          topProp: bestProp,
          status: lineupContext.lineupMode === "official"
            ? "Live BetMGM prop returned using official lineup mode."
            : "Live BetMGM prop returned using projected lineup mode.",
          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource
        };

        CACHE.propsByEvent[eventId] = {
          expires: now + CACHE_TTL_MS.props,
          data: result
        };

        return result;
      }
    } catch (error) {}
  }

  const fallback = {
    topProp: null,
    status: "No supported BetMGM prop returned. Checked: " + triedMarkets.join(" | "),
    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource
  };

  CACHE.propsByEvent[eventId] = {
    expires: now + CACHE_TTL_MS.props,
    data: fallback
  };

  return fallback;
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported BetMGM prop returned.";

  const reasons = [];
  reasons.push("This was the highest-scoring supported prop returned by BetMGM.");
  if (typeof topProp.rankingScore === "number") reasons.push(`Ranking score: ${topProp.rankingScore}.`);
  reasons.push(`Market: ${topProp.market}.`);
  if (typeof topProp.price === "number") reasons.push(`Book price: ${formatAmerican(topProp.price)}.`);
  if (typeof topProp.modelProb === "number") reasons.push(`Its current model probability graded at ${topProp.modelProb}%.`);
  if (lineupContext.lineupMode === "official") reasons.push("It was evaluated using official lineup mode.");
  else reasons.push("It was evaluated using projected lineup mode.");
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

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePropOutcome(marketKey, outcome, lineupContext) {
  let score = 0;
  const marketProb = americanToProb(outcome.price);
  if (marketProb == null) return -999;

  if (outcome.name === "Over") score += 4;
  if (outcome.name === "Under") score += 2;

  if (marketKey === "pitcher_strikeouts") score += 3.5;
  if (marketKey === "pitcher_outs") score += 3.5;
  if (marketKey === "batter_hits") score += 3.5;
  if (marketKey === "batter_total_bases") score += 3.5;
  if (marketKey === "batter_home_runs") score += 1.0;

  if (lineupContext.lineupMode === "official") score += 2.5;
  else score -= 2.5;

  if (marketKey === "pitcher_strikeouts") score -= 2.0;
  if (marketKey === "pitcher_outs") score -= 1.8;
  if (marketKey === "batter_hits") score -= 1.8;
  if (marketKey === "batter_total_bases") score -= 2.1;
  if (marketKey === "batter_home_runs") score -= 4.5;

  if (typeof outcome.price === "number" && outcome.price < -170) score -= 1.0;

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

  if (typeof outcome.price === "number") {
    reasons.push(`Book price observed at ${formatAmerican(outcome.price)}.`);
  }

  if (lineupContext.lineupMode === "projected") {
    reasons.push("Projected-lineup props carry extra uncertainty.");
  } else {
    reasons.push("Official lineup is posted.");
  }

  switch (marketKey) {
    case "pitcher_strikeouts": reasons.push("Strikeout props can be useful, but they no longer get built-in preference."); break;
    case "pitcher_outs": reasons.push("Pitcher outs are treated as a medium-variance prop."); break;
    case "batter_total_bases": reasons.push("Total bases are treated as a medium-variance hitter prop."); break;
    case "batter_hits": reasons.push("Hits props are treated as a medium-variance hitter prop."); break;
    case "batter_home_runs": reasons.push("Home runs remain a high-variance prop."); break;
  }

  return reasons;
}

function deriveBestBetOdds({ recommendation, moneylineData, spreadData, totalData, firstFiveData, propResult, homeTeam, awayTeam }) {
  if (!recommendation || !recommendation.bestBet) return null;

  const bestBet = recommendation.bestBet;

  if (recommendation.bestBetType === "Prop") {
    return propResult && propResult.topProp && typeof propResult.topProp.price === "number"
      ? propResult.topProp.price
      : null;
  }

  if (/ F5 ML$/i.test(bestBet)) {
    if (bestBet === `${awayTeam} F5 ML`) return firstFiveData && firstFiveData.moneyline ? firstFiveData.moneyline.awayPrice ?? null : null;
    if (bestBet === `${homeTeam} F5 ML`) return firstFiveData && firstFiveData.moneyline ? firstFiveData.moneyline.homePrice ?? null : null;
  }

  if (/ ML$/i.test(bestBet)) {
    if (bestBet === `${awayTeam} ML`) return moneylineData.awayPrice ?? null;
    if (bestBet === `${homeTeam} ML`) return moneylineData.homePrice ?? null;
  }

  if (/^F5 Over /i.test(bestBet)) return firstFiveData && firstFiveData.total ? firstFiveData.total.overPrice ?? null : null;
  if (/^F5 Under /i.test(bestBet)) return firstFiveData && firstFiveData.total ? firstFiveData.total.underPrice ?? null : null;

  if (/^Over /i.test(bestBet)) return totalData.overPrice ?? null;
  if (/^Under /i.test(bestBet)) return totalData.underPrice ?? null;

  if (bestBet === `${awayTeam} F5 ${formatSpread(firstFiveData && firstFiveData.spread ? firstFiveData.spread.awayPoint : null)}`) return firstFiveData && firstFiveData.spread ? firstFiveData.spread.awayPrice ?? null : null;
  if (bestBet === `${homeTeam} F5 ${formatSpread(firstFiveData && firstFiveData.spread ? firstFiveData.spread.homePoint : null)}`) return firstFiveData && firstFiveData.spread ? firstFiveData.spread.homePrice ?? null : null;

  if (bestBet === `${awayTeam} ${formatSpread(spreadData.awayPoint)}`) return spreadData.awayPrice ?? null;
  if (bestBet === `${homeTeam} ${formatSpread(spreadData.homePoint)}`) return spreadData.homePrice ?? null;

  return null;
}

function buildSideReasons(teamName, side, modelOutputs, componentScores, moneylineData) {
  const winProb = side === "home" ? modelOutputs.homeWinProb : modelOutputs.awayWinProb;
  const fairPrice = side === "home" ? modelOutputs.fairMlHome : modelOutputs.fairMlAway;
  const edgePct = side === "home" ? modelOutputs.homeEdgePct : modelOutputs.awayEdgePct;
  const marketProb = side === "home" ? moneylineData.homeProb : moneylineData.awayProb;
  const meta = componentScores.meta || {};
  const starterText = meta.probablePitchers
    ? `${meta.probablePitchers.away} vs ${meta.probablePitchers.home}`
    : "Probable pitchers not posted";

  return [
    `${teamName} fair moneyline projects to ${formatAmerican(fairPrice)}.`,
    `Model win probability is ${winProb}% versus market implied ${toPctNumber(marketProb)}%.`,
    `Estimated edge is ${signedPct(edgePct)}.`,
    `Starting pitcher edge: ${signedPct(componentScores.side.startingPitcher * 2)}. Matchup: ${starterText}.`,
    `Bullpen edge: ${signedPct(componentScores.side.bullpen * 2)}. Offense edge: ${signedPct(componentScores.side.offenseVsHand * 2)}.`
  ];
}

function buildTotalReasons(direction, line, modelOutputs, componentScores) {
  const edge = direction === "Over" ? modelOutputs.overEdgePct : modelOutputs.underEdgePct;
  const meta = componentScores.meta || {};
  const park = meta.park || {};

  return [
    `Fair total projects to ${modelOutputs.fairTotal !== null ? modelOutputs.fairTotal : "N/A"} against market ${line}.`,
    `${direction} edge is estimated at ${signedPct(edge)}.`,
    `Starter suppression score: ${signedPct(componentScores.total.starterRunSuppression * 2)}. Bullpen suppression score: ${signedPct(componentScores.total.bullpenRunSuppression * 2)}.`,
    `Offense score: ${signedPct(componentScores.total.offenseQuality * 2)}. Park factor: ${park.factor || "N/A"} (${park.roof || "unknown"} roof type).`
  ];
}

function buildRunLineReasons(teamName, line, side, modelOutputs, componentScores) {
  const edge = side === "home" ? modelOutputs.homeEdgePct : modelOutputs.awayEdgePct;
  return [
    `${teamName} run line ${formatSpread(line)} becomes viable only because the straight side already grades positively.`,
    `Base side edge is ${signedPct(edge)} before applying extra run-line caution.`,
    `Starting pitcher edge: ${signedPct(componentScores.side.startingPitcher * 2)}. Bullpen edge: ${signedPct(componentScores.side.bullpen * 2)}.`,
    `Run lines are treated as lower-quality than straight moneylines unless the side profile is clearly favorable.`
  ];
}

function buildFirstFiveSideReasons(teamName, side, firstFiveModelOutputs, componentScores, moneylineData) {
  const winProb = side === "home" ? firstFiveModelOutputs.homeWinProb : firstFiveModelOutputs.awayWinProb;
  const fairPrice = side === "home" ? firstFiveModelOutputs.fairMlHome : firstFiveModelOutputs.fairMlAway;
  const edgePct = side === "home" ? firstFiveModelOutputs.homeEdgePct : firstFiveModelOutputs.awayEdgePct;
  const marketProb = side === "home" ? moneylineData.homeProb : moneylineData.awayProb;
  const meta = componentScores.meta || {};
  const starterText = meta.probablePitchers
    ? `${meta.probablePitchers.away} vs ${meta.probablePitchers.home}`
    : "Probable pitchers not posted";

  return [
    `${teamName} first-5 fair moneyline projects to ${formatAmerican(fairPrice)}.`,
    `First-5 model win probability is ${winProb}% versus market implied ${toPctNumber(marketProb)}%.`,
    `Estimated F5 edge is ${signedPct(edgePct)}.`,
    `F5 weighting leans heavily on the starting pitcher matchup: ${starterText}.`,
    `Offense support still matters, but bullpen influence is intentionally reduced for the first 5 innings.`
  ];
}

function buildFirstFiveTotalReasons(direction, line, firstFiveModelOutputs, componentScores) {
  const edge = direction === "Over" ? firstFiveModelOutputs.overEdgePct : firstFiveModelOutputs.underEdgePct;
  const meta = componentScores.meta || {};
  const park = meta.park || {};

  return [
    `Fair F5 total projects to ${firstFiveModelOutputs.fairTotal !== null ? firstFiveModelOutputs.fairTotal : "N/A"} against market ${line}.`,
    `${direction} F5 edge is estimated at ${signedPct(edge)}.`,
    `Starter suppression matters more than bullpen suppression in the F5 model.`,
    `Park factor remains ${park.factor || "N/A"} (${park.roof || "unknown"} roof type), but carries less weight than the listed starters.`
  ];
}

function buildFirstFiveRunLineReasons(teamName, line, side, firstFiveModelOutputs, componentScores) {
  const edge = side === "home" ? firstFiveModelOutputs.homeEdgePct : firstFiveModelOutputs.awayEdgePct;
  return [
    `${teamName} F5 run line ${formatSpread(line)} is only considered when the F5 side already grades positively.`,
    `Base F5 side edge is ${signedPct(edge)} before applying extra run-line caution.`,
    `Starting pitcher edge remains the core F5 driver at this stage of the model.`,
    `F5 run lines are treated as lower quality than straight F5 moneylines unless the early-game profile is clearly favorable.`
  ];
}

function buildRiskWarnings(componentScores) {
  const warnings = [];
  if (componentScores.liveFeedStatus.startingPitcher !== "live") warnings.push("Starting pitcher data is incomplete or probable pitchers are not posted.");
  if (componentScores.liveFeedStatus.bullpen !== "live") warnings.push("Bullpen inputs are not fully live.");
  if (componentScores.liveFeedStatus.lineup === "projected") warnings.push("Props are currently using projected lineups, not official lineups.");
  if (componentScores.liveFeedStatus.parkWeather === "missing") warnings.push("Park and weather adjustments are missing.");
  if (componentScores.liveFeedStatus.scheduleTravel !== "live") warnings.push("Schedule and travel adjustments are not yet live.");
  return warnings;
}

function buildDebugBlock({
  homeTeam,
  awayTeam,
  moneylineData,
  spreadData,
  totalData,
  lineupContext,
  gameContext,
  teamStatsMap,
  parkContext,
  componentScores,
  modelOutputs,
  firstFiveData,
  firstFiveModelOutputs,
  recommendation
}) {
  const homeTeamStats = teamStatsMap[homeTeam] || {};
  const awayTeamStats = teamStatsMap[awayTeam] || {};

  const homeHittingStats = homeTeamStats.hitting || {};
  const awayHittingStats = awayTeamStats.hitting || {};
  const homePitchingStats = homeTeamStats.pitching || {};
  const awayPitchingStats = awayTeamStats.pitching || {};

  const homeOffenseRaw = scoreOffense(homeHittingStats);
  const awayOffenseRaw = scoreOffense(awayHittingStats);
  const homeBullpenRaw = scoreTeamPitching(homePitchingStats);
  const awayBullpenRaw = scoreTeamPitching(awayPitchingStats);
  const homeStarterRaw = scorePitcher(gameContext && gameContext.homeProbablePitcher);
  const awayStarterRaw = scorePitcher(gameContext && gameContext.awayProbablePitcher);

  const homeHasHittingStats = Object.keys(homeHittingStats).length > 0;
  const awayHasHittingStats = Object.keys(awayHittingStats).length > 0;
  const homeHasPitchingStats = Object.keys(homePitchingStats).length > 0;
  const awayHasPitchingStats = Object.keys(awayPitchingStats).length > 0;

  return {
    dataAvailability: {
      officialLineupAvailable: lineupContext.officialLineupAvailable,
      homeProbablePitcherFound: !!(gameContext && gameContext.homeProbablePitcher),
      awayProbablePitcherFound: !!(gameContext && gameContext.awayProbablePitcher),
      homeHittingStatsFound: homeHasHittingStats,
      awayHittingStatsFound: awayHasHittingStats,
      homePitchingStatsFound: homeHasPitchingStats,
      awayPitchingStatsFound: awayHasPitchingStats,
      parkContextFound: !!parkContext,
      moneylineFound: moneylineData.homeProb !== null && moneylineData.awayProb !== null,
      spreadFound: spreadData.homePoint !== null && spreadData.awayPoint !== null,
      totalFound: totalData.point !== null,
      firstFiveMoneylineFound: !!(firstFiveData && firstFiveData.moneyline && firstFiveData.moneyline.homeProb !== null && firstFiveData.moneyline.awayProb !== null),
      firstFiveSpreadFound: !!(firstFiveData && firstFiveData.spread && firstFiveData.spread.homePoint !== null && firstFiveData.spread.awayPoint !== null),
      firstFiveTotalFound: !!(firstFiveData && firstFiveData.total && firstFiveData.total.point !== null)
    },
    rawInputs: {
      probablePitchers: {
        away: gameContext && gameContext.awayProbablePitcher ? gameContext.awayProbablePitcher : null,
        home: gameContext && gameContext.homeProbablePitcher ? gameContext.homeProbablePitcher : null
      },
      teamHittingSnapshot: {
        away: pickStatsSnapshot(awayHittingStats, ["ops", "obp", "slg", "runs", "gamesPlayed"]),
        home: pickStatsSnapshot(homeHittingStats, ["ops", "obp", "slg", "runs", "gamesPlayed"])
      },
      teamPitchingSnapshot: {
        away: pickStatsSnapshot(awayPitchingStats, ["era", "whip", "walksAndHitsPerInningPitched", "strikeOuts", "inningsPitched"]),
        home: pickStatsSnapshot(homePitchingStats, ["era", "whip", "walksAndHitsPerInningPitched", "strikeOuts", "inningsPitched"])
      },
      parkContext: parkContext || null,
      firstFiveMarkets: firstFiveData || null
    },
    rawScores: {
      awayStarterRaw,
      homeStarterRaw,
      awayBullpenRaw,
      homeBullpenRaw,
      awayOffenseRaw,
      homeOffenseRaw
    },
    derivedDrivers: {
      side: componentScores.side,
      total: componentScores.total
    },
    interpretation: {
      startingPitcherZeroReason: explainZeroReason(componentScores.side.startingPitcher, [
        !!(gameContext && gameContext.homeProbablePitcher),
        !!(gameContext && gameContext.awayProbablePitcher)
      ]),
      bullpenZeroReason: explainZeroReason(componentScores.side.bullpen, [
        homeHasPitchingStats,
        awayHasPitchingStats
      ]),
      offenseZeroReason: explainZeroReason(componentScores.side.offenseVsHand, [
        homeHasHittingStats,
        awayHasHittingStats
      ]),
      lineupZeroReason: explainLineupReason(componentScores.side.lineup, lineupContext),
      recommendationType: recommendation.bestBetType,
      recommendationBet: recommendation.bestBet
    },
    modelOutputs,
    firstFiveModelOutputs: firstFiveModelOutputs || null
  };
}

function pickStatsSnapshot(stat, keys) {
  const out = {};
  keys.forEach(key => {
    if (stat && Object.prototype.hasOwnProperty.call(stat, key)) {
      out[key] = stat[key];
    }
  });
  return out;
}

function explainZeroReason(driverValue, dependenciesPresent) {
  const depOk = dependenciesPresent.every(Boolean);
  if (Math.abs(Number(driverValue || 0)) > 0.001) return "Non-zero; this is an active model score.";
  if (!depOk) return "Zero because one or more required inputs were missing.";
  return "Zero because both sides graded essentially even.";
}

function explainLineupReason(driverValue, lineupContext) {
  if (Math.abs(Number(driverValue || 0)) > 0.001) return "Non-zero lineup adjustment is active.";
  if (!lineupContext.officialLineupAvailable) return "Zero because projected-lineup mode is active and no side-specific lineup strength is modeled yet.";
  return "Zero because lineup mode is official but no side-specific batter-strength model is connected yet.";
}