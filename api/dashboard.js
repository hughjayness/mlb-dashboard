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

    const data = await oddsResponse.json();

    const upcomingGames = (Array.isArray(data) ? data : []).filter(game => {
      if (!game || !game.commence_time) return false;
      return new Date(game.commence_time).getTime() > Date.now();
    });

    const limitedGames = upcomingGames.slice(0, 10);

    const games = await Promise.all(
      limitedGames.map(async (game, index) => {
        const bookmaker = Array.isArray(game.bookmakers) ? game.bookmakers[0] : null;
        const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = game.home_team || "Home";
        const awayTeam = game.away_team || "Away";

        const moneylineData = parseMoneyline(h2hMarket, homeTeam, awayTeam);
        const spreadData = parseSpreads(spreadMarket, homeTeam, awayTeam);
        const totalData = parseTotals(totalMarket);

        const lineupContext = buildLineupContext({
          homeTeam,
          awayTeam,
          mlbLineups
        });

        const propResult = await fetchTopPropForEvent(game.id, apiKey, lineupContext);

        const componentScores = buildComponentScores({
          moneylineData,
          totalData,
          lineupContext
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
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
          componentScores,
          propResult
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
          bestBetOdds: deriveBestBetOdds({
            recommendation,
            moneylineData,
            spreadData,
            totalData,
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
          riskWarnings: buildRiskWarnings(componentScores)
        };
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      notes: [
        "Official lineups are checked from MLB starting-lineups page first.",
        "Props are now optional challengers and must clearly beat game markets.",
        "Best-bet odds are returned so props and game bets can be archived for ROI tracking."
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

function buildComponentScores({ moneylineData, totalData, lineupContext }) {
  const homeMarketLean =
    moneylineData.homeProb !== null && moneylineData.awayProb !== null
      ? clamp((moneylineData.homeProb - moneylineData.awayProb) * 4, -2, 2)
      : 0;

  const totalMarketLean =
    totalData.overProb !== null && totalData.underProb !== null
      ? clamp((totalData.overProb - totalData.underProb) * 4, -2, 2)
      : 0;

  const lineupScore = lineupContext.officialLineupAvailable ? 0.25 : 0.0;

  return {
    side: {
      startingPitcher: 0,
      bullpen: 0,
      lineup: lineupScore,
      offenseVsHand: 0,
      defense: 0,
      parkWeather: 0,
      scheduleTravel: 0,
      marketContext: round2(homeMarketLean)
    },
    total: {
      starterRunSuppression: 0,
      bullpenRunSuppression: 0,
      offenseQuality: 0,
      lineups: lineupScore,
      parkFactor: 0,
      weather: 0,
      catcherDefense: 0,
      marketContext: round2(totalMarketLean)
    },
    liveFeedStatus: {
      startingPitcher: "placeholder",
      bullpen: "placeholder",
      lineup: lineupContext.officialLineupAvailable ? "official" : "projected",
      offenseVsHand: "placeholder",
      defense: "placeholder",
      parkWeather: "placeholder",
      scheduleTravel: "placeholder",
      marketContext: "live"
    }
  };
}

function buildModelOutputs({ componentScores, moneylineData, totalData, lineupContext, propResult }) {
  const sideComposite =
    (0.30 * componentScores.side.startingPitcher) +
    (0.20 * componentScores.side.bullpen) +
    (0.15 * componentScores.side.lineup) +
    (0.15 * componentScores.side.offenseVsHand) +
    (0.05 * componentScores.side.defense) +
    (0.05 * componentScores.side.parkWeather) +
    (0.05 * componentScores.side.scheduleTravel) +
    (0.05 * componentScores.side.marketContext);

  const totalComposite =
    (0.25 * componentScores.total.starterRunSuppression) +
    (0.20 * componentScores.total.bullpenRunSuppression) +
    (0.20 * componentScores.total.offenseQuality) +
    (0.10 * componentScores.total.lineups) +
    (0.10 * componentScores.total.parkFactor) +
    (0.10 * componentScores.total.weather) +
    (0.05 * componentScores.total.catcherDefense);

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

function deriveSpreadFavorite(moneylineData) {
  if (moneylineData.homeProb === null || moneylineData.awayProb === null) return null;
  if (moneylineData.homeProb > moneylineData.awayProb) return "home";
  if (moneylineData.awayProb > moneylineData.homeProb) return "away";
  return null;
}

function buildRecommendation({
  const gameCandidates = [];

  if (typeof modelOutputs.homeEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${homeTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.homeEdgePct,
      reasons: buildSideReasons(homeTeam, "home", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.homeEdgePct)
    });
  }

  if (typeof modelOutputs.awayEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${awayTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.awayEdgePct,
      reasons: buildSideReasons(awayTeam, "away", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.awayEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.overEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Over ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.overEdgePct,
      reasons: buildTotalReasons("Over", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.overEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.underEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Under ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.underEdgePct,
      reasons: buildTotalReasons("Under", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.underEdgePct)
    });
  }

  const positiveGames = gameCandidates.filter(c => typeof c.edge === "number" && c.edge > 0);
  const bestGame = positiveGames.sort((a, b) => b.edge - a.edge)[0] || null;

  let best = bestGame;

  if (propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
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
function deriveBestBetOdds({ recommendation, moneylineData, spreadData, totalData, propResult, homeTeam, awayTeam }) {
  if (!recommendation || !recommendation.bestBet) return null;

  const bestBet = recommendation.bestBet;

  if (recommendation.bestBetType === "Prop") {
    return propResult && propResult.topProp && typeof propResult.topProp.price === "number"
      ? propResult.topProp.price
      : null;
  }

  if (/ ML$/i.test(bestBet)) {
    if (bestBet === `${awayTeam} ML`) return moneylineData.awayPrice ?? null;
    if (bestBet === `${homeTeam} ML`) return moneylineData.homePrice ?? null;
  }

  if (/^Over /i.test(bestBet)) return totalData.overPrice ?? null;
  if (/^Under /i.test(bestBet)) return totalData.underPrice ?? null;

  if (bestBet.indexOf(awayTeam) === 0) return spreadData.awayPrice ?? null;
  if (bestBet.indexOf(homeTeam) === 0) return spreadData.homePrice ?? null;

  return null;
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
    componentScores.liveFeedStatus.marketContext === "live"
      ? "Current side model is driven mainly by live market context until pitcher, bullpen, lineup, weather, and travel feeds are connected."
      : "Side model inputs are incomplete."
  ];
}

function buildTotalReasons(direction, line, modelOutputs, componentScores) {
  const edge = direction === "Over" ? modelOutputs.overEdgePct : modelOutputs.underEdgePct;

  return [
    `Fair total projects to ${modelOutputs.fairTotal !== null ? modelOutputs.fairTotal : "N/A"} against market ${line}.`,
    `${direction} edge is estimated at ${signedPct(edge)}.`,
    "Current total model will improve materially once weather, park, lineups, bullpen, and catcher-defense feeds are connected.",
    componentScores.liveFeedStatus.marketContext === "live"
      ? "Current total signal is anchored to live market pricing."
      : "Current total signal is partially incomplete."
  ];
}

function buildRiskWarnings(componentScores) {
  const warnings = [];
  if (componentScores.liveFeedStatus.startingPitcher !== "live") warnings.push("Starting pitcher model inputs are not yet live.");
  if (componentScores.liveFeedStatus.bullpen !== "live") warnings.push("Bullpen fatigue and availability are not yet live.");
  if (componentScores.liveFeedStatus.lineup === "projected") warnings.push("Props are currently using projected lineups, not official lineups.");
  if (componentScores.liveFeedStatus.parkWeather !== "live") warnings.push("Weather and park adjustments are not yet live.");
  if (componentScores.liveFeedStatus.scheduleTravel !== "live") warnings.push("Schedule and travel adjustments are not yet live.");
  return warnings;
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

function parseMoneyline(market, homeTeam, awayTeam) {
  if (!market || !Array.isArray(market.outcomes) || market.outcomes.length < 2) {
    return { display: "N/A", homePrice: null, awayPrice: null, homeProb: null, awayProb: null };
  }

  const home = market.outcomes.find(o => o.name === homeTeam);
  const away = market.outcomes.find(o => o.name === awayTeam);

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

  const home = market.outcomes.find(o => o.name === homeTeam);
  const away = market.outcomes.find(o => o.name === awayTeam);

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

function stakeFromConfidence(confidence) {
  if (confidence === "High") return 1.5;
  if (confidence === "Medium") return 1.0;
  if (confidence === "Low") return 0.5;
  return 0;
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