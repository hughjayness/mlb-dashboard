export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&bookmakers=betmgm`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const games = data.map((game, index) => {
      const bookmaker = game.bookmakers && game.bookmakers[0];
      const markets = bookmaker ? bookmaker.markets : [];

      let moneyline = "N/A";
      let total = "N/A";
      let runLine = "N/A";

      for (const market of markets) {
        if (market.key === "h2h") {
          const outcomes = market.outcomes || [];
          if (outcomes.length >= 2) {
            moneyline = outcomes
              .map(o => `${o.name} ${o.price > 0 ? "+" : ""}${o.price}`)
              .join(" / ");
          }
        }

        if (market.key === "totals") {
          const outcomes = market.outcomes || [];
          if (outcomes.length >= 2) {
            const over = outcomes.find(o => o.name === "Over");
            const under = outcomes.find(o => o.name === "Under");
            if (over && under) {
              total = `O/U ${over.point} (O ${over.price > 0 ? "+" : ""}${over.price} / U ${under.price > 0 ? "+" : ""}${under.price})`;
            }
          }
        }

        if (market.key === "spreads") {
          const outcomes = market.outcomes || [];
          if (outcomes.length >= 2) {
            runLine = outcomes
              .map(o => `${o.name} ${o.point > 0 ? "+" : ""}${o.point} (${o.price > 0 ? "+" : ""}${o.price})`)
              .join(" / ");
          }
        }
      }

      return {
        id: String(index + 1),
        time: game.commence_time
          ? new Date(game.commence_time).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            })
          : "TBD",
        away: game.away_team || "Away",
        home: game.home_team || "Home",
        moneyline,
        total,
        runLine,
        projectedAway: "—",
        projectedHome: "—",
        bestTotal: total !== "N/A" ? "Review total market" : "—",
        bestSide: moneyline !== "N/A" ? "Review moneyline market" : "—",
        weather: "Need weather feed",
        park: "Need park factor feed",
        pitchers: "Need MLB probable pitchers feed",
        props: [
          {
            player: "Need prop feed",
            market: "",
            prob: "—"
          }
        ],
        note: "Live BetMGM odds loaded successfully."
      };
    });

    res.status(200).json({
      lastUpdated: new Date().toISOString(),
      games
    });
  } catch (error) {
    res.status(500).json({
      error: "Could not load odds data",
      details: error.message
    });
  }
}