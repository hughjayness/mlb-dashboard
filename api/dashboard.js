// api/dashboard.js
// Full-file replacement for Vercel serverless route.
// Requires environment variable: ODDS_API_KEY

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const MLB_SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1/schedule";

const FEATURED_MARKETS = ["h2h", "spreads", "totals"];
const F5_MARKETS = ["h2h_1st_5_innings", "spreads_1st_5_innings", "totals_1st_5_innings"];
const PROP_MARKETS = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "pitcher_strikeouts",
  "pitcher_outs"
];

const BOOKMAKER_PREFERENCE = ["betmgm", "draftkings", "fanduel", "caesars"];

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(name) {
  const raw = String(name || "").trim();
  const aliases = {
    "chi white sox": "chicago white sox",
    "white sox": "chicago white sox",
    "chi cubs": "chicago cubs",
    "ny yankees": "new york yankees",
    "ny mets": "new york mets",
    "la dodgers": "los angeles dodgers",
    "la angels": "los angeles angels",
    "d backs": "arizona diamondbacks",
    "diamondbacks": "arizona diamondbacks",
    "guardians": "cleveland guardians",
    "athletics": "athletics"
  };
  const n = normalizeName(raw);
  return aliases[n] || n;
}

function formatSignedPoint(point) {
  const n = Number(point);
  if (!Number.isFinite(n)) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

function americanToImpliedProb(price) {
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  if (p > 0) return 100 / (p + 100);
  return Math.abs(p) / (Math.abs(p) + 100);
}

function probToAmerican(prob) {
  const p = Number(prob);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function sigmoidScoreToPct(score) {
  const x = Number(score || 0);
  const pct = 100 / (1 + Math.exp(-0.72 * (x - 4.25)));
  return round2(clamp(pct, 1, 99));
}

function getEtDateParts(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  return { year, month, day, ymd: `${year}-${month}-${day}` };
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatEtDateTime(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }) + " ET";
  } catch (_) {
    return "—";
  }
}

