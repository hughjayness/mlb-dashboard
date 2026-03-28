export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ODDS_API_KEY"
    });
  }

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&bookmakers=betmgm`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Odds API request failed",
        details: await response.text()
      });
    }

    const data = await response.json();

    const games = data.map((game, index) => {
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

      const evaluation = evaluateGame({
        homeTeam,
        awayTeam,
        moneylineData,
        spreadData,
        totalData
      });

      return {
        id: String(index + 1),
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
        reasons: evaluation.reasons
      };
    });

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
    display:
      `${awayTeam} ${formatAmerican(away.price)} / ${homeTeam} ${formatAmerican(home.price)}`,
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
    display:
      `O/U ${over.point} (O ${formatAmerican(over.price)} / U ${formatAmerican(under.price)})`,
    point: over.point,
    overPrice: over.price,
    underPrice: under.price,
    overProb: americanToProb(over.price),
    underProb: americanToProb(under.price)
  };
}

function evaluateGame({ homeTeam, awayTeam, moneylineData, spreadData, totalData }) {
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
      if (moneylineData.homePrice < -140) {
        reasons.push("Book is showing a meaningful favorite price");
      } else {
        reasons.push("Book shows only a moderate favorite, so confidence stays lower");
      }
    }

    if (moneylineData.awayProb > moneylineData.homeProb && awayEdge > bestScore) {
      bestScore = awayEdge;
      bestBet = `${awayTeam} ML`;
      bestBetType = "Side";
      reasons.length = 0;
      reasons.push(`${awayTeam} is the shorter moneyline side`);
      reasons.push(`Implied win probability is ${toPct(moneylineData.awayProb)}`);
      if (moneylineData.awayPrice < -140) {
        reasons.push("Book is showing a meaningful favorite price");
      } else {
        reasons.push("Book shows only a moderate favorite, so confidence stays lower");
      }
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
      reasons.push(
        `${overFavored ? "Over" : "Under"} is priced shorter than the other side`
      );
      reasons.push(
        `Implied market lean: ${overFavored ? toPct(totalData.overProb) : toPct(totalData.underProb)}`
      );
      reasons.push("This is based on live BetMGM pricing only");
    }
  }

  if (spreadData.homePoint !== null && spreadData.awayPoint !== null) {
    const homeFavoredRL = spreadData.homePoint < 0;
    const awayFavoredRL = spreadData.awayPoint < 0;

    if (bestBetType === "Pass") {
      if (homeFavoredRL) {
        bestBet = `${homeTeam} RL`;
        bestBetType = "Side";
        reasons.length = 0;
        reasons.push(`${homeTeam} is laying runs on the spread market`);
        reasons.push("Run line suggests bookmaker sees home side as stronger");
        reasons.push("This is a weaker signal than a strong moneyline split");
      } else if (awayFavoredRL) {
        bestBet = `${awayTeam} RL`;
        bestBetType = "Side";
        reasons.length = 0;
        reasons.push(`${awayTeam} is laying runs on the spread market`);
        reasons.push("Run line suggests bookmaker sees away side as stronger");
        reasons.push("This is a weaker signal than a strong moneyline split");
      }
    }
  }

  if (bestScore >= 0.12) {
    confidence = "High";
  } else if (bestScore >= 0.06) {
    confidence = "Medium";
  } else {
    confidence = "Low";
  }

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