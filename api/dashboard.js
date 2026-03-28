export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  const oddsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=betmgm`;

  try {
    const oddsResp = await fetch(oddsUrl);
    const oddsData = await oddsResp.json();

    res.status(200).json({
      lastUpdated: new Date().toISOString(),
      odds: oddsData
    });
  } catch (error) {
    res.status(500).json({
      error: "Could not load odds data"
    });
  }
}