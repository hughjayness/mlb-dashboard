export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ODDS_API_KEY"
    });
  }

  const nowIso = new Date().toISOString();

  const baseUrl =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&bookmakers=betmgm` +
    `&oddsFormat=american` +
    `&commenceTimeFrom=${encodeURIComponent(nowIso)}`;

  try {
    const response = await fetch(baseUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Odds API request failed",
        details: await response.text()
      });
    }

    const data = await response.json();

    const upcomingGames = data.filter(game => {
      if (!game.commence_time) return false;
      return new Date(game.commence_time).getTime() > Date.now();
    });

    const games = await Promise.all(
      upcomingGames.map(async (game, index) => {
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

        const topProp = await fetchTopPropForEvent(game.id, apiKey);

        const evaluation = evaluateGame({
          homeTeam,
          awayTeam,
          moneylineData,
          spreadData,
          totalData,
          topProp
        });

        return {
          id: String(index + 1),
          eventId: game.id,
          time: game.commence_time
            ? new Date(game.commence_time).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
              })
            : "TBD",
          away: awayTeam,
          home: homeTeam,
          moneyline: moneylineData.display,
          total: totalData.display,
          bestBet: evaluation.bestBet,
          bestBetType: evaluation.bestBetType,
          confidence: evaluation.confidence,
          reasons: evaluation.reasons,
          topProp
        };
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      games
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not load odds data",
      details: error.message
    });
  }
}

async function fetchTopPropForEvent(eventId, apiKey) {
  const propMarkets = [
    "batter_home_runs",
    "batter_hits",
    "batter_total_bases",
    "pitcher_strikeouts"
  ].join(",");

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&bookmakers=betmgm` +
    `&markets=${propMarkets}` +
    `&oddsFormat=american`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const bookmaker = Array.isArray(data.bookmakers) ? data.bookmakers[0] : null;
    const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

    let bestProp = null;

    for (const market of markets) {
      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];

      for (const outcome of outcomes) {
        const score = scorePropOutcome(market.key, outcome);

        if (!bestProp || score > bestProp._score) {
          bestProp = {
            player: outcome.description || outcome.name || "Unknown Player",
            market: buildPropLabel(market.key, outcome),
            modelProb: propPriceToProb(outcome.price),
            reasons: buildPropReasons(market.key, outcome),
            _score: score
          };
        }
      }
    }

    if (!bestProp) {
      return null;
    }

    delete bestProp._score;
    return bestProp;
  } catch (error) {
    return null;
  }
}

function scorePropOutcome(marketKey, outcome) {
  let score = 0;

  if (outcome.name === "Over") score += 20;
  if (outcome.price < 0) score += Math.min(Math.abs(outcome.price), 250) / 10;
  if (marketKey === "pitcher_strikeouts") score += 8;
  if (marketKey === "batter_total_bases") score += 6;
  if (marketKey === "batter_hits") score += 5;
  if (marketKey === "batter_home_runs") score += 2;

  return score;
}

function buildPropLabel(marketKey, outcome) {
  const pointText =
    outcome.point !== undefined && outcome.point !== null
      ? ` ${outcome.name} ${outcome.point}`
      : ` ${outcome.name}`;

  switch (marketKey) {
    case "pitcher_strikeouts":
      return `Pitcher Strikeouts${pointText}`;
    case "batter_total_bases":
      return `Total Bases${pointText}`;
    case "batter_hits":
      return `Hits${pointText}`;
    case "batter_home_runs":
      return `Home Runs${pointText}`;
    default:
      return `${marketKey}${pointText}`;
  }
}

function buildPropReasons(marketKey, outcome) {
  const reasons = [];

  reasons.push("Returned by live BetMGM prop market");

  if (outcome.name === "Over") {
    reasons.push("Current logic prefers the over side of this prop");
  } else if (outcome.name === "Under") {
    reasons.push("Current logic prefers the under side of this prop");
  }

  if (outcome.price < 0) {
    reasons.push(`Book prices this as a favored outcome at ${formatAmerican(outcome.price)}`);
  } else {
    reasons.push(`Book prices this as a plus-money outcome at ${formatAmerican(outcome.price)}`);
  }

  switch (marketKey) {
    case "pitcher_strikeouts":
      reasons.push("Pitcher strikeout props are a strong first prop category to track");
      break;
    case "batter_total_bases":
      reasons.push("Total bases props are useful for power-hitter evaluation");
      break;
    case "batter_hits":
      reasons.push("Hits props are generally steadier than home run props");
      break;
    case "batter_home_runs":
      reasons.push("Home run props are more volatile than most prop types");
      break;
  }

  return reasons;
}

function propPriceToProb(price) {
  const prob = americanToProb(price);
  if (prob === null) return null;
  return Math.round(prob * 100);
}

