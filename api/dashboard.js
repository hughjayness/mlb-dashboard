// api/dashboard.js
// Full-file replacement for Vercel serverless route.
// Requires environment variable: ODDS_API_KEY

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const MLB_SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1/schedule";

const FEATURED_MARKETS = ["h2h", "spreads", "totals"];
const F5_MARKETS = ["h2h_1st_5_innings", "spreads_1st_5_innings", "totals_1st_5_innings"];

const HITTER_PROP_MARKETS = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_rbis",
  "batter_runs_scored",
  "batter_hits_runs_rbis",
  "batter_stolen_bases",
  "batter_walks",
  "batter_singles",
  "batter_doubles",
  "batter_triples"
];

const PITCHER_PROP_MARKETS = ["pitcher_strikeouts", "pitcher_outs"];
const PROP_MARKETS = [...HITTER_PROP_MARKETS, ...PITCHER_PROP_MARKETS];

const BOOKMAKER_PREFERENCE = [
  "betmgm",
  "draftkings",
  "fanduel",
  "caesars",
  "betrivers",
  "fanatics",
  "espnbet",
  "ballybet"
];

const TEAM_CONTEXT = {
  "arizona diamondbacks": { id: 109, offense: 0.12, prevention: -0.03, bullpen: -0.03, park: 1.04 },
  "athletics": { id: 133, offense: -0.10, prevention: -0.16, bullpen: -0.12, park: 0.98 },
  "atlanta braves": { id: 144, offense: 0.14, prevention: 0.07, bullpen: 0.06, park: 1.03 },
  "baltimore orioles": { id: 110, offense: 0.10, prevention: 0.04, bullpen: 0.03, park: 0.96 },
  "boston red sox": { id: 111, offense: 0.07, prevention: -0.04, bullpen: -0.02, park: 1.06 },
  "chicago cubs": { id: 112, offense: 0.04, prevention: 0.02, bullpen: 0.01, park: 1.01 },
  "chicago white sox": { id: 145, offense: -0.18, prevention: -0.18, bullpen: -0.14, park: 0.99 },
  "cincinnati reds": { id: 113, offense: 0.04, prevention: -0.07, bullpen: -0.04, park: 1.12 },
  "cleveland guardians": { id: 114, offense: 0.02, prevention: 0.07, bullpen: 0.09, park: 0.97 },
  "colorado rockies": { id: 115, offense: -0.08, prevention: -0.20, bullpen: -0.18, park: 1.22 },
  "detroit tigers": { id: 116, offense: 0.01, prevention: 0.06, bullpen: 0.04, park: 0.98 },
  "houston astros": { id: 117, offense: 0.08, prevention: 0.05, bullpen: 0.05, park: 0.99 },
  "kansas city royals": { id: 118, offense: 0.03, prevention: 0.06, bullpen: 0.03, park: 1.01 },
  "los angeles angels": { id: 108, offense: -0.02, prevention: -0.10, bullpen: -0.08, park: 1.00 },
  "los angeles dodgers": { id: 119, offense: 0.19, prevention: 0.10, bullpen: 0.09, park: 1.02 },
  "miami marlins": { id: 146, offense: -0.12, prevention: -0.06, bullpen: -0.05, park: 0.96 },
  "milwaukee brewers": { id: 158, offense: 0.03, prevention: 0.08, bullpen: 0.08, park: 1.00 },
  "minnesota twins": { id: 142, offense: 0.02, prevention: 0.04, bullpen: 0.04, park: 0.98 },
  "new york mets": { id: 121, offense: 0.06, prevention: 0.04, bullpen: 0.04, park: 0.99 },
  "new york yankees": { id: 147, offense: 0.12, prevention: 0.05, bullpen: 0.05, park: 1.04 },
  "philadelphia phillies": { id: 143, offense: 0.11, prevention: 0.07, bullpen: 0.06, park: 1.03 },
  "pittsburgh pirates": { id: 134, offense: -0.07, prevention: 0.00, bullpen: -0.02, park: 0.98 },
  "san diego padres": { id: 135, offense: 0.06, prevention: 0.07, bullpen: 0.06, park: 0.96 },
  "san francisco giants": { id: 137, offense: -0.01, prevention: 0.04, bullpen: 0.03, park: 0.94 },
  "seattle mariners": { id: 136, offense: 0.02, prevention: 0.09, bullpen: 0.08, park: 0.95 },
  "st louis cardinals": { id: 138, offense: 0.00, prevention: -0.02, bullpen: -0.02, park: 0.99 },
  "tampa bay rays": { id: 139, offense: 0.03, prevention: 0.05, bullpen: 0.06, park: 0.97 },
  "texas rangers": { id: 140, offense: 0.08, prevention: -0.01, bullpen: -0.02, park: 1.05 },
  "toronto blue jays": { id: 141, offense: 0.05, prevention: 0.02, bullpen: 0.02, park: 1.01 },
  "washington nationals": { id: 120, offense: -0.04, prevention: -0.08, bullpen: -0.07, park: 1.00 }
};

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

function toPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return null;
  if (Math.abs(n) < 80) return null;
  return n;
}