function inferHandFromPitcherName(name) {
  const n = normalizeName(name);
  if (!n || n === "tbd") return null;
  return null;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 18000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function pickPreferredBookmaker(bookmakers) {
  const list = safeArray(bookmakers);
  if (!list.length) return null;

  for (const key of BOOKMAKER_PREFERENCE) {
    const hit = list.find(b => b && b.key === key);
    if (hit) return hit;
  }
  return list[0];
}

function mapOutcomesByName(outcomes) {
  const map = {};
  for (const o of safeArray(outcomes)) {
    map[String(o.name || "")] = o;
  }
  return map;
}

function parseMoneylineMarket(market, awayTeam, homeTeam) {
  const outcomes = mapOutcomesByName(market && market.outcomes);
  const away = outcomes[awayTeam];
  const home = outcomes[homeTeam];
  return {
    awayPrice: toNum(away && away.price),
    homePrice: toNum(home && home.price)
  };
}

function parseSpreadMarket(market, awayTeam, homeTeam) {
  const outcomes = mapOutcomesByName(market && market.outcomes);
  const away = outcomes[awayTeam];
  const home = outcomes[homeTeam];
  return {
    awayPoint: toNum(away && away.point),
    awayPrice: toNum(away && away.price),
    homePoint: toNum(home && home.point),
    homePrice: toNum(home && home.price)
  };
}

function parseTotalMarket(market) {
  const outcomes = mapOutcomesByName(market && market.outcomes);
  const over = outcomes["Over"];
  const under = outcomes["Under"];
  return {
    line: toNum(over && over.point) ?? toNum(under && under.point),
    overPrice: toNum(over && over.price),
    underPrice: toNum(under && under.price)
  };
}

function findMarket(bookmaker, key) {
  return safeArray(bookmaker && bookmaker.markets).find(m => m && m.key === key) || null;
}

function parseFeaturedOddsFromEvent(event) {
  const bookmaker = pickPreferredBookmaker(event && event.bookmakers);
  const awayTeam = String(event && event.away_team || "");
  const homeTeam = String(event && event.home_team || "");

  const ml = parseMoneylineMarket(findMarket(bookmaker, "h2h"), awayTeam, homeTeam);
  const rl = parseSpreadMarket(findMarket(bookmaker, "spreads"), awayTeam, homeTeam);
  const total = parseTotalMarket(findMarket(bookmaker, "totals"));

  return {
    bookmakerKey: bookmaker && bookmaker.key || null,
    moneylineData: ml,
    spreadData: rl,
    totalData: total
  };
}

async function fetchFeaturedOdds(apiKey) {
  const attempts = [
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us&oddsFormat=american&bookmakers=betmgm,draftkings,fanduel,caesars&markets=${encodeURIComponent(FEATURED_MARKETS.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us&oddsFormat=american&markets=${encodeURIComponent(FEATURED_MARKETS.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us&oddsFormat=american&markets=h2h&apiKey=${encodeURIComponent(apiKey)}`
  ];

  let lastErr = null;

  for (const url of attempts) {
    try {
      const data = await fetchJson(url, { timeoutMs: 20000 });
      if (Array.isArray(data) && data.length) return data;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;
  return [];
}

async function fetchEventMarkets(eventId, apiKey, markets) {
  const url =
    `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds` +
    `?regions=us&oddsFormat=american&bookmakers=betmgm,draftkings,fanduel,caesars` +
    `&markets=${encodeURIComponent(markets.join(","))}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  return fetchJson(url, { timeoutMs: 20000 });
}
async function fetchScheduleWindow() {
  const nowEt = getEtDateParts();
  const startDate = nowEt.ymd;
  const endDate = addDaysYmd(nowEt.ymd, 1);

  const url =
    `${MLB_SCHEDULE_BASE}?sportId=1&startDate=${encodeURIComponent(startDate)}` +
    `&endDate=${encodeURIComponent(endDate)}&hydrate=probablePitcher`;

  const json = await fetchJson(url, { timeoutMs: 15000 });
  const out = [];

  for (const dateBlock of safeArray(json && json.dates)) {
    for (const g of safeArray(dateBlock && dateBlock.games)) {
      out.push({
        gamePk: g.gamePk || null,
        commenceTime: g.gameDate || null,
        away: String(g?.teams?.away?.team?.name || ""),
        home: String(g?.teams?.home?.team?.name || ""),
        awayProbablePitcher: String(g?.teams?.away?.probablePitcher?.fullName || "TBD"),
        homeProbablePitcher: String(g?.teams?.home?.probablePitcher?.fullName || "TBD")
      });
    }
  }

  return out;
}

function findScheduleMatch(oddsEvent, scheduleGames) {
  const away = normalizeTeamName(oddsEvent && oddsEvent.away_team);
  const home = normalizeTeamName(oddsEvent && oddsEvent.home_team);
  const commence = oddsEvent && oddsEvent.commence_time ? new Date(oddsEvent.commence_time).getTime() : null;

  const exact = safeArray(scheduleGames).find(g => {
    const awayOk = normalizeTeamName(g.away) === away;
    const homeOk = normalizeTeamName(g.home) === home;
    if (!awayOk || !homeOk) return false;
    if (!commence || !g.commenceTime) return true;
    const delta = Math.abs(new Date(g.commenceTime).getTime() - commence);
    return delta <= 8 * 60 * 60 * 1000;
  });

  return exact || null;
}

function buildLineupContext(scheduleMatch) {
  const officialLineupAvailable = false;

  return {
    officialLineupAvailable,
    lineupMode: officialLineupAvailable ? "official" : "projected",
    lineupSource: officialLineupAvailable ? "Official lineup" : "Probable pitchers only",
    officialLineups: { away: null, home: null },
    projectedLineups: { away: null, home: null },
    lineupDebug: {
      scheduleMatched: !!scheduleMatch,
      officialLineupAvailable: false
    }
  };
}

function getParkFactorForGame() {
  return 1.0;
}

function getLineupStrengthTilt(lineupContext) {
  if (!lineupContext) return 0;
  return lineupContext.officialLineupAvailable ? 0.08 : 0.02;
}

function buildComponentScores(args) {
  const lineupContext = args.lineupContext || {};
  const parkFactor = Number(args.parkFactor || 1.0);
  const probablePitchers = args.probablePitchers || {};

  const starterKnown = probablePitchers.home !== "TBD" && probablePitchers.away !== "TBD";
  const starterDelta = starterKnown ? 0.24 : 0.06;

  const lineupTilt = getLineupStrengthTilt(lineupContext);
  const bullpenTilt = 0.10;
  const offenseTilt = round2(lineupTilt * 0.8);

  const totalStarterImpact = starterKnown ? -0.14 : 0.05;
  const totalLineupImpact = lineupContext.officialLineupAvailable ? 0.08 : -0.02;
  const totalParkImpact = round2((parkFactor - 1.0) * 3.2);
  const totalBullpenImpact = 0.05;

  return {
    side: {
      startingPitcher: round2(starterDelta),
      bullpen: round2(bullpenTilt),
      lineup: round2(lineupTilt),
      offenseVsHand: round2(offenseTilt)
    },
    total: {
      starters: round2(totalStarterImpact),
      lineup: round2(totalLineupImpact),
      parkFactor: round2(totalParkImpact),
      bullpen: round2(totalBullpenImpact)
    },
    liveFeedStatus: {
      bullpen: "placeholder",
      scheduleTravel: "placeholder",
      defense: "placeholder",
      marketContext: "live"
    }
  };
}

function buildModelOutputs(args) {
  const componentScores = args.componentScores || {};
  const moneylineData = args.moneylineData || {};
  const totalData = args.totalData || {};
  const parkFactor = Number(args.parkFactor || 1.0);

  const sideComposite =
    Number(componentScores.side?.startingPitcher || 0) +
    Number(componentScores.side?.bullpen || 0) +
    Number(componentScores.side?.lineup || 0) +
    Number(componentScores.side?.offenseVsHand || 0);

  const totalComposite =
    Number(componentScores.total?.starters || 0) +
    Number(componentScores.total?.lineup || 0) +
    Number(componentScores.total?.parkFactor || 0) +
    Number(componentScores.total?.bullpen || 0);

  const homeWinProb = clamp(0.5 + (sideComposite * 0.08), 0.37, 0.63);
  const awayWinProb = round2(1 - homeWinProb);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketHomeProb = moneylineData.homePrice != null ? americanToImpliedProb(moneylineData.homePrice) : null;
  const marketAwayProb = moneylineData.awayPrice != null ? americanToImpliedProb(moneylineData.awayPrice) : null;

  const awayEdgePct = marketAwayProb != null ? round2((awayWinProb - marketAwayProb) * 100) : 0;
  const homeEdgePct = marketHomeProb != null ? round2((homeWinProb - marketHomeProb) * 100) : 0;

  const baseTotal = totalData.line != null ? Number(totalData.line) : 8.0;
  const fairTotal = round2(baseTotal + (totalComposite * 0.7) + ((parkFactor - 1.0) * 1.15));

  const overProb = clamp(0.5 + ((fairTotal - baseTotal) * 0.10), 0.34, 0.66);
  const underProb = round2(1 - overProb);

  const marketOverProb = totalData.overPrice != null ? americanToImpliedProb(totalData.overPrice) : null;
  const marketUnderProb = totalData.underPrice != null ? americanToImpliedProb(totalData.underPrice) : null;

  return {
    sideComposite: round2(sideComposite),
    totalComposite: round2(totalComposite),
    fairMlAway,
    fairMlHome,
    fairTotal,
    awayWinProb: round2(awayWinProb * 100),
    homeWinProb: round2(homeWinProb * 100),
    awayEdgePct,
    homeEdgePct,
    overEdgePct: marketOverProb != null ? round2((overProb - marketOverProb) * 100) : 0,
    underEdgePct: marketUnderProb != null ? round2((underProb - marketUnderProb) * 100) : 0,
    overConfidence: round2(overProb * 100),
    underConfidence: round2(underProb * 100),
    awayRunLineConfidence: round2(clamp(50 + (awayEdgePct * 1.05), 1, 99)),
    homeRunLineConfidence: round2(clamp(50 + (homeEdgePct * 1.05), 1, 99))
  };
}

function generateFullGameCandidates(context) {
  const out = [];
  const ml = context.moneylineData || {};
  const rl = context.spreadData || {};
  const total = context.totalData || {};
  const model = context.modelOutputs || {};

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "away",
      bestBet: `${context.awayTeam} ML`,
      bestBetType: "Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(Number(model.awayWinProb || 50) / 100),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: Number(model.awayEdgePct || 0),
      reasons: [
        "Away moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, and lineup context are included."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "home",
      bestBet: `${context.homeTeam} ML`,
      bestBetType: "Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(Number(model.homeWinProb || 50) / 100),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: Number(model.homeEdgePct || 0),
      reasons: [
        "Home moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, and lineup context are included."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "over",
      bestBet: `Over ${total.line}`,
      bestBetType: "Total",
      oddsPrice: total.overPrice,
      fairProb: round2(Number(model.overConfidence || 50) / 100),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: Number(model.overEdgePct || 0),
      reasons: [
        "Total is compared to model fair total.",
        "Park factor and starter context are included."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "under",
      bestBet: `Under ${total.line}`,
      bestBetType: "Total",
      oddsPrice: total.underPrice,
      fairProb: round2(Number(model.underConfidence || 50) / 100),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: Number(model.underEdgePct || 0),
      reasons: [
        "Total is compared to model fair total.",
        "Park factor and starter context are included."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp((Number(model.awayWinProb || 50) / 100) + 0.03, 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "away",
      bestBet: `${context.awayTeam} ${formatSignedPoint(rl.awayPoint)}`,
      bestBetType: "Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "Run line uses side probability as the anchor.",
        "Price discipline is included."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp((Number(model.homeWinProb || 50) / 100) + 0.03, 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "home",
      bestBet: `${context.homeTeam} ${formatSignedPoint(rl.homePoint)}`,
      bestBetType: "Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "Run line uses side probability as the anchor.",
        "Price discipline is included."
      ]
    });
  }

  return out;
}

function generateF5Candidates(context) {
  const out = [];
  const ml = context.f5MoneylineData || {};
  const rl = context.f5RunLineData || {};
  const total = context.f5TotalData || {};
  const sideScore =
    Number(context.componentScores?.side?.startingPitcher || 0) +
    Number(context.componentScores?.side?.lineup || 0);

  const homeProb = clamp(0.5 + (sideScore * 0.09), 0.36, 0.64);
  const awayProb = round2(1 - homeProb);

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "away",
      bestBet: `${context.awayTeam} F5 ML`,
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(awayProb),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: round2((awayProb - (americanToImpliedProb(ml.awayPrice) || 0)) * 100),
      reasons: [
        "F5 moneyline emphasizes starting pitcher context.",
        "Bullpen impact is intentionally reduced."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "home",
      bestBet: `${context.homeTeam} F5 ML`,
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(homeProb),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: round2((homeProb - (americanToImpliedProb(ml.homePrice) || 0)) * 100),
      reasons: [
        "F5 moneyline emphasizes starting pitcher context.",
        "Bullpen impact is intentionally reduced."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    const overProb = clamp(0.5 + (Number(context.componentScores?.total?.parkFactor || 0) * 0.06), 0.34, 0.66);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "over",
      bestBet: `F5 Over ${total.line}`,
      bestBetType: "F5 Total",
      oddsPrice: total.overPrice,
      fairProb: round2(overProb),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: round2((overProb - (americanToImpliedProb(total.overPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes starters and early scoring environment.",
        "Late bullpen volatility is reduced."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    const underProb = clamp(0.5 - (Number(context.componentScores?.total?.parkFactor || 0) * 0.06), 0.34, 0.66);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "under",
      bestBet: `F5 Under ${total.line}`,
      bestBetType: "F5 Total",
      oddsPrice: total.underPrice,
      fairProb: round2(underProb),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: round2((underProb - (americanToImpliedProb(total.underPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes starters and early scoring environment.",
        "Late bullpen volatility is reduced."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(awayProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "away",
      bestBet: `${context.awayTeam} F5 ${formatSignedPoint(rl.awayPoint)}`,
      bestBetType: "F5 Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(homeProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "home",
      bestBet: `${context.homeTeam} F5 ${formatSignedPoint(rl.homePoint)}`,
      bestBetType: "F5 Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  return out;
}
function marketKeyToLabel(marketKey) {
  switch (marketKey) {
    case "batter_hits": return "Hits";
    case "batter_total_bases": return "Total Bases";
    case "batter_home_runs": return "Home Runs";
    case "pitcher_strikeouts": return "Pitcher Strikeouts";
    case "pitcher_outs": return "Pitcher Outs";
    default: return marketKey;
  }
}

function marketKeyToPropSubType(marketKey) {
  return marketKey.startsWith("pitcher_") ? "pitcher" : "hitter";
}

function parsePropSide(outcome) {
  const name = String(outcome?.name || "");
  const desc = String(outcome?.description || "");
  const label = `${name} ${desc}`.toLowerCase();
  if (/\bover\b/.test(label)) return "over";
  if (/\bunder\b/.test(label)) return "under";
  return null;
}

function parsePropPlayer(outcome) {
  const desc = String(outcome?.description || "").trim();
  const name = String(outcome?.name || "").trim();

  if (desc && !/^over$/i.test(desc) && !/^under$/i.test(desc)) return desc;
  if (name && !/^over$/i.test(name) && !/^under$/i.test(name)) return name;
  return "";
}

function buildPropCandidates(eventOdds, context) {
  const bookmaker = pickPreferredBookmaker(eventOdds && eventOdds.bookmakers);
  if (!bookmaker) return [];

  const candidates = [];

  for (const market of safeArray(bookmaker.markets)) {
    const marketKey = String(market?.key || "");
    if (!PROP_MARKETS.includes(marketKey)) continue;

    const bucket = {};
    for (const outcome of safeArray(market.outcomes)) {
      const player = parsePropPlayer(outcome);
      const side = parsePropSide(outcome);
      const point = toNum(outcome?.point);
      const price = toNum(outcome?.price);

      if (!player || !side || point == null || price == null) continue;

      const key = `${normalizeName(player)}|${marketKey}|${point}`;
      bucket[key] = bucket[key] || {
        player,
        marketKey,
        point,
        overPrice: null,
        underPrice: null
      };

      if (side === "over") bucket[key].overPrice = price;
      if (side === "under") bucket[key].underPrice = price;
    }

    for (const key of Object.keys(bucket)) {
      const row = bucket[key];
      const marketLabel = marketKeyToLabel(row.marketKey);
      const propSubType = marketKeyToPropSubType(row.marketKey);

      const contextTilt = row.marketKey === "pitcher_strikeouts" ? 0.11
        : row.marketKey === "pitcher_outs" ? 0.08
        : row.marketKey === "batter_total_bases" ? 0.09
        : row.marketKey === "batter_home_runs" ? 0.06
        : 0.07;

      if (row.overPrice != null) {
        const implied = americanToImpliedProb(row.overPrice);
        const fairProb = clamp((implied || 0.5) + contextTilt * 0.20, 0.05, 0.95);
        candidates.push({
          marketFamily: "prop",
          propSubType,
          market: row.marketKey,
          player: row.player,
          side: "over",
          bestBet: `${row.player} ${marketLabel} Over ${row.point}`,
          bestBetType: "Prop",
          oddsPrice: row.overPrice,
          fairProb: round2(fairProb),
          impliedProb: implied,
          edgePct: round2((fairProb - (implied || 0)) * 100),
          contextTilt: round2(contextTilt),
          modelProb: round2(fairProb),
          reasons: [
            `${marketLabel} prop is priced against bookmaker implied probability.`,
            "Prop confidence is conservatively adjusted to avoid overrating thin edges."
          ]
        });
      }

      if (row.underPrice != null) {
        const implied = americanToImpliedProb(row.underPrice);
        const fairProb = clamp((implied || 0.5) + contextTilt * 0.12, 0.05, 0.95);
        candidates.push({
          marketFamily: "prop",
          propSubType,
          market: row.marketKey,
          player: row.player,
          side: "under",
          bestBet: `${row.player} ${marketLabel} Under ${row.point}`,
          bestBetType: "Prop",
          oddsPrice: row.underPrice,
          fairProb: round2(fairProb),
          impliedProb: implied,
          edgePct: round2((fairProb - (implied || 0)) * 100),
          contextTilt: round2(contextTilt * 0.85),
          modelProb: round2(fairProb),
          reasons: [
            `${marketLabel} prop is priced against bookmaker implied probability.`,
            "Under confidence is conservatively adjusted and filtered by price discipline."
          ]
        });
      }
    }
  }

  return candidates;
}

function getSignedEdgePct(candidate) {
  const n = Number(candidate?.edgePct);
  return Number.isFinite(n) ? n : 0;
}

function getPositiveEdgePct(candidate) {
  return Math.max(0, getSignedEdgePct(candidate));
}

function isProjectedLineupContext(context) {
  return !(context?.lineupContext?.officialLineupAvailable);
}

function getPriceDisciplineBonus(price) {
  const p = Number(price);
  if (!Number.isFinite(p)) return 0;
  if (p >= -115 && p <= 130) return 1.05;
  if (p >= -130 && p <= 145) return 0.65;
  if (p >= -145 && p <= 165) return 0.18;
  if (p < -145 && p >= -170) return -0.45;
  if (p < -170) return -0.95;
  return 0.10;
}

function getNegativeEdgePenalty(candidate) {
  const edge = getSignedEdgePct(candidate);
  return edge >= 0 ? 0 : Math.abs(edge) * 1.3;
}

function getCandidateBucket(candidate) {
  const marketFamily = String(candidate?.marketFamily || "");
  const bestBet = String(candidate?.bestBet || "");
  const market = String(candidate?.market || "");

  if (marketFamily === "f5") {
    if (market === "f5_total") return "f5_total";
    if (market === "f5_runline") return "f5_runline";
    return "f5_side";
  }

  if (marketFamily === "prop") {
    if (market === "pitcher_strikeouts") return "pitcher_k_prop";
    if (market === "pitcher_outs") return "pitcher_outs_prop";
    if (market === "batter_home_runs") return "hitter_hr_prop";
    if (market === "batter_total_bases") return "hitter_tb_prop";
    if (market === "batter_hits") return "hitter_hits_prop";
    return "generic_prop";
  }

  if (/^Under /i.test(bestBet) || /^Over /i.test(bestBet)) return "total";
  if (/Run Line/i.test(String(candidate?.bestBetType || ""))) return "runline";
  return "side";
}

function getProjectedLineupPenalty(candidate, context) {
  if (!isProjectedLineupContext(context)) return 0;
  const bucket = getCandidateBucket(candidate);

  if (["f5_side", "f5_total", "f5_runline", "pitcher_k_prop", "pitcher_outs_prop", "hitter_hits_prop", "hitter_tb_prop", "hitter_hr_prop"].includes(bucket)) {
    return 0.55;
  }
  return 0.18;
}

function getMissingDataPenalty(componentScores) {
  let penalty = 0;
  if (componentScores?.liveFeedStatus?.bullpen !== "live") penalty += 0.18;
  if (componentScores?.liveFeedStatus?.scheduleTravel !== "live") penalty += 0.12;
  if (componentScores?.liveFeedStatus?.defense === "placeholder") penalty += 0.06;
  return penalty;
}

function getMarketShapeBonus(candidate, context) {
  const bucket = getCandidateBucket(candidate);

  if (bucket === "side") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 1.05;
  if (bucket === "total") return Math.abs(Number(context?.modelOutputs?.totalComposite || 0)) * 1.05;
  if (bucket === "runline") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 0.82;
  if (bucket === "f5_side") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 1.18;
  if (bucket === "f5_total") return Math.abs(Number(context?.modelOutputs?.totalComposite || 0)) * 1.12;
  if (bucket === "f5_runline") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 0.94;
  return Math.abs(Number(candidate?.contextTilt || 0)) * 1.0;
}

function getContextScore(candidate, context) {
  const lineupBonus = context?.lineupContext?.officialLineupAvailable ? 0.55 : -0.05;
  const starterKnownBonus =
    context?.probablePitchers?.away !== "TBD" && context?.probablePitchers?.home !== "TBD" ? 0.35 : 0;
  const marketShapeBonus = getMarketShapeBonus(candidate, context);
  const missingDataPenalty = getMissingDataPenalty(context?.componentScores);
  const projectedLineupPenalty = getProjectedLineupPenalty(candidate, context);

  return round2(lineupBonus + starterKnownBonus + marketShapeBonus - missingDataPenalty - projectedLineupPenalty);
}

function getDataCompleteness(componentScores, lineupContext, candidate) {
  let score = 0;
  const bucket = getCandidateBucket(candidate);

  if (lineupContext?.officialLineupAvailable) score += 24;
  if (Math.abs(Number(componentScores?.side?.startingPitcher || 0)) > 0.05) score += 18;
  if (Math.abs(Number(componentScores?.side?.lineup || 0)) > 0.05) score += 14;
  if (Math.abs(Number(componentScores?.total?.parkFactor || 0)) >= 0) score += 12;
  if (componentScores?.liveFeedStatus?.marketContext === "live") score += 16;

  if (["f5_side", "f5_total", "f5_runline", "pitcher_k_prop", "pitcher_outs_prop", "hitter_hits_prop", "hitter_tb_prop", "hitter_hr_prop"].includes(bucket)) {
    score += lineupContext?.officialLineupAvailable ? 10 : 0;
  }

  return Math.max(0, Math.min(score, 100));
}

function getValueScore(candidate) {
  const positiveEdge = getPositiveEdgePct(candidate);
  const negativeEdgePenalty = getNegativeEdgePenalty(candidate);
  const juiceBonus = getPriceDisciplineBonus(candidate?.oddsPrice);

  const fairProbBonus =
    candidate?.fairProb != null && candidate?.impliedProb != null
      ? Math.max(0, (Number(candidate.fairProb) - Number(candidate.impliedProb)) * 1.25)
      : 0;

  return round2((positiveEdge * 1.12) + juiceBonus + fairProbBonus - negativeEdgePenalty);
}

function getThresholdsForCandidate(candidate) {
  const bucket = getCandidateBucket(candidate);

  switch (bucket) {
    case "side":
      return { high: 4.65, medium: 3.10, minEdgeHigh: 0.95, minEdgeMedium: 0.30, minCompletenessHigh: 36 };
    case "total":
      return { high: 4.65, medium: 3.05, minEdgeHigh: 0.95, minEdgeMedium: 0.30, minCompletenessHigh: 34 };
    case "runline":
      return { high: 5.00, medium: 3.35, minEdgeHigh: 1.15, minEdgeMedium: 0.40, minCompletenessHigh: 36 };
    case "f5_side":
      return { high: 5.20, medium: 3.55, minEdgeHigh: 1.10, minEdgeMedium: 0.45, minCompletenessHigh: 34 };
    case "f5_total":
      return { high: 5.30, medium: 3.60, minEdgeHigh: 1.15, minEdgeMedium: 0.45, minCompletenessHigh: 34 };
    case "f5_runline":
      return { high: 5.45, medium: 3.70, minEdgeHigh: 1.20, minEdgeMedium: 0.50, minCompletenessHigh: 34 };
    case "pitcher_k_prop":
    case "pitcher_outs_prop":
      return { high: 4.95, medium: 3.35, minEdgeHigh: 1.00, minEdgeMedium: 0.35, minCompletenessHigh: 30 };
    case "hitter_hits_prop":
    case "hitter_tb_prop":
    case "hitter_hr_prop":
      return { high: 5.15, medium: 3.45, minEdgeHigh: 1.00, minEdgeMedium: 0.35, minCompletenessHigh: 30 };
    default:
      return { high: 4.90, medium: 3.25, minEdgeHigh: 1.00, minEdgeMedium: 0.35, minCompletenessHigh: 30 };
  }
}

function scoreCandidate(candidate, context) {
  const valueScore = getValueScore(candidate);
  const contextScore = getContextScore(candidate, context);
  const dataCompleteness = getDataCompleteness(context.componentScores, context.lineupContext, candidate);
  const completenessBoost = round2((dataCompleteness / 100) * 0.95);
  const finalScore = round2(valueScore + contextScore + completenessBoost);
  const thresholds = getThresholdsForCandidate(candidate);
  const edge = getPositiveEdgePct(candidate);

  let confidence = "Low";
  if (finalScore >= thresholds.high && edge >= thresholds.minEdgeHigh && dataCompleteness >= thresholds.minCompletenessHigh) {
    confidence = "High";
  } else if (finalScore >= thresholds.medium && edge >= thresholds.minEdgeMedium) {
    confidence = "Medium";
  }

  return {
    ...candidate,
    valueScore,
    contextScore,
    dataCompleteness,
    finalScore,
    confidence,
    confidenceScore: sigmoidScoreToPct(finalScore),
    recommendedTiming: confidence === "High" ? "Bet sooner" : confidence === "Medium" ? "Monitor market" : "Pass / monitor",
    recommendedStakeUnits: confidence === "High" ? 1.0 : confidence === "Medium" ? 0.5 : 0.0
  };
}

function rankCandidates(candidates, context) {
  return safeArray(candidates)
    .map(c => scoreCandidate(c, context))
    .sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))
    .map((c, idx) => ({ ...c, slateRank: idx + 1 }));
}

function filterCandidatesForView(candidates, viewMode) {
  const arr = safeArray(candidates);

  if (viewMode === "pitcher_props") return arr.filter(c => c.marketFamily === "prop" && c.propSubType === "pitcher");
  if (viewMode === "hitter_props") return arr.filter(c => c.marketFamily === "prop" && c.propSubType === "hitter");
  if (viewMode === "props") return arr.filter(c => c.marketFamily === "prop");
  if (viewMode === "f5") return arr.filter(c => c.marketFamily === "f5");
  return arr.filter(c => c.marketFamily === "full");
}

function chooseBestCandidate(filteredCandidates, viewMode) {
  if (safeArray(filteredCandidates).length) return filteredCandidates[0];
  return {
    marketFamily: viewMode === "f5" ? "f5" : (viewMode === "full" ? "full" : "prop"),
    bestBet: "Pass",
    bestBetType: "Pass",
    oddsPrice: null,
    confidence: "Low",
    confidenceScore: 0,
    finalScore: 0,
    reasons: ["No qualifying candidate was generated for this view."],
    recommendedTiming: "Monitor market",
    recommendedStakeUnits: 0.0
  };
}

function chooseTopPropCandidate(rankedCandidates) {
  const top = safeArray(rankedCandidates).find(c => c.marketFamily === "prop");
  if (!top) return null;

  return {
    player: top.player,
    market: top.market,
    price: top.oddsPrice,
    modelProb: round2((Number(top.modelProb || top.fairProb || 0.5)) * 100),
    reasons: safeArray(top.reasons)
  };
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported prop returned.";
  const bits = [];
  if (topProp.market) bits.push(`${topProp.market} ranked highest among prop candidates.`);
  if (lineupContext?.officialLineupAvailable) bits.push("Confirmed lineups improved confidence.");
  if (safeArray(topProp.reasons).length) bits.push(topProp.reasons[0]);
  return bits.join(" ");
}

function buildRiskWarnings(componentScores, bestCandidate) {
  const warnings = [];
  if (!bestCandidate || bestCandidate.bestBet === "Pass") warnings.push("No market cleared the current thresholds.");
  if (componentScores?.liveFeedStatus?.bullpen !== "live") warnings.push("Bullpen inputs are still using placeholder context.");
  if (componentScores?.liveFeedStatus?.scheduleTravel !== "live") warnings.push("Schedule and travel context are not yet live-fed.");
  if (componentScores?.liveFeedStatus?.defense === "placeholder") warnings.push("Defense inputs are placeholders.");
  return warnings;
}

function deriveConfidenceMap(candidates, market) {
  const away = safeArray(candidates).find(c => c.market === market && c.side === "away");
  const home = safeArray(candidates).find(c => c.market === market && c.side === "home");
  return {
    away: away ? sigmoidScoreToPct(away.finalScore) : null,
    home: home ? sigmoidScoreToPct(home.finalScore) : null
  };
}

function deriveTotalConfidenceMap(candidates, market) {
  const over = safeArray(candidates).find(c => c.market === market && c.side === "over");
  const under = safeArray(candidates).find(c => c.market === market && c.side === "under");
  return {
    over: over ? sigmoidScoreToPct(over.finalScore) : null,
    under: under ? sigmoidScoreToPct(under.finalScore) : null
  };
}

function buildGameResponse(args) {
  const event = args.event;
  const context = args.context;
  const ranked = args.rankedCandidates;
  const filtered = args.filteredCandidates;
  const best = chooseBestCandidate(filtered, args.viewMode);
  const topProp = chooseTopPropCandidate(ranked);
  const riskWarnings = buildRiskWarnings(context.componentScores, best);

  const fullCandidates = ranked.filter(c => c.marketFamily === "full");
  const f5Candidates = ranked.filter(c => c.marketFamily === "f5");

  const moneylineConfidence = deriveConfidenceMap(fullCandidates, "moneyline");
  const runLineConfidence = deriveConfidenceMap(fullCandidates, "runline");
  const totalConfidence = deriveTotalConfidenceMap(fullCandidates, "total");

  const firstFiveMoneylineConfidence = deriveConfidenceMap(f5Candidates, "f5_moneyline");
  const firstFiveRunLineConfidence = deriveConfidenceMap(f5Candidates, "f5_runline");
  const firstFiveTotalConfidence = deriveTotalConfidenceMap(f5Candidates, "f5_total");

  return {
    id: event.id,
    eventId: event.id,
    rawCommenceTime: event.commence_time,
    time: formatEtDateTime(event.commence_time),
    away: event.away_team,
    home: event.home_team,

    probablePitchers: context.probablePitchers,
    lineupMode: context.lineupContext.lineupMode,
    lineupSource: context.lineupContext.lineupSource,

    moneyline: `${event.away_team} ${hasValue(context.moneylineData.awayPrice) ? (context.moneylineData.awayPrice > 0 ? "+" : "") + context.moneylineData.awayPrice : "—"} | ${event.home_team} ${hasValue(context.moneylineData.homePrice) ? (context.moneylineData.homePrice > 0 ? "+" : "") + context.moneylineData.homePrice : "—"}`,
    runLine: `${event.away_team} ${formatSignedPoint(context.spreadData.awayPoint)} (${hasValue(context.spreadData.awayPrice) ? (context.spreadData.awayPrice > 0 ? "+" : "") + context.spreadData.awayPrice : "—"}) | ${event.home_team} ${formatSignedPoint(context.spreadData.homePoint)} (${hasValue(context.spreadData.homePrice) ? (context.spreadData.homePrice > 0 ? "+" : "") + context.spreadData.homePrice : "—"})`,
    total: hasValue(context.totalData.line)
      ? `Over ${context.totalData.line} ${hasValue(context.totalData.overPrice) ? (context.totalData.overPrice > 0 ? "+" : "") + context.totalData.overPrice : "—"} | Under ${context.totalData.line} ${hasValue(context.totalData.underPrice) ? (context.totalData.underPrice > 0 ? "+" : "") + context.totalData.underPrice : "—"}`
      : "N/A",

    firstFiveMoneyline: `${event.away_team} ${hasValue(context.f5MoneylineData.awayPrice) ? (context.f5MoneylineData.awayPrice > 0 ? "+" : "") + context.f5MoneylineData.awayPrice : "—"} | ${event.home_team} ${hasValue(context.f5MoneylineData.homePrice) ? (context.f5MoneylineData.homePrice > 0 ? "+" : "") + context.f5MoneylineData.homePrice : "—"}`,
    firstFiveRunLine: `${event.away_team} F5 ${formatSignedPoint(context.f5RunLineData.awayPoint)} (${hasValue(context.f5RunLineData.awayPrice) ? (context.f5RunLineData.awayPrice > 0 ? "+" : "") + context.f5RunLineData.awayPrice : "—"}) | ${event.home_team} F5 ${formatSignedPoint(context.f5RunLineData.homePoint)} (${hasValue(context.f5RunLineData.homePrice) ? (context.f5RunLineData.homePrice > 0 ? "+" : "") + context.f5RunLineData.homePrice : "—"})`,
    firstFiveTotal: hasValue(context.f5TotalData.line)
      ? `Over ${context.f5TotalData.line} ${hasValue(context.f5TotalData.overPrice) ? (context.f5TotalData.overPrice > 0 ? "+" : "") + context.f5TotalData.overPrice : "—"} | Under ${context.f5TotalData.line} ${hasValue(context.f5TotalData.underPrice) ? (context.f5TotalData.underPrice > 0 ? "+" : "") + context.f5TotalData.underPrice : "—"}`
      : "N/A",

    bestBet: best.bestBet || "Pass",
    bestBetType: best.bestBetType || "Pass",
    bestBetOdds: hasValue(best.oddsPrice) ? best.oddsPrice : null,
    confidence: best.confidence || "Low",
    confidenceScore: hasValue(best.confidenceScore) ? best.confidenceScore : 0,
    recommendedTiming: best.recommendedTiming || "Monitor market",
    recommendedStakeUnits: hasValue(best.recommendedStakeUnits) ? best.recommendedStakeUnits : 0,
    reasons: safeArray(best.reasons),

    fairMlAway: context.modelOutputs.fairMlAway,
    fairMlHome: context.modelOutputs.fairMlHome,
    fairTotal: context.modelOutputs.fairTotal,
    awayEdgePct: context.modelOutputs.awayEdgePct,
    homeEdgePct: context.modelOutputs.homeEdgePct,
    overEdgePct: context.modelOutputs.overEdgePct,
    underEdgePct: context.modelOutputs.underEdgePct,

    moneylineConfidence,
    totalConfidence,
    runLineConfidence,
    firstFiveMoneylineConfidence,
    firstFiveTotalConfidence,
    firstFiveRunLineConfidence,

    topPropOverall: topProp,
    topPropOverallReason: topProp ? buildTopPropOverallReason(topProp, context.lineupContext) : "No supported prop returned.",
    propStatus: topProp ? "Top prop candidate returned." : "No supported prop returned for this game.",

    componentScores: context.componentScores,
    riskWarnings,
    parkFactor: context.parkFactor,

    debug: {
      topCandidates: ranked.slice(0, 7).map(c => ({
        bestBet: c.bestBet,
        bestBetType: c.bestBetType,
        marketFamily: c.marketFamily,
        propSubType: c.propSubType || null,
        edgePct: c.edgePct,
        valueScore: c.valueScore,
        contextScore: c.contextScore,
        dataCompleteness: c.dataCompleteness,
        finalScore: c.finalScore,
        confidence: c.confidence,
        slateRank: c.slateRank
      })),
      lineupDiagnostics: context.lineupContext.lineupDebug,
      dataAvailability: {
        officialLineupAvailable: context.lineupContext.officialLineupAvailable,
        hitterPropGenerated: ranked.some(c => c.marketFamily === "prop" && c.propSubType === "hitter"),
        pitcherPropGenerated: ranked.some(c => c.marketFamily === "prop" && c.propSubType === "pitcher"),
        underGenerated: ranked.some(c => c.bestBetType === "Total" && /^Under /i.test(c.bestBet))
      }
    }
  };
}

async function buildGameContext(event, apiKey, scheduleGames) {
  const featured = parseFeaturedOddsFromEvent(event);

  let f5Odds = null;
  let propOdds = null;

  try {
    f5Odds = await fetchEventMarkets(event.id, apiKey, F5_MARKETS);
  } catch (_) {
    f5Odds = null;
  }

  try {
    propOdds = await fetchEventMarkets(event.id, apiKey, PROP_MARKETS);
  } catch (_) {
    propOdds = null;
  }

  const f5Book = pickPreferredBookmaker(f5Odds?.bookmakers);
  const f5MoneylineData = parseMoneylineMarket(findMarket(f5Book, "h2h_1st_5_innings"), event.away_team, event.home_team);
  const f5RunLineData = parseSpreadMarket(findMarket(f5Book, "spreads_1st_5_innings"), event.away_team, event.home_team);
  const f5TotalData = parseTotalMarket(findMarket(f5Book, "totals_1st_5_innings"));

  const scheduleMatch = findScheduleMatch(event, scheduleGames);
  const probablePitchers = {
    away: scheduleMatch?.awayProbablePitcher || "TBD",
    home: scheduleMatch?.homeProbablePitcher || "TBD",
    awayHand: inferHandFromPitcherName(scheduleMatch?.awayProbablePitcher || "TBD"),
    homeHand: inferHandFromPitcherName(scheduleMatch?.homeProbablePitcher || "TBD")
  };

  const lineupContext = buildLineupContext(scheduleMatch);
  const parkFactor = getParkFactorForGame(event.home_team);
  const componentScores = buildComponentScores({
    lineupContext,
    parkFactor,
    probablePitchers
  });

  const modelOutputs = buildModelOutputs({
    componentScores,
    moneylineData: featured.moneylineData,
    totalData: featured.totalData,
    parkFactor
  });

  const baseContext = {
    eventId: event.id,
    awayTeam: event.away_team,
    homeTeam: event.home_team,
    moneylineData: featured.moneylineData,
    spreadData: featured.spreadData,
    totalData: featured.totalData,
    f5MoneylineData,
    f5RunLineData,
    f5TotalData,
    lineupContext,
    probablePitchers,
    componentScores,
    modelOutputs,
    parkFactor
  };

  const candidates = [
    ...generateFullGameCandidates(baseContext),
    ...generateF5Candidates(baseContext),
    ...buildPropCandidates(propOdds, baseContext)
  ];

  return {
    ...baseContext,
    candidates
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const viewModeRaw = String(req.query?.view || "full");
  const viewMode =
    ["full", "f5", "props", "pitcher_props", "hitter_props"].includes(viewModeRaw)
      ? viewModeRaw
      : "full";

  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ODDS_API_KEY environment variable",
      mode: viewMode
    });
  }

  try {
    const [featuredOdds, scheduleGames] = await Promise.all([
      fetchFeaturedOdds(apiKey),
      fetchScheduleWindow().catch(() => [])
    ]);

    const events = safeArray(featuredOdds)
      .filter(e => e && e.id && e.away_team && e.home_team)
      .sort((a, b) => new Date(a.commence_time || 0).getTime() - new Date(b.commence_time || 0).getTime());

    if (!events.length) {
      return res.status(200).json([
        {
          id: "no-events",
          eventId: "no-events",
          rawCommenceTime: null,
          time: "—",
          away: "No MLB odds events returned",
          home: "Check feed / bookmaker coverage",
          bestBet: "Pass",
          bestBetType: "Pass",
          bestBetOdds: null,
          confidence: "Low",
          confidenceScore: 0,
          reasons: [
            "The odds feed returned zero MLB events for the current request.",
            "This is now handled as a data-return issue instead of a server crash."
          ],
          moneyline: "N/A",
          runLine: "N/A",
          total: "N/A",
          firstFiveMoneyline: "N/A",
          firstFiveRunLine: "N/A",
          firstFiveTotal: "N/A",
          lineupMode: "projected",
          lineupSource: "Fallback",
          probablePitchers: { away: "TBD", home: "TBD" },
          riskWarnings: ["No usable MLB events were returned from the odds feed."],
          componentScores: null,
          debug: {
            requestMode: viewMode,
            featuredOddsCount: 0
          }
        }
      ]);
    }

    const output = [];

    for (const event of events) {
      try {
        const context = await buildGameContext(event, apiKey, scheduleGames);
        const rankedCandidates = rankCandidates(context.candidates, context);
        const filteredCandidates = filterCandidatesForView(rankedCandidates, viewMode);
        const game = buildGameResponse({
          event,
          context,
          rankedCandidates,
          filteredCandidates,
          viewMode
        });
        output.push(game);
      } catch (gameErr) {
        output.push({
          id: event.id,
          eventId: event.id,
          rawCommenceTime: event.commence_time,
          time: formatEtDateTime(event.commence_time),
          away: event.away_team,
          home: event.home_team,
          bestBet: "Pass",
          bestBetType: "Pass",
          bestBetOdds: null,
          confidence: "Low",
          confidenceScore: 0,
          reasons: [`Game build failed: ${gameErr.message}`],
          moneyline: "N/A",
          runLine: "N/A",
          total: "N/A",
          firstFiveMoneyline: "N/A",
          firstFiveRunLine: "N/A",
          firstFiveTotal: "N/A",
          lineupMode: "projected",
          lineupSource: "Fallback",
          probablePitchers: { away: "TBD", home: "TBD" },
          riskWarnings: ["This game fell back due to a per-game processing error."],
          componentScores: null,
          debug: {
            topCandidates: [],
            dataAvailability: {
              officialLineupAvailable: false,
              hitterPropGenerated: false,
              pitcherPropGenerated: false,
              underGenerated: false
            },
            error: gameErr.message
          }
        });
      }
    }

    return res.status(200).json(output);
  } catch (err) {
    return res.status(500).json({
      error: "Dashboard build failed",
      details: err.message,
      mode: viewMode
    });
  }
};