function parseMoneyline(market, homeTeam, awayTeam) {
  if (!market || !Array.isArray(market.outcomes) || market.outcomes.length < 2) {
    return {
      display: "N/A",
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
      homePrice: null,
      awayPrice: null,
      homeProb: null,
      awayProb: null
    };
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
      awayPrice: null
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
      awayPrice: null
    };
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
    return {
      display: "N/A",
      point: null,
      overPrice: null,
      underPrice: null,
      overProb: null,
      underProb: null
    };
  }

  const over = market.outcomes.find(o => o.name === "Over");
  const under = market.outcomes.find(o => o.name === "Under");

  if (!over || !under) {
    return {
      display: "N/A",
      point: null,
      overPrice: null,
      underPrice: null,
      overProb: null,
      underProb: null
    };
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

function evaluateGame({ homeTeam, awayTeam, moneylineData, spreadData, totalData, topProp }) {
  const reasons = [];
  let bestBet = "No clear edge";
  let bestBetType = "Pass";
  let confidence = "Low";

  let bestScore = -999;

  if (moneylineData.homeProb !== null && moneylineData.awayProb !== null) {
    const homeEdge = Math.abs(moneylineData.homeProb - 0.5);
    const awayEdge = Math.abs(moneylineData.awayProb - 0.5);

    if (moneylineData.homeProb > moneylineData.awayProb && homeEdge > bestScore) {
      bestScore = homeEdge;
      bestBet = `${homeTeam} ML`;
      bestBetType = "Side";
      reasons.length = 0;
      reasons.push(`${homeTeam} is the shorter moneyline side`);
      reasons.push(`Implied win probability is ${toPct(moneylineData.homeProb)}`);
      reasons.push("Evaluation is based on live market pricing");
    }

    if (moneylineData.awayProb > moneylineData.homeProb && awayEdge > bestScore) {
      bestScore = awayEdge;
      bestBet = `${awayTeam} ML`;
      bestBetType = "Side";
      reasons.length = 0;
      reasons.push(`${awayTeam} is the shorter moneyline side`);
      reasons.push(`Implied win probability is ${toPct(moneylineData.awayProb)}`);
      reasons.push("Evaluation is based on live market pricing");
    }
  }

  if (totalData.overProb !== null && totalData.underProb !== null) {
    const totalEdge = Math.abs(totalData.overProb - totalData.underProb);

    if (totalEdge > bestScore) {
      const overFavored = totalData.overProb > totalData.underProb;
      bestScore = totalEdge;
      bestBet = `${overFavored ? "Over" : "Under"} ${totalData.point}`;
      bestBetType = "Total";
      reasons.length = 0;
      reasons.push(`${overFavored ? "Over" : "Under"} is priced shorter than the other side`);
      reasons.push(`Implied market lean is ${overFavored ? toPct(totalData.overProb) : toPct(totalData.underProb)}`);
      reasons.push("Evaluation is based on live market pricing");
    }
  }

  if (bestBetType === "Pass" && spreadData.homePoint !== null && spreadData.awayPoint !== null) {
    if (spreadData.homePoint < 0) {
      bestBet = `${homeTeam} RL`;
      bestBetType = "Side";
      reasons.length = 0;
      reasons.push(`${homeTeam} is laying runs on the run line`);
      reasons.push("Spread market indicates a stronger home side");
      reasons.push("This is weaker than a strong moneyline split");
    } else if (spreadData.awayPoint < 0) {
      bestBet = `${awayTeam} RL`;
      bestBetType = "Side";
      reasons.length = 0;
      reasons.push(`${awayTeam} is laying runs on the run line`);
      reasons.push("Spread market indicates a stronger away side");
      reasons.push("This is weaker than a strong moneyline split");
    }
  }

  if (topProp && topProp.modelProb !== null) {
    const propScore = Math.abs((topProp.modelProb / 100) - 0.5);

    if (propScore > bestScore) {
      bestScore = propScore;
      bestBet = `${topProp.player} ${topProp.market}`;
      bestBetType = "Prop";
      reasons.length = 0;
      reasons.push(`Top live prop returned is ${topProp.player} ${topProp.market}`);
      reasons.push(`Implied prop probability is ${topProp.modelProb}%`);
      reasons.push("Prop evaluation is currently market-based");
    }
  }

  if (bestScore >= 0.12) confidence = "High";
  else if (bestScore >= 0.06) confidence = "Medium";
  else confidence = "Low";

  if (bestBet === "No clear edge") {
    reasons.push("Live odds did not show a strong enough split");
    reasons.push("No recommendation until more model inputs are added");
  }

  return {
    bestBet,
    bestBetType,
    confidence,
    reasons
  };
}

function americanToProb(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) {
    return null;
  }

  const p = Number(price);

  if (p < 0) {
    return Math.abs(p) / (Math.abs(p) + 100);
  }

  return 100 / (p + 100);
}

function formatAmerican(price) {
  if (price === null || price === undefined) return "N/A";
  return price > 0 ? `+${price}` : `${price}`;
}

function formatSpread(point) {
  if (point === null || point === undefined) return "N/A";
  return point > 0 ? `+${point}` : `${point}`;
}

function toPct(value) {
  return `${Math.round(value * 100)}%`;
}