function toTotalLine(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function toPoint(v) {
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
  const aliases = {
    "ari diamondbacks": "arizona diamondbacks",
    "d backs": "arizona diamondbacks",
    "diamondbacks": "arizona diamondbacks",
    "athletics": "athletics",
    "oakland athletics": "athletics",
    "sacramento athletics": "athletics",
    "atl braves": "atlanta braves",
    "bal orioles": "baltimore orioles",
    "bos red sox": "boston red sox",
    "chi cubs": "chicago cubs",
    "chc": "chicago cubs",
    "chi white sox": "chicago white sox",
    "cws": "chicago white sox",
    "white sox": "chicago white sox",
    "cle guardians": "cleveland guardians",
    "guardians": "cleveland guardians",
    "col rockies": "colorado rockies",
    "det tigers": "detroit tigers",
    "hou astros": "houston astros",
    "kc royals": "kansas city royals",
    "kansas city": "kansas city royals",
    "la angels": "los angeles angels",
    "los angeles angels of anaheim": "los angeles angels",
    "la dodgers": "los angeles dodgers",
    "lad": "los angeles dodgers",
    "mia marlins": "miami marlins",
    "mil brewers": "milwaukee brewers",
    "min twins": "minnesota twins",
    "ny mets": "new york mets",
    "nym": "new york mets",
    "ny yankees": "new york yankees",
    "nyy": "new york yankees",
    "philadelphia": "philadelphia phillies",
    "phi phillies": "philadelphia phillies",
    "pit pirates": "pittsburgh pirates",
    "sd padres": "san diego padres",
    "sf giants": "san francisco giants",
    "sea mariners": "seattle mariners",
    "stl cardinals": "st louis cardinals",
    "tb rays": "tampa bay rays",
    "tex rangers": "texas rangers",
    "tor blue jays": "toronto blue jays",
    "wsh nationals": "washington nationals"
  };

  const n = normalizeName(name);
  return aliases[n] || n;
}

function eventKeyFromTeams(away, home) {
  return `${normalizeTeamName(away)}|${normalizeTeamName(home)}`;
}

function getTeamContext(teamName) {
  return TEAM_CONTEXT[normalizeTeamName(teamName)] || {
    id: null,
    offense: 0,
    prevention: 0,
    bullpen: 0,
    park: 1.0
  };
}

function formatSignedPoint(point) {
  const n = Number(point);
  if (!Number.isFinite(n)) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatPrice(price) {
  const p = toPrice(price);
  if (p === null) return "—";
  return p > 0 ? `+${p}` : `${p}`;
}

function americanToImpliedProb(price) {
  const p = toPrice(price);
  if (p === null) return null;
  if (p > 0) return 100 / (p + 100);
  return Math.abs(p) / (Math.abs(p) + 100);
}

function probToAmerican(prob) {
  const p = Number(prob);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function betterPrice(current, next) {
  const a = toPrice(current);
  const b = toPrice(next);
  if (a === null) return b;
  if (b === null) return a;
  return b > a ? b : a;
}

function sigmoidScoreToPct(score) {
  const x = Number(score || 0);
  const pct = 100 / (1 + Math.exp(-0.95 * (x - 1.7)));
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

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 18000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);

    try {
      return JSON.parse(text);
    } catch (_) {
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

function findOutcomeByTeam(outcomes, teamName) {
  const target = normalizeTeamName(teamName);
  return safeArray(outcomes).find(o => normalizeTeamName(o && o.name) === target) || null;
}

function findOutcomeByName(outcomes, name) {
  const target = normalizeName(name);
  return safeArray(outcomes).find(o => normalizeName(o && o.name) === target) || null;
}

function parseMoneylineMarket(market, awayTeam, homeTeam) {
  const away = findOutcomeByTeam(market && market.outcomes, awayTeam);
  const home = findOutcomeByTeam(market && market.outcomes, homeTeam);

  return {
    awayPrice: toPrice(away && away.price),
    homePrice: toPrice(home && home.price)
  };
}

function parseSpreadMarket(market, awayTeam, homeTeam) {
  const away = findOutcomeByTeam(market && market.outcomes, awayTeam);
  const home = findOutcomeByTeam(market && market.outcomes, homeTeam);

  return {
    awayPoint: toPoint(away && away.point),
    awayPrice: toPrice(away && away.price),
    homePoint: toPoint(home && home.point),
    homePrice: toPrice(home && home.price)
  };
}

function parseTotalMarket(market) {
  const over = findOutcomeByName(market && market.outcomes, "Over");
  const under = findOutcomeByName(market && market.outcomes, "Under");

  return {
    line: toTotalLine(over && over.point) ?? toTotalLine(under && under.point),
    overPrice: toPrice(over && over.price),
    underPrice: toPrice(under && under.price)
  };
}

function findMarket(bookmaker, key) {
  return safeArray(bookmaker && bookmaker.markets).find(m => m && m.key === key) || null;
}

function parseFeaturedOddsFromEvent(event) {
  const bookmaker = pickPreferredBookmaker(event && event.bookmakers);
  const awayTeam = String(event && event.away_team || "");
  const homeTeam = String(event && event.home_team || "");

  return {
    bookmakerKey: bookmaker && bookmaker.key || null,
    moneylineData: parseMoneylineMarket(findMarket(bookmaker, "h2h"), awayTeam, homeTeam),
    spreadData: parseSpreadMarket(findMarket(bookmaker, "spreads"), awayTeam, homeTeam),
    totalData: parseTotalMarket(findMarket(bookmaker, "totals"))
  };
}

async function fetchOddsList(apiKey, markets) {
  const attempts = [
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us,us2,uk,eu,au&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us,us2&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/odds?oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`
  ];

  let best = [];

  for (const url of attempts) {
    try {
      const data = await fetchJson(url, { timeoutMs: 20000 });
      if (Array.isArray(data) && data.length > best.length) best = data;
    } catch (_) {}
  }

  return best;
}

async function fetchFeaturedOdds(apiKey) {
  const [h2hOnly, featured] = await Promise.all([
    fetchOddsList(apiKey, ["h2h"]),
    fetchOddsList(apiKey, FEATURED_MARKETS)
  ]);

  const map = new Map();

  for (const e of safeArray(h2hOnly)) {
    map.set(eventKeyFromTeams(e.away_team, e.home_team), e);
  }

  for (const e of safeArray(featured)) {
    const key = eventKeyFromTeams(e.away_team, e.home_team);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, e);
    } else {
      map.set(key, {
        ...existing,
        ...e,
        bookmakers: safeArray(e.bookmakers).length ? e.bookmakers : existing.bookmakers
      });
    }
  }

  return Array.from(map.values());
}
async function fetchEventMarkets(eventId, apiKey, markets) {
  if (!eventId || String(eventId).indexOf("schedule-") === 0) return null;

  const attempts = [
    `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us,us2,uk,eu,au&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us,us2&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&apiKey=${encodeURIComponent(apiKey)}`
  ];

  for (const url of attempts) {
    try {
      const data = await fetchJson(url, { timeoutMs: 20000 });
      if (data && typeof data === "object") return data;
    } catch (_) {}
  }

  return null;
}

function mergeEventOddsObjects(primary, secondary) {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const bookmakerMap = new Map();

  for (const b of safeArray(primary.bookmakers)) {
    bookmakerMap.set(String(b.key || Math.random()), {
      ...b,
      markets: safeArray(b.markets)
    });
  }

  for (const b of safeArray(secondary.bookmakers)) {
    const key = String(b.key || Math.random());
    const existing = bookmakerMap.get(key);

    if (!existing) {
      bookmakerMap.set(key, { ...b, markets: safeArray(b.markets) });
    } else {
      const marketMap = new Map();
      for (const m of safeArray(existing.markets)) marketMap.set(String(m.key || Math.random()), m);
      for (const m of safeArray(b.markets)) marketMap.set(String(m.key || Math.random()), m);
      bookmakerMap.set(key, { ...existing, ...b, markets: Array.from(marketMap.values()) });
    }
  }

  return {
    ...primary,
    ...secondary,
    bookmakers: Array.from(bookmakerMap.values())
  };
}

async function fetchScheduleWindow() {
  const nowEt = getEtDateParts();
  const startDate = addDaysYmd(nowEt.ymd, 0);
  const endDate = addDaysYmd(nowEt.ymd, 2);

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
        awayTeamId: g?.teams?.away?.team?.id || getTeamContext(g?.teams?.away?.team?.name).id,
        homeTeamId: g?.teams?.home?.team?.id || getTeamContext(g?.teams?.home?.team?.name).id,
        awayProbablePitcher: String(g?.teams?.away?.probablePitcher?.fullName || "TBD"),
        homeProbablePitcher: String(g?.teams?.home?.probablePitcher?.fullName || "TBD"),
        awayProbablePitcherId: g?.teams?.away?.probablePitcher?.id || null,
        homeProbablePitcherId: g?.teams?.home?.probablePitcher?.id || null
      });
    }
  }

  return out;
}

function findScheduleMatch(oddsEvent, scheduleGames) {
  const away = normalizeTeamName(oddsEvent && oddsEvent.away_team);
  const home = normalizeTeamName(oddsEvent && oddsEvent.home_team);
  const commence = oddsEvent && oddsEvent.commence_time ? new Date(oddsEvent.commence_time).getTime() : null;

  return safeArray(scheduleGames).find(g => {
    const awayOk = normalizeTeamName(g.away) === away;
    const homeOk = normalizeTeamName(g.home) === home;
    if (!awayOk || !homeOk) return false;
    if (!commence || !g.commenceTime) return true;
    const delta = Math.abs(new Date(g.commenceTime).getTime() - commence);
    return delta <= 8 * 60 * 60 * 1000;
  }) || null;
}

function findOddsMatchForScheduleGame(scheduleGame, oddsEvents) {
  const away = normalizeTeamName(scheduleGame?.away);
  const home = normalizeTeamName(scheduleGame?.home);
  const commence = scheduleGame?.commenceTime ? new Date(scheduleGame.commenceTime).getTime() : null;

  return safeArray(oddsEvents).find(e => {
    const awayOk = normalizeTeamName(e?.away_team) === away;
    const homeOk = normalizeTeamName(e?.home_team) === home;
    if (!awayOk || !homeOk) return false;
    if (!commence || !e?.commence_time) return true;
    const delta = Math.abs(new Date(e.commence_time).getTime() - commence);
    return delta <= 8 * 60 * 60 * 1000;
  }) || null;
}

function buildLineupContext(scheduleMatch) {
  return {
    officialLineupAvailable: false,
    lineupMode: "projected",
    lineupSource: scheduleMatch ? "Probable pitchers + team context" : "Fallback team context",
    officialLineups: { away: null, home: null },
    projectedLineups: { away: null, home: null },
    lineupDebug: {
      scheduleMatched: !!scheduleMatch,
      officialLineupAvailable: false
    }
  };
}

function getMarketRunEnvironment(totalLine) {
  const line = Number(totalLine);
  if (!Number.isFinite(line)) return { label: "neutral", score: 0, totalLine: null };
  if (line <= 7.5) return { label: "low_run", score: -0.30, totalLine: line };
  if (line >= 9.0) return { label: "high_run", score: 0.32, totalLine: line };
  if (line >= 8.5) return { label: "slightly_high_run", score: 0.16, totalLine: line };
  if (line <= 8.0) return { label: "slightly_low_run", score: -0.13, totalLine: line };
  return { label: "neutral", score: 0, totalLine: line };
}

function estimateTeamImpliedRuns(context) {
  const total = Number(context.totalData?.line);
  if (!Number.isFinite(total)) return { away: null, home: null, diffHomeMinusAway: 0 };

  const homeProb = Number(context.modelOutputs?.homeWinProb || 50) / 100;
  const diff = clamp((homeProb - 0.5) * 2.2, -0.85, 0.85);

  return {
    away: round2(total / 2 - diff / 2),
    home: round2(total / 2 + diff / 2),
    diffHomeMinusAway: round2(diff)
  };
}

function getStarterKnownScore(name, id) {
  if (id) return 0.14;
  const n = normalizeName(name);
  if (!n || n === "tbd") return -0.04;
  return 0.08;
}

function buildComponentScores(args) {
  const lineupContext = args.lineupContext || {};
  const probablePitchers = args.probablePitchers || {};
  const awayCtx = getTeamContext(args.awayTeam);
  const homeCtx = getTeamContext(args.homeTeam);
  const marketEnv = getMarketRunEnvironment(args.totalData?.line);

  const awayStarterKnown = getStarterKnownScore(probablePitchers.away, probablePitchers.awayId);
  const homeStarterKnown = getStarterKnownScore(probablePitchers.home, probablePitchers.homeId);

  const starterDelta = round2((homeStarterKnown - awayStarterKnown) + ((homeCtx.prevention - awayCtx.prevention) * 0.8));
  const bullpenDelta = round2((homeCtx.bullpen - awayCtx.bullpen) * 0.95);
  const lineupDelta = round2((homeCtx.offense - awayCtx.offense) * 1.05);
  const offenseVsHand = round2((homeCtx.offense - awayCtx.offense) * 0.55);

  const parkImpact = round2((homeCtx.park - 1.0) * 1.6);
  const starterTotalImpact = round2(-1 * ((homeCtx.prevention + awayCtx.prevention) / 2) - ((homeStarterKnown + awayStarterKnown) * 0.10));
  const offenseTotalImpact = round2(((homeCtx.offense + awayCtx.offense) / 2) + marketEnv.score);
  const bullpenTotalImpact = round2(-1 * ((homeCtx.bullpen + awayCtx.bullpen) / 2) * 0.5);

  return {
    side: {
      startingPitcher: starterDelta,
      bullpen: bullpenDelta,
      lineup: lineupDelta,
      offenseVsHand
    },
    total: {
      starters: starterTotalImpact,
      lineup: offenseTotalImpact,
      parkFactor: parkImpact,
      bullpen: bullpenTotalImpact
    },
    market: {
      runEnvironment: marketEnv.label,
      runEnvironmentScore: marketEnv.score,
      totalLine: marketEnv.totalLine,
      parkFactor: homeCtx.park
    },
    teamContext: {
      away: {
        offense: awayCtx.offense,
        prevention: awayCtx.prevention,
        bullpen: awayCtx.bullpen,
        park: awayCtx.park
      },
      home: {
        offense: homeCtx.offense,
        prevention: homeCtx.prevention,
        bullpen: homeCtx.bullpen,
        park: homeCtx.park
      }
    },
    liveFeedStatus: {
      probablePitchers: probablePitchers.away !== "TBD" && probablePitchers.home !== "TBD" ? "live" : "partial",
      parkFactor: "static_proxy",
      teamStrength: "static_proxy",
      marketContext: "live",
      lineup: lineupContext.officialLineupAvailable ? "official" : "projected"
    }
  };
}

function buildModelOutputs(args) {
  const componentScores = args.componentScores || {};
  const moneylineData = args.moneylineData || {};
  const totalData = args.totalData || {};

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

  const homeWinProb = clamp(0.5 + (sideComposite * 0.13), 0.34, 0.66);
  const awayWinProb = clamp(1 - homeWinProb, 0.34, 0.66);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketHomeProb = moneylineData.homePrice != null ? americanToImpliedProb(moneylineData.homePrice) : null;
  const marketAwayProb = moneylineData.awayPrice != null ? americanToImpliedProb(moneylineData.awayPrice) : null;

  const awayEdgePct = marketAwayProb != null ? round2((awayWinProb - marketAwayProb) * 100) : 0;
  const homeEdgePct = marketHomeProb != null ? round2((homeWinProb - marketHomeProb) * 100) : 0;

  const baseTotal = totalData.line != null ? Number(totalData.line) : null;
  const fairTotal = baseTotal != null ? round2(baseTotal + (totalComposite * 1.15)) : null;

  let overProb = null;
  let underProb = null;

  if (baseTotal != null && fairTotal != null) {
    overProb = clamp(0.5 + ((fairTotal - baseTotal) * 0.12), 0.32, 0.68);
    underProb = clamp(1 - overProb, 0.32, 0.68);
  }

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
    overEdgePct: marketOverProb != null && overProb != null ? round2((overProb - marketOverProb) * 100) : 0,
    underEdgePct: marketUnderProb != null && underProb != null ? round2((underProb - marketUnderProb) * 100) : 0,
    overConfidence: overProb != null ? round2(overProb * 100) : null,
    underConfidence: underProb != null ? round2(underProb * 100) : null
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
      teamSide: "away",
      bestBet: `${context.awayTeam} ML`,
      bestBetType: "Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(Number(model.awayWinProb || 50) / 100),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: Number(model.awayEdgePct || 0),
      reasons: ["Away moneyline evaluated against market-implied price and team context."]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "home",
      teamSide: "home",
      bestBet: `${context.homeTeam} ML`,
      bestBetType: "Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(Number(model.homeWinProb || 50) / 100),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: Number(model.homeEdgePct || 0),
      reasons: ["Home moneyline evaluated against market-implied price and team context."]
    });
  }

  if (total.line != null && total.overPrice != null && model.overConfidence != null) {
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
      reasons: ["Over evaluated against park, team offense, starter context, and market total."]
    });
  }

  if (total.line != null && total.underPrice != null && model.underConfidence != null) {
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
      reasons: ["Under evaluated against park, team offense, starter context, and market total."]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp((Number(model.awayWinProb || 50) / 100) + 0.035, 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "away",
      teamSide: "away",
      bestBet: `${context.awayTeam} ${formatSignedPoint(rl.awayPoint)}`,
      bestBetType: "Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: ["Away run line evaluated from side strength and price."]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp((Number(model.homeWinProb || 50) / 100) + 0.035, 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "home",
      teamSide: "home",
      bestBet: `${context.homeTeam} ${formatSignedPoint(rl.homePoint)}`,
      bestBetType: "Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: ["Home run line evaluated from side strength and price."]
    });
  }

  return out;
}

function generateF5Candidates(context) {
  const out = [];
  const ml = context.f5MoneylineData || {};
  const rl = context.f5RunLineData || {};
  const total = context.f5TotalData || {};
  const model = context.modelOutputs || {};

  const sideScore =
    Number(context.componentScores?.side?.startingPitcher || 0) +
    Number(context.componentScores?.side?.lineup || 0);

  const homeProb = clamp(0.5 + (sideScore * 0.16), 0.34, 0.66);
  const awayProb = clamp(1 - homeProb, 0.34, 0.66);

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "away",
      teamSide: "away",
      bestBet: `${context.awayTeam} F5 ML`,
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(awayProb),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: round2((awayProb - (americanToImpliedProb(ml.awayPrice) || 0)) * 100),
      reasons: ["Away F5 moneyline emphasizes starter and projected lineup edge."]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "home",
      teamSide: "home",
      bestBet: `${context.homeTeam} F5 ML`,
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(homeProb),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: round2((homeProb - (americanToImpliedProb(ml.homePrice) || 0)) * 100),
      reasons: ["Home F5 moneyline emphasizes starter and projected lineup edge."]
    });
  }

  if (total.line != null && total.overPrice != null) {
    const overProb = clamp(Number(model.overConfidence || 50) / 100, 0.32, 0.68);
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
      reasons: ["F5 over uses early-game scoring environment and starter context."]
    });
  }

  if (total.line != null && total.underPrice != null) {
    const underProb = clamp(Number(model.underConfidence || 50) / 100, 0.32, 0.68);
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
      reasons: ["F5 under uses early-game scoring environment and starter context."]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(awayProb + 0.025, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "away",
      teamSide: "away",
      bestBet: `${context.awayTeam} F5 ${formatSignedPoint(rl.awayPoint)}`,
      bestBetType: "F5 Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: ["Away F5 run line uses starter-weighted side strength."]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(homeProb + 0.025, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "home",
      teamSide: "home",
      bestBet: `${context.homeTeam} F5 ${formatSignedPoint(rl.homePoint)}`,
      bestBetType: "F5 Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: ["Home F5 run line uses starter-weighted side strength."]
    });
  }

  return out;
}
function marketKeyToLabel(marketKey) {
  switch (marketKey) {
    case "batter_hits": return "Hits";
    case "batter_total_bases": return "Total Bases";
    case "batter_home_runs": return "Home Runs";
    case "batter_rbis": return "RBIs";
    case "batter_runs_scored": return "Runs Scored";
    case "batter_hits_runs_rbis": return "Hits + Runs + RBIs";
    case "batter_stolen_bases": return "Stolen Bases";
    case "batter_walks": return "Walks";
    case "batter_singles": return "Singles";
    case "batter_doubles": return "Doubles";
    case "batter_triples": return "Triples";
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

function getMarketPropTilt(marketKey, side, context) {
  const runEnvScore = Number(context.componentScores?.market?.runEnvironmentScore || 0);
  const highRunBoost = runEnvScore > 0 ? runEnvScore * 0.20 : runEnvScore * 0.08;
  const lowRunBoost = runEnvScore < 0 ? Math.abs(runEnvScore) * 0.17 : 0;

  const base =
    marketKey === "pitcher_strikeouts" ? 0.12 :
    marketKey === "pitcher_outs" ? 0.10 :
    marketKey === "batter_total_bases" ? 0.14 :
    marketKey === "batter_home_runs" ? 0.09 :
    marketKey === "batter_stolen_bases" ? 0.09 :
    marketKey === "batter_hits_runs_rbis" ? 0.13 :
    marketKey === "batter_rbis" ? 0.11 :
    marketKey === "batter_runs_scored" ? 0.11 :
    marketKey === "batter_doubles" ? 0.09 :
    marketKey === "batter_triples" ? 0.06 :
    marketKey === "batter_walks" ? 0.08 :
    marketKey === "batter_singles" ? 0.09 :
    0.09;

  if (marketKey.startsWith("batter_")) {
    if (side === "over") return round2(base + highRunBoost - (lowRunBoost * 0.30));
    return round2(base * 0.70 + lowRunBoost - (highRunBoost * 0.20));
  }

  if (marketKey.startsWith("pitcher_")) {
    if (side === "over") return round2(base + lowRunBoost - (highRunBoost * 0.35));
    return round2(base * 0.72 + highRunBoost - (lowRunBoost * 0.20));
  }

  return base;
}

function buildPropCandidates(eventOdds, context) {
  const candidates = [];
  const books = safeArray(eventOdds && eventOdds.bookmakers);

  for (const bookmaker of books) {
    for (const market of safeArray(bookmaker && bookmaker.markets)) {
      const marketKey = String(market?.key || "");
      if (!PROP_MARKETS.includes(marketKey)) continue;

      const bucket = {};

      for (const outcome of safeArray(market.outcomes)) {
        const player = parsePropPlayer(outcome);
        const side = parsePropSide(outcome);
        const point = toTotalLine(outcome?.point);
        const price = toPrice(outcome?.price);

        if (!player || !side || point == null || price == null) continue;

        const key = `${normalizeName(player)}|${marketKey}|${point}`;
        bucket[key] = bucket[key] || {
          player,
          marketKey,
          point,
          overPrice: null,
          underPrice: null,
          overBook: null,
          underBook: null
        };

        if (side === "over") {
          const better = betterPrice(bucket[key].overPrice, price);
          if (better === price) {
            bucket[key].overPrice = price;
            bucket[key].overBook = bookmaker.key || null;
          }
        }

        if (side === "under") {
          const better = betterPrice(bucket[key].underPrice, price);
          if (better === price) {
            bucket[key].underPrice = price;
            bucket[key].underBook = bookmaker.key || null;
          }
        }
      }

      for (const key of Object.keys(bucket)) {
        const row = bucket[key];
        const marketLabel = marketKeyToLabel(row.marketKey);
        const propSubType = marketKeyToPropSubType(row.marketKey);

        if (row.overPrice != null) {
          const implied = americanToImpliedProb(row.overPrice);
          const contextTilt = getMarketPropTilt(row.marketKey, "over", context);
          const fairProb = clamp((implied || 0.5) + contextTilt * 0.28, 0.05, 0.95);

          candidates.push({
            marketFamily: "prop",
            propSubType,
            market: row.marketKey,
            player: row.player,
            side: "over",
            bookKey: row.overBook,
            bestBet: `${row.player} ${marketLabel} Over ${row.point}`,
            bestBetType: "Prop",
            oddsPrice: row.overPrice,
            fairProb: round2(fairProb),
            impliedProb: implied,
            edgePct: round2((fairProb - (implied || 0)) * 100),
            contextTilt: round2(contextTilt),
            modelProb: round2(fairProb),
            reasons: [`${marketLabel} over evaluated across all available prop books.`]
          });
        }

        if (row.underPrice != null) {
          const implied = americanToImpliedProb(row.underPrice);
          const contextTilt = getMarketPropTilt(row.marketKey, "under", context);
          const fairProb = clamp((implied || 0.5) + contextTilt * 0.22, 0.05, 0.95);

          candidates.push({
            marketFamily: "prop",
            propSubType,
            market: row.marketKey,
            player: row.player,
            side: "under",
            bookKey: row.underBook,
            bestBet: `${row.player} ${marketLabel} Under ${row.point}`,
            bestBetType: "Prop",
            oddsPrice: row.underPrice,
            fairProb: round2(fairProb),
            impliedProb: implied,
            edgePct: round2((fairProb - (implied || 0)) * 100),
            contextTilt: round2(contextTilt),
            modelProb: round2(fairProb),
            reasons: [`${marketLabel} under evaluated across all available prop books.`]
          });
        }
      }
    }
  }

  const deduped = new Map();

  for (const c of candidates) {
    const key = `${normalizeName(c.player)}|${c.market}|${c.side}|${c.bestBet}`;
    const existing = deduped.get(key);
    if (!existing || Number(c.oddsPrice || -9999) > Number(existing.oddsPrice || -9999)) {
      deduped.set(key, c);
    }
  }

  return Array.from(deduped.values());
}

function getSignedEdgePct(candidate) {
  const n = Number(candidate?.edgePct);
  return Number.isFinite(n) ? n : 0;
}

function getPositiveEdgePct(candidate) {
  return Math.max(0, getSignedEdgePct(candidate));
}

function getPriceDisciplineBonus(price) {
  const p = toPrice(price);
  if (p === null) return 0.25;
  if (p >= -120 && p <= 165) return 1.30;
  if (p >= -140 && p <= 225) return 1.00;
  if (p >= -165 && p <= 325) return 0.65;
  if (p < -165 && p >= -220) return 0.00;
  if (p < -220) return -0.12;
  return 0.30;
}

function getNegativeEdgePenalty(candidate) {
  const edge = getSignedEdgePct(candidate);
  return edge >= 0 ? 0 : Math.abs(edge) * 0.50;
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
    if (market === "batter_rbis") return "hitter_rbi_prop";
    if (market === "batter_runs_scored") return "hitter_runs_prop";
    if (market === "batter_hits_runs_rbis") return "hitter_combo_prop";
    if (market === "batter_stolen_bases") return "hitter_sb_prop";
    if (market === "batter_walks") return "hitter_walks_prop";
    return "generic_prop";
  }

  if (/^Under /i.test(bestBet) || /^Over /i.test(bestBet)) return "total";
  if (/Run Line/i.test(String(candidate?.bestBetType || ""))) return "runline";
  return "side";
}

function getPitcherTeamForCandidate(candidate, context) {
  if (candidate?.marketFamily !== "prop") return null;
  const player = normalizeName(candidate.player || "");
  const awayPitcher = normalizeName(context?.probablePitchers?.away || "");
  const homePitcher = normalizeName(context?.probablePitchers?.home || "");

  if (player && awayPitcher && player === awayPitcher) return "away";
  if (player && homePitcher && player === homePitcher) return "home";
  return null;
}

function getCandidateScript(candidate, context) {
  const bucket = getCandidateBucket(candidate);
  const script = {
    favoredTeam: null,
    runEnv: null,
    pitcherTeam: null,
    pitcherSide: null,
    hitterPropSide: null
  };

  if (bucket === "side" || bucket === "runline" || bucket === "f5_side" || bucket === "f5_runline") {
    script.favoredTeam = candidate.side === "away" || candidate.side === "home" ? candidate.side : null;
  }

  if (bucket === "total" || bucket === "f5_total") {
    script.runEnv = candidate.side === "over" || candidate.side === "under" ? candidate.side : null;
  }

  if (bucket === "pitcher_k_prop" || bucket === "pitcher_outs_prop") {
    script.pitcherTeam = getPitcherTeamForCandidate(candidate, context);
    script.pitcherSide = candidate.side;
    if (candidate.side === "over") script.runEnv = "under";
    if (candidate.side === "under") script.runEnv = "over";
  }

  if (String(bucket).startsWith("hitter_")) {
    script.hitterPropSide = candidate.side;
    if (candidate.side === "over") script.runEnv = "over";
    if (candidate.side === "under") script.runEnv = "under";
  }

  return script;
}

function getConflictReason(a, b, context) {
  const sa = getCandidateScript(a, context);
  const sb = getCandidateScript(b, context);

  if (sa.favoredTeam && sb.pitcherTeam && sb.pitcherSide === "over" && sa.favoredTeam !== sb.pitcherTeam) {
    return "Conflicts with opposing starter over prop.";
  }
  if (sb.favoredTeam && sa.pitcherTeam && sa.pitcherSide === "over" && sb.favoredTeam !== sa.pitcherTeam) {
    return "Conflicts with opposing starter over prop.";
  }
  if (sa.runEnv && sb.runEnv && sa.runEnv !== sb.runEnv) {
    return "Conflicts with stronger same-game scoring script.";
  }
  if (sa.favoredTeam && sb.favoredTeam && sa.favoredTeam !== sb.favoredTeam) {
    return "Conflicts with stronger same-game side script.";
  }

  return "";
}

function getConflictSeverity(a, b, context) {
  const sa = getCandidateScript(a, context);
  const sb = getCandidateScript(b, context);
  let sev = 0;

  if (sa.favoredTeam && sb.pitcherTeam && sb.pitcherSide === "over" && sa.favoredTeam !== sb.pitcherTeam) sev += 0.85;
  if (sb.favoredTeam && sa.pitcherTeam && sa.pitcherSide === "over" && sb.favoredTeam !== sa.pitcherTeam) sev += 0.85;
  if (sa.runEnv && sb.runEnv && sa.runEnv !== sb.runEnv) sev += 0.35;
  if (sa.favoredTeam && sb.favoredTeam && sa.favoredTeam !== sb.favoredTeam) sev += 0.65;
  if (sa.runEnv === "under" && sb.hitterPropSide === "over") sev += 0.25;
  if (sb.runEnv === "under" && sa.hitterPropSide === "over") sev += 0.25;
  if (sa.runEnv === "over" && sb.pitcherSide === "over") sev += 0.12;
  if (sb.runEnv === "over" && sa.pitcherSide === "over") sev += 0.12;

  return round2(sev);
}

function getMarketShapeBonus(candidate, context) {
  const bucket = getCandidateBucket(candidate);
  const marketEnvScore = Math.abs(Number(context?.componentScores?.market?.runEnvironmentScore || 0));

  if (bucket === "side") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 1.10;
  if (bucket === "total") return Math.abs(Number(context?.modelOutputs?.totalComposite || 0)) * 1.10 + marketEnvScore;
  if (bucket === "runline") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 0.82;
  if (bucket === "f5_side") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 1.15;
  if (bucket === "f5_total") return Math.abs(Number(context?.modelOutputs?.totalComposite || 0)) * 1.08 + marketEnvScore;
  if (bucket === "f5_runline") return Math.abs(Number(context?.modelOutputs?.sideComposite || 0)) * 0.88;
  if (String(bucket).startsWith("hitter_")) return Math.abs(Number(candidate?.contextTilt || 0)) * 1.18 + marketEnvScore * 0.60;
  if (String(bucket).startsWith("pitcher_")) return Math.abs(Number(candidate?.contextTilt || 0)) * 1.05 + marketEnvScore * 0.50;

  return Math.abs(Number(candidate?.contextTilt || 0)) * 0.80;
}

function getContextScore(candidate, context) {
  const lineupBonus = context?.lineupContext?.officialLineupAvailable ? 0.34 : 0.16;
  const starterKnownBonus =
    context?.probablePitchers?.away !== "TBD" && context?.probablePitchers?.home !== "TBD" ? 0.27 : 0.08;
  const marketShapeBonus = getMarketShapeBonus(candidate, context);

  return round2(lineupBonus + starterKnownBonus + marketShapeBonus);
}

function getDataCompleteness(componentScores, lineupContext, candidate) {
  let score = 0;
  const bucket = getCandidateBucket(candidate);

  score += lineupContext?.officialLineupAvailable ? 12 : 7;
  score += componentScores?.liveFeedStatus?.probablePitchers === "live" ? 18 : 9;
  if (componentScores?.market?.totalLine != null) score += 22;
  if (componentScores?.liveFeedStatus?.teamStrength === "static_proxy") score += 16;
  if (componentScores?.liveFeedStatus?.parkFactor === "static_proxy") score += 12;
  if (componentScores?.liveFeedStatus?.marketContext === "live") score += 18;
  if (String(bucket).startsWith("hitter_")) score += 7;
  if (String(bucket).startsWith("pitcher_")) score += 6;

  return Math.max(0, Math.min(score, 100));
}

function getValueScore(candidate) {
  const positiveEdge = getPositiveEdgePct(candidate);
  const negativeEdgePenalty = getNegativeEdgePenalty(candidate);
  const juiceBonus = getPriceDisciplineBonus(candidate?.oddsPrice);

  const fairProbBonus =
    candidate?.fairProb != null && candidate?.impliedProb != null
      ? Math.max(0, (Number(candidate.fairProb) - Number(candidate.impliedProb)) * 0.95)
      : 0;

  return round2((positiveEdge * 0.95) + juiceBonus + fairProbBonus - negativeEdgePenalty);
}

function getThresholdsForCandidate(candidate) {
  const bucket = getCandidateBucket(candidate);

  switch (bucket) {
    case "side":
      return { high: 1.20, medium: 0.35, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "total":
      return { high: 1.15, medium: 0.30, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "runline":
      return { high: 1.35, medium: 0.45, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "f5_side":
      return { high: 1.30, medium: 0.42, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "f5_total":
      return { high: 1.35, medium: 0.45, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "f5_runline":
      return { high: 1.45, medium: 0.50, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 10 };
    case "pitcher_k_prop":
    case "pitcher_outs_prop":
      return { high: 1.20, medium: 0.38, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 8 };
    case "hitter_hits_prop":
    case "hitter_tb_prop":
    case "hitter_hr_prop":
    case "hitter_rbi_prop":
    case "hitter_runs_prop":
    case "hitter_combo_prop":
    case "hitter_sb_prop":
    case "hitter_walks_prop":
      return { high: 1.00, medium: 0.25, minEdgeHigh: -2.5, minEdgeMedium: -99, minCompletenessHigh: 8 };
    default:
      return { high: 1.10, medium: 0.30, minEdgeHigh: -2.0, minEdgeMedium: -99, minCompletenessHigh: 8 };
  }
}

function assignConfidenceForCandidate(candidateLike) {
  const thresholds = getThresholdsForCandidate(candidateLike);
  const edge = getSignedEdgePct(candidateLike);

  if (
    Number(candidateLike.finalScore || 0) >= thresholds.high &&
    edge >= thresholds.minEdgeHigh &&
    Number(candidateLike.dataCompleteness || 0) >= thresholds.minCompletenessHigh
  ) {
    return "High";
  }

  if (Number(candidateLike.finalScore || 0) >= thresholds.medium && edge >= thresholds.minEdgeMedium) {
    return "Medium";
  }

  return "Low";
}

function addConfidenceCompatibilityFields(obj) {
  const confidence = obj.confidence || "Low";
  const tier = confidence === "High" ? "high" : confidence === "Medium" ? "medium" : "low";
  const label = confidence === "High" ? "High Confidence" : confidence === "Medium" ? "Medium Confidence" : "Low Confidence";

  return {
    ...obj,
    confidence,
    confidenceTier: tier,
    confidenceLabel: label,
    bestBetConfidence: label,
    confidenceDisplay: label
  };
}

function scoreCandidateBase(candidate, context) {
  const valueScore = getValueScore(candidate);
  const contextScore = getContextScore(candidate, context);
  const dataCompleteness = getDataCompleteness(context.componentScores, context.lineupContext, candidate);
  const completenessBoost = round2((dataCompleteness / 100) * 1.0);
  const finalScore = round2(valueScore + contextScore + completenessBoost);

  let out = {
    ...candidate,
    valueScore,
    contextScore,
    dataCompleteness,
    finalScore,
    conflictPenalty: 0,
    conflictReason: "",
    confidence: "Low",
    confidenceScore: 0,
    recommendedTiming: "Pass / monitor",
    recommendedStakeUnits: 0.0,
    missedHighReasons: []
  };

  out.confidence = assignConfidenceForCandidate(out);
  out.confidenceScore = sigmoidScoreToPct(out.finalScore);
  out.recommendedTiming = out.confidence === "High" ? "Bet sooner" : out.confidence === "Medium" ? "Monitor market" : "Pass / monitor";
  out.recommendedStakeUnits = out.confidence === "High" ? 1.0 : out.confidence === "Medium" ? 0.5 : 0.0;

  return addConfidenceCompatibilityFields(out);
}

function applyConflictAdjustments(scoredCandidates, context) {
  const prelim = [...safeArray(scoredCandidates)].sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
  const adjusted = [];

  for (let i = 0; i < prelim.length; i += 1) {
    let candidate = { ...prelim[i] };
    let penalty = 0;
    let reason = "";

    const stronger = prelim.slice(0, i).filter(other => {
      return Number(other.finalScore || 0) >= 0.75 || other.confidence === "High" || other.confidence === "Medium";
    });

    for (const other of stronger.slice(0, 6)) {
      const sev = getConflictSeverity(candidate, other, context);
      if (sev > penalty) {
        penalty = sev;
        reason = getConflictReason(candidate, other, context);
      }
    }

    candidate.conflictPenalty = round2(penalty);
    candidate.conflictReason = reason || "";
    candidate.finalScore = round2(candidate.finalScore - candidate.conflictPenalty);
    candidate.confidence = assignConfidenceForCandidate(candidate);
    candidate.confidenceScore = sigmoidScoreToPct(candidate.finalScore);
    candidate.recommendedTiming = candidate.confidence === "High" ? "Bet sooner" : candidate.confidence === "Medium" ? "Monitor market" : "Pass / monitor";
    candidate.recommendedStakeUnits = candidate.confidence === "High" ? 1.0 : candidate.confidence === "Medium" ? 0.5 : 0.0;

    if (candidate.conflictReason) {
      candidate.reasons = safeArray(candidate.reasons).concat([candidate.conflictReason]);
    }

    adjusted.push(addConfidenceCompatibilityFields(candidate));
  }

  return adjusted.sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
}

function calibrateCategoryConfidence(rankedCandidates, context) {
  const arr = safeArray(rankedCandidates).map(c => ({ ...c }));

  const categories = [
    { name: "full", test: c => c.marketFamily === "full", floor: 0.60, maxConflict: 0.95 },
    { name: "f5", test: c => c.marketFamily === "f5", floor: 0.60, maxConflict: 0.95 },
    { name: "hitter_props", test: c => c.marketFamily === "prop" && c.propSubType === "hitter", floor: 0.35, maxConflict: 0.85 },
    { name: "pitcher_props", test: c => c.marketFamily === "prop" && c.propSubType === "pitcher", floor: 0.40, maxConflict: 0.85 }
  ];

  for (const cat of categories) {
    const hasHigh = arr.some(c => cat.test(c) && c.confidence === "High");
    if (hasHigh) continue;

    const top = arr.find(c =>
      cat.test(c) &&
      c.bestBet &&
      c.bestBet !== "Pass" &&
      Number(c.finalScore || 0) >= cat.floor &&
      Number(c.conflictPenalty || 0) <= cat.maxConflict
    );

    if (!top) continue;

    top.confidence = "High";
    top.confidenceScore = Math.max(Number(top.confidenceScore || 0), 61);
    top.recommendedTiming = "Bet sooner";
    top.recommendedStakeUnits = 1.0;
    top.calibratedHigh = true;
    top.reasons = safeArray(top.reasons).concat(["Category calibration promoted the top playable non-conflicted pick."]);
    Object.assign(top, addConfidenceCompatibilityFields(top));
  }

  const keptHigh = [];

  for (const candidate of arr.sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))) {
    if (candidate.confidence !== "High") continue;

    const conflict = keptHigh.find(other => getConflictSeverity(candidate, other, context) >= 1.00);
    if (conflict) {
      candidate.confidence = "Medium";
      candidate.confidenceScore = Math.min(Number(candidate.confidenceScore || 50), 58);
      candidate.recommendedTiming = "Monitor market";
      candidate.recommendedStakeUnits = 0.5;
      candidate.conflictPenalty = round2(Number(candidate.conflictPenalty || 0) + 1.00);
      candidate.conflictReason = "Downgraded to avoid conflicting same-game High picks.";
      candidate.reasons = safeArray(candidate.reasons).concat([candidate.conflictReason]);
      Object.assign(candidate, addConfidenceCompatibilityFields(candidate));
    } else {
      keptHigh.push(candidate);
    }
  }

  return arr.map(addConfidenceCompatibilityFields).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
}

function addMissedHighReasons(candidates) {
  return safeArray(candidates).map(c => {
    const thresholds = getThresholdsForCandidate(c);
    const missed = [];

    if (c.confidence !== "High") {
      if (Number(c.finalScore || 0) < thresholds.high) missed.push(`finalScore below high threshold (${c.finalScore} < ${thresholds.high})`);
      if (getSignedEdgePct(c) < thresholds.minEdgeHigh) missed.push(`edge below high minimum (${getSignedEdgePct(c)} < ${thresholds.minEdgeHigh})`);
      if (Number(c.dataCompleteness || 0) < thresholds.minCompletenessHigh) missed.push(`dataCompleteness below high minimum (${c.dataCompleteness} < ${thresholds.minCompletenessHigh})`);
      if (Number(c.conflictPenalty || 0) > 0) missed.push(`conflict penalty applied (${c.conflictPenalty})`);
    }

    return addConfidenceCompatibilityFields({
      ...c,
      highThreshold: thresholds.high,
      mediumThreshold: thresholds.medium,
      missedHighReasons: missed
    });
  });
}

function rankCandidates(candidates, context) {
  const baseScored = safeArray(candidates).map(c => scoreCandidateBase(c, context));
  const adjusted = applyConflictAdjustments(baseScored, context);
  const calibrated = calibrateCategoryConfidence(adjusted, context);
  const withReasons = addMissedHighReasons(calibrated);

  return withReasons.map((c, idx) => ({
    ...addConfidenceCompatibilityFields(c),
    slateRank: idx + 1
  }));
}

function filterCandidatesForView(candidates, viewMode) {
  const arr = safeArray(candidates);
  if (viewMode === "pitcher_props") return arr.filter(c => c.marketFamily === "prop" && c.propSubType === "pitcher");
  if (viewMode === "hitter_props") return arr.filter(c => c.marketFamily === "prop" && c.propSubType === "hitter");
  if (viewMode === "props") return arr.filter(c => c.marketFamily === "prop");
  if (viewMode === "f5") return arr.filter(c => c.marketFamily === "f5");
  return arr.filter(c => c.marketFamily === "full");
}

function chooseBestCandidate(filteredCandidates, rankedCandidates, viewMode) {
  const arr = safeArray(filteredCandidates);
  if (arr.length) return arr[0];

  const ranked = safeArray(rankedCandidates);
  if (viewMode === "full") return ranked.find(c => c.marketFamily === "full") || null;
  if (viewMode === "f5") return ranked.find(c => c.marketFamily === "f5") || null;
  if (viewMode === "pitcher_props") return ranked.find(c => c.marketFamily === "prop" && c.propSubType === "pitcher") || null;
  if (viewMode === "hitter_props") return ranked.find(c => c.marketFamily === "prop" && c.propSubType === "hitter") || null;
  if (viewMode === "props") return ranked.find(c => c.marketFamily === "prop") || null;

  return null;
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

function buildRiskWarnings(componentScores, bestCandidate) {
  const warnings = [];
  if (!bestCandidate || bestCandidate.bestBet === "Pass") warnings.push("No market cleared the current thresholds.");
  if (componentScores?.liveFeedStatus?.probablePitchers !== "live") warnings.push("Probable pitcher feed is partial or unavailable.");
  if (componentScores?.liveFeedStatus?.lineup !== "official") warnings.push("Lineups are projected, not confirmed.");
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
  const bestRaw = chooseBestCandidate(filtered, ranked, args.viewMode);
  const best = bestRaw ? addConfidenceCompatibilityFields(bestRaw) : null;
  const topProp = chooseTopPropCandidate(ranked);
  const riskWarnings = buildRiskWarnings(context.componentScores, best);

  const fullCandidates = ranked.filter(c => c.marketFamily === "full");
  const f5Candidates = ranked.filter(c => c.marketFamily === "f5");

  const base = {
    id: event.id || `${normalizeName(event.away_team)}-at-${normalizeName(event.home_team)}`,
    eventId: event.id || `${normalizeName(event.away_team)}-at-${normalizeName(event.home_team)}`,
    rawCommenceTime: event.commence_time || null,
    time: formatEtDateTime(event.commence_time),
    away: event.away_team,
    home: event.home_team,
    viewMode: args.viewMode,

    probablePitchers: context.probablePitchers,
    lineupMode: context.lineupContext.lineupMode,
    lineupSource: context.lineupContext.lineupSource,

    moneyline: `${event.away_team} ${formatPrice(context.moneylineData.awayPrice)} | ${event.home_team} ${formatPrice(context.moneylineData.homePrice)}`,
    runLine:
      context.spreadData.awayPoint != null || context.spreadData.homePoint != null
        ? `${event.away_team} ${context.spreadData.awayPoint != null ? formatSignedPoint(context.spreadData.awayPoint) : "—"} (${formatPrice(context.spreadData.awayPrice)}) | ${event.home_team} ${context.spreadData.homePoint != null ? formatSignedPoint(context.spreadData.homePoint) : "—"} (${formatPrice(context.spreadData.homePrice)})`
        : "N/A",
    total:
      context.totalData.line != null
        ? `Over ${context.totalData.line} ${formatPrice(context.totalData.overPrice)} | Under ${context.totalData.line} ${formatPrice(context.totalData.underPrice)}`
        : "N/A",

    firstFiveMoneyline:
      context.f5MoneylineData.awayPrice != null || context.f5MoneylineData.homePrice != null
        ? `${event.away_team} ${formatPrice(context.f5MoneylineData.awayPrice)} | ${event.home_team} ${formatPrice(context.f5MoneylineData.homePrice)}`
        : "N/A",
    firstFiveRunLine:
      context.f5RunLineData.awayPoint != null || context.f5RunLineData.homePoint != null
        ? `${event.away_team} F5 ${context.f5RunLineData.awayPoint != null ? formatSignedPoint(context.f5RunLineData.awayPoint) : "—"} (${formatPrice(context.f5RunLineData.awayPrice)}) | ${event.home_team} F5 ${context.f5RunLineData.homePoint != null ? formatSignedPoint(context.f5RunLineData.homePoint) : "—"} (${formatPrice(context.f5RunLineData.homePrice)})`
        : "N/A",
    firstFiveTotal:
      context.f5TotalData.line != null
        ? `Over ${context.f5TotalData.line} ${formatPrice(context.f5TotalData.overPrice)} | Under ${context.f5TotalData.line} ${formatPrice(context.f5TotalData.underPrice)}`
        : "N/A",

    bestBet: best ? best.bestBet : "Pass",
    bestBetType: best ? best.bestBetType : "Pass",
    bestBetOdds: best && hasValue(best.oddsPrice) ? best.oddsPrice : null,
    confidence: best ? best.confidence : "Low",
    confidenceScore: best && hasValue(best.confidenceScore) ? best.confidenceScore : 0,
    confidenceTier: best ? best.confidenceTier : "low",
    confidenceLabel: best ? best.confidenceLabel : "Low Confidence",
    bestBetConfidence: best ? best.bestBetConfidence : "Low Confidence",
    confidenceDisplay: best ? best.confidenceDisplay : "Low Confidence",
    recommendedTiming: best ? best.recommendedTiming : "Monitor market",
    recommendedStakeUnits: best && hasValue(best.recommendedStakeUnits) ? best.recommendedStakeUnits : 0,
    reasons: best ? safeArray(best.reasons) : ["No qualifying candidate was generated for this view."],

    fairMlAway: context.modelOutputs.fairMlAway,
    fairMlHome: context.modelOutputs.fairMlHome,
    fairTotal: context.modelOutputs.fairTotal,
    awayEdgePct: context.modelOutputs.awayEdgePct,
    homeEdgePct: context.modelOutputs.homeEdgePct,
    overEdgePct: context.modelOutputs.overEdgePct,
    underEdgePct: context.modelOutputs.underEdgePct,

    moneylineConfidence: deriveConfidenceMap(fullCandidates, "moneyline"),
    totalConfidence: deriveTotalConfidenceMap(fullCandidates, "total"),
    runLineConfidence: deriveConfidenceMap(fullCandidates, "runline"),
    firstFiveMoneylineConfidence: deriveConfidenceMap(f5Candidates, "f5_moneyline"),
    firstFiveTotalConfidence: deriveTotalConfidenceMap(f5Candidates, "f5_total"),
    firstFiveRunLineConfidence: deriveConfidenceMap(f5Candidates, "f5_runline"),

    topPropOverall: topProp,
    topPropOverallReason: topProp ? `${topProp.market} ranked highest among prop candidates.` : "No supported prop returned.",
    propStatus: topProp ? "Top prop candidate returned." : "No supported prop returned for this game.",

    componentScores: context.componentScores,
    marketRunEnvironment: context.componentScores?.market?.runEnvironment,
    impliedRuns: context.impliedRuns,
    riskWarnings,
    parkFactor: context.componentScores?.market?.parkFactor || 1.0,

    debug: {
      selectedBest: best ? {
        bestBet: best.bestBet,
        confidence: best.confidence,
        confidenceLabel: best.confidenceLabel,
        finalScore: best.finalScore,
        highThreshold: best.highThreshold,
        mediumThreshold: best.mediumThreshold,
        edgePct: best.edgePct,
        dataCompleteness: best.dataCompleteness,
        conflictPenalty: best.conflictPenalty,
        conflictReason: best.conflictReason,
        missedHighReasons: best.missedHighReasons,
        calibratedHigh: !!best.calibratedHigh
      } : null,
      propDiagnostics: context.propDiagnostics || null,
      topCandidates: ranked.slice(0, 14).map(c => ({
        bestBet: c.bestBet,
        bestBetType: c.bestBetType,
        marketFamily: c.marketFamily,
        propSubType: c.propSubType || null,
        edgePct: c.edgePct,
        valueScore: c.valueScore,
        contextScore: c.contextScore,
        dataCompleteness: c.dataCompleteness,
        highThreshold: c.highThreshold,
        mediumThreshold: c.mediumThreshold,
        conflictPenalty: c.conflictPenalty,
        conflictReason: c.conflictReason,
        finalScore: c.finalScore,
        confidence: c.confidence,
        confidenceLabel: c.confidenceLabel,
        calibratedHigh: !!c.calibratedHigh,
        missedHighReasons: c.missedHighReasons,
        slateRank: c.slateRank
      }))
    }
  };

  return addConfidenceCompatibilityFields(base);
}

function forceGameConfidence(game, confidence, viewMode, reason) {
  if (!game || !game.bestBet || game.bestBet === "Pass") return game;

  game.confidence = confidence;
  game.confidenceScore = confidence === "High"
    ? Math.max(Number(game.confidenceScore || 0), 62)
    : Math.max(Number(game.confidenceScore || 0), 53);

  game.recommendedTiming = confidence === "High" ? "Bet sooner" : "Monitor market";
  game.recommendedStakeUnits = confidence === "High" ? 1.0 : 0.5;
  game.reasons = safeArray(game.reasons).concat([reason || `View-level calibration promoted this ${viewMode} candidate.`]);

  Object.assign(game, addConfidenceCompatibilityFields(game));

  game.debug = game.debug || {};
  if (confidence === "High") game.debug.viewCalibratedHigh = true;
  if (confidence === "Medium") game.debug.viewCalibratedMedium = true;

  return game;
}

function calibrateResponseGames(games, viewMode) {
  const playable = safeArray(games)
    .filter(g => g && g.bestBet && g.bestBet !== "Pass")
    .sort((a, b) => {
      const bs = Number(b.confidenceScore || 0);
      const as = Number(a.confidenceScore || 0);
      if (bs !== as) return bs - as;
      const bo = hasValue(b.bestBetOdds) ? 1 : 0;
      const ao = hasValue(a.bestBetOdds) ? 1 : 0;
      return bo - ao;
    });

  if (!playable.length) return games.map(addConfidenceCompatibilityFields);

  const hasHigh = playable.some(g => g.confidence === "High");
  const hasMedium = playable.some(g => g.confidence === "Medium");

  if (!hasHigh) {
    forceGameConfidence(
      playable[0],
      "High",
      viewMode,
      `View-level calibration promoted the strongest ${viewMode} candidate.`
    );
  }

  if (!hasMedium && playable.length > 1) {
    const mediumTarget = playable.find(g => g !== playable[0] && g.confidence !== "High") || playable[1];
    if (mediumTarget && mediumTarget.confidence !== "High") {
      forceGameConfidence(
        mediumTarget,
        "Medium",
        viewMode,
        `View-level calibration promoted a backup ${viewMode} candidate to Medium.`
      );
    }
  }

  return games.map(addConfidenceCompatibilityFields);
}

function summarizeConfidenceCounts(games) {
  const out = { highCount: 0, mediumCount: 0, lowCount: 0, passCount: 0, playableCount: 0 };

  for (const g of safeArray(games)) {
    if (!g || !g.bestBet || g.bestBet === "Pass") {
      out.passCount += 1;
      continue;
    }

    out.playableCount += 1;

    if (g.confidence === "High") out.highCount += 1;
    else if (g.confidence === "Medium") out.mediumCount += 1;
    else out.lowCount += 1;
  }

  return out;
}

async function buildGameContext(event, apiKey, scheduleGames, viewMode) {
  const eventFeaturedOdds = await fetchEventMarkets(event.id, apiKey, FEATURED_MARKETS);
  const featured = eventFeaturedOdds ? parseFeaturedOddsFromEvent(eventFeaturedOdds) : parseFeaturedOddsFromEvent(event);

  const scheduleMatch = findScheduleMatch(event, scheduleGames);

  const probablePitchers = {
    away: scheduleMatch?.awayProbablePitcher || "TBD",
    home: scheduleMatch?.homeProbablePitcher || "TBD",
    awayId: scheduleMatch?.awayProbablePitcherId || null,
    homeId: scheduleMatch?.homeProbablePitcherId || null,
    awayHand: null,
    homeHand: null
  };

  const lineupContext = buildLineupContext(scheduleMatch);

  const componentScores = buildComponentScores({
    awayTeam: event.away_team,
    homeTeam: event.home_team,
    lineupContext,
    probablePitchers,
    totalData: featured.totalData
  });

  const modelOutputs = buildModelOutputs({
    componentScores,
    moneylineData: featured.moneylineData,
    totalData: featured.totalData
  });

  let f5MoneylineData = {};
  let f5RunLineData = {};
  let f5TotalData = {};
  let propOdds = null;
  let propDiagnostics = {
    propRequestMade: false,
    propBookmakers: 0,
    propMarketsReturned: [],
    propCandidateCount: 0
  };

  if (viewMode === "f5") {
    const f5Odds = await fetchEventMarkets(event.id, apiKey, F5_MARKETS);
    const f5Book = pickPreferredBookmaker(f5Odds?.bookmakers);
    f5MoneylineData = parseMoneylineMarket(findMarket(f5Book, "h2h_1st_5_innings"), event.away_team, event.home_team);
    f5RunLineData = parseSpreadMarket(findMarket(f5Book, "spreads_1st_5_innings"), event.away_team, event.home_team);
    f5TotalData = parseTotalMarket(findMarket(f5Book, "totals_1st_5_innings"));
  }

  if (["props", "hitter_props", "pitcher_props"].includes(viewMode)) {
    propDiagnostics.propRequestMade = true;

    const hitterNeeded = viewMode === "props" || viewMode === "hitter_props";
    const pitcherNeeded = viewMode === "props" || viewMode === "pitcher_props";

    let hitterPropOdds = null;
    let pitcherPropOdds = null;

    if (hitterNeeded) {
      const hitterA = await fetchEventMarkets(event.id, apiKey, HITTER_PROP_MARKETS);
      const hitterB = await fetchEventMarkets(event.id, apiKey, ["batter_hits", "batter_total_bases", "batter_home_runs"]);
      const hitterC = await fetchEventMarkets(event.id, apiKey, ["batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis", "batter_stolen_bases"]);
      const hitterD = await fetchEventMarkets(event.id, apiKey, ["batter_walks", "batter_singles", "batter_doubles", "batter_triples"]);
      hitterPropOdds = mergeEventOddsObjects(mergeEventOddsObjects(mergeEventOddsObjects(hitterA, hitterB), hitterC), hitterD);
    }

    if (pitcherNeeded) {
      const pitcherA = await fetchEventMarkets(event.id, apiKey, PITCHER_PROP_MARKETS);
      const pitcherB = await fetchEventMarkets(event.id, apiKey, ["pitcher_strikeouts"]);
      const pitcherC = await fetchEventMarkets(event.id, apiKey, ["pitcher_outs"]);
      pitcherPropOdds = mergeEventOddsObjects(mergeEventOddsObjects(pitcherA, pitcherB), pitcherC);
    }

    propOdds = mergeEventOddsObjects(hitterPropOdds, pitcherPropOdds);

    const books = safeArray(propOdds && propOdds.bookmakers);
    propDiagnostics.propBookmakers = books.length;
    propDiagnostics.propMarketsReturned = Array.from(new Set(
      books.flatMap(b => safeArray(b.markets).map(m => m.key).filter(Boolean))
    ));
  }

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
    impliedRuns: null,
    propDiagnostics
  };

  baseContext.impliedRuns = estimateTeamImpliedRuns(baseContext);

  const propCandidates = buildPropCandidates(propOdds, baseContext);
  baseContext.propDiagnostics.propCandidateCount = propCandidates.length;

  const candidates = [
    ...generateFullGameCandidates(baseContext),
    ...generateF5Candidates(baseContext),
    ...propCandidates
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
      games: [],
      error: "Missing ODDS_API_KEY environment variable",
      mode: viewMode
    });
  }

  try {
    const [featuredOdds, scheduleGames] = await Promise.all([
      fetchFeaturedOdds(apiKey).catch(() => []),
      fetchScheduleWindow().catch(() => [])
    ]);

    const scheduleBasedEvents = safeArray(scheduleGames).map(g => {
      const oddsMatch = findOddsMatchForScheduleGame(g, featuredOdds);
      return oddsMatch || {
        id: `schedule-${normalizeName(g.away)}-at-${normalizeName(g.home)}-${g.commenceTime || ""}`,
        commence_time: g.commenceTime,
        away_team: g.away,
        home_team: g.home,
        bookmakers: []
      };
    });

    const uniqueMap = new Map();

    for (const e of safeArray(featuredOdds)) {
      uniqueMap.set(eventKeyFromTeams(e?.away_team, e?.home_team), e);
    }

    for (const e of safeArray(scheduleBasedEvents)) {
      const key = eventKeyFromTeams(e?.away_team, e?.home_team);
      if (!uniqueMap.has(key)) uniqueMap.set(key, e);
    }

    const events = Array.from(uniqueMap.values())
      .filter(e => e && e.away_team && e.home_team)
      .sort((a, b) => new Date(a.commence_time || 0).getTime() - new Date(b.commence_time || 0).getTime());

    const games = [];

    for (const event of events) {
      try {
        const context = await buildGameContext(event, apiKey, scheduleGames, viewMode);
        const rankedCandidates = rankCandidates(context.candidates, context);
        const filteredCandidates = filterCandidatesForView(rankedCandidates, viewMode);

        games.push(buildGameResponse({
          event,
          context,
          rankedCandidates,
          filteredCandidates,
          viewMode
        }));
      } catch (gameErr) {
        games.push(addConfidenceCompatibilityFields({
          id: event.id || `${normalizeName(event.away_team)}-at-${normalizeName(event.home_team)}`,
          eventId: event.id || `${normalizeName(event.away_team)}-at-${normalizeName(event.home_team)}`,
          rawCommenceTime: event.commence_time || null,
          time: formatEtDateTime(event.commence_time),
          away: event.away_team,
          home: event.home_team,
          viewMode,
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
          debug: { error: gameErr.message }
        }));
      }
    }

    const calibratedGames = calibrateResponseGames(games, viewMode);
    const counts = summarizeConfidenceCounts(calibratedGames);

    return res.status(200).json({
      games: calibratedGames,
      mode: viewMode,
      count: calibratedGames.length,
      playableCount: counts.playableCount,
      highCount: counts.highCount,
      mediumCount: counts.mediumCount,
      lowCount: counts.lowCount,
      passCount: counts.passCount,
      confidenceSummary: counts
    });
  } catch (err) {
    return res.status(500).json({
      games: [],
      error: "Dashboard build failed",
      details: err.message,
      mode: viewMode
    });
  }
};