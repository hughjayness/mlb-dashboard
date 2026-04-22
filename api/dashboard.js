// api/dashboard.js
// Full replacement V7: odds ingestion diagnostics + same-game scenario arbitration.
// Required Vercel env var: ODDS_API_KEY

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
const ALL_MARKETS = [...FEATURED_MARKETS, ...F5_MARKETS, ...PROP_MARKETS];

const BOOKMAKER_PREFERENCE = ["betmgm", "draftkings", "fanduel", "caesars", "betrivers", "fanatics", "espnbet", "ballybet"];

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

function safeArray(v) { return Array.isArray(v) ? v : []; }
function round2(v) { const n = Number(v); return Number.isFinite(n) ? Number(n.toFixed(2)) : 0; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function hasValue(v) { return v !== null && v !== undefined && v !== ""; }
function toPrice(v) { const n = Number(v); if (!Number.isFinite(n) || n === 0 || Math.abs(n) < 80) return null; return n; }
function toLine(v) { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return null; return n; }
function toPoint(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function formatPrice(v) { const n = toPrice(v); if (n === null) return "—"; return n > 0 ? `+${n}` : `${n}`; }
function formatPoint(v) { const n = Number(v); if (!Number.isFinite(n)) return "—"; return n > 0 ? `+${n}` : `${n}`; }
function americanToProb(price) { const p = toPrice(price); if (p === null) return null; return p > 0 ? 100 / (p + 100) : Math.abs(p) / (Math.abs(p) + 100); }
function probToAmerican(prob) { const p = Number(prob); if (!Number.isFinite(p) || p <= 0 || p >= 1) return null; return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p); }
function confidencePct(score) { return round2(clamp(45 + Number(score || 0) * 8, 1, 99)); }

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTeamName(name) {
  const aliases = {
    "ari diamondbacks": "arizona diamondbacks", "d backs": "arizona diamondbacks", "diamondbacks": "arizona diamondbacks",
    "oakland athletics": "athletics", "sacramento athletics": "athletics",
    "atl braves": "atlanta braves", "bal orioles": "baltimore orioles", "bos red sox": "boston red sox",
    "chi cubs": "chicago cubs", "chc": "chicago cubs", "chi white sox": "chicago white sox", "cws": "chicago white sox", "white sox": "chicago white sox",
    "cle guardians": "cleveland guardians", "guardians": "cleveland guardians", "col rockies": "colorado rockies", "det tigers": "detroit tigers",
    "hou astros": "houston astros", "kc royals": "kansas city royals", "kansas city": "kansas city royals",
    "la angels": "los angeles angels", "los angeles angels of anaheim": "los angeles angels", "la dodgers": "los angeles dodgers", "lad": "los angeles dodgers",
    "mia marlins": "miami marlins", "mil brewers": "milwaukee brewers", "min twins": "minnesota twins",
    "ny mets": "new york mets", "nym": "new york mets", "ny yankees": "new york yankees", "nyy": "new york yankees",
    "philadelphia": "philadelphia phillies", "phi phillies": "philadelphia phillies", "pit pirates": "pittsburgh pirates",
    "sd padres": "san diego padres", "sf giants": "san francisco giants", "sea mariners": "seattle mariners",
    "stl cardinals": "st louis cardinals", "tb rays": "tampa bay rays", "tex rangers": "texas rangers", "tor blue jays": "toronto blue jays", "wsh nationals": "washington nationals"
  };
  const n = normalizeName(name);
  return aliases[n] || n;
}

function eventKey(away, home) { return `${normalizeTeamName(away)}|${normalizeTeamName(home)}`; }
function getTeamContext(team) { return TEAM_CONTEXT[normalizeTeamName(team)] || { id: null, offense: 0, prevention: 0, bullpen: 0, park: 1.0 }; }

function addConfidenceFields(obj) {
  const confidence = obj.confidence === "High" || obj.confidence === "Medium" ? obj.confidence : "Low";
  const confidenceTier = confidence === "High" ? "high" : confidence === "Medium" ? "medium" : "low";
  const confidenceLabel = `${confidence} Confidence`;
  return { ...obj, confidence, confidenceTier, confidenceLabel, bestBetConfidence: confidenceLabel, confidenceDisplay: confidenceLabel };
}

function setConfidence(obj, confidence, reason) {
  const out = { ...obj, confidence };
  out.confidenceScore = confidence === "High" ? Math.max(Number(out.confidenceScore || 0), 72) : confidence === "Medium" ? Math.max(Number(out.confidenceScore || 0), 58) : Number(out.confidenceScore || 45);
  out.recommendedTiming = confidence === "High" ? "Bet sooner" : confidence === "Medium" ? "Monitor market" : "Pass / monitor";
  out.recommendedStakeUnits = confidence === "High" ? 1.0 : confidence === "Medium" ? 0.5 : 0;
  out.reasons = reason ? safeArray(out.reasons).concat([reason]) : safeArray(out.reasons);
  return addConfidenceFields(out);
}

function formatEtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

function getEtYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOddsList(apiKey, markets, diagnostics, label) {
  const marketText = encodeURIComponent(markets.join(","));
  const attempts = [
    { region: "us", url: `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "us2", url: `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us2&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "us,us2", url: `${ODDS_API_BASE}/sports/baseball_mlb/odds?regions=us,us2&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "all", url: `${ODDS_API_BASE}/sports/baseball_mlb/odds?oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` }
  ];

  let best = [];
  const diag = diagnostics || null;
  const tag = label || markets.join("+");

  if (diag) {
    diag.oddsRequests = diag.oddsRequests || [];
    diag.oddsApiErrors = diag.oddsApiErrors || [];
  }

  for (const attempt of attempts) {
    try {
      const data = await fetchJson(attempt.url, 22000);
      const count = Array.isArray(data) ? data.length : 0;
      if (diag) {
        diag.oddsRequests.push({ label: tag, markets: markets.join(","), region: attempt.region, ok: true, eventCount: count });
      }
      if (Array.isArray(data) && data.length > best.length) best = data;
      if (Array.isArray(data) && data.length > 0) break;
    } catch (err) {
      if (diag) {
        diag.oddsRequests.push({ label: tag, markets: markets.join(","), region: attempt.region, ok: false, error: String(err.message || err).slice(0, 300) });
        diag.oddsApiErrors.push({ label: tag, region: attempt.region, message: String(err.message || err).slice(0, 300) });
      }
    }
  }

  return best;
}

function mergeOddsEventLists(lists) {
  const map = new Map();

  for (const list of safeArray(lists)) {
    for (const event of safeArray(list)) {
      if (!event || !event.away_team || !event.home_team) continue;
      const key = event.id || eventKey(event.away_team, event.home_team);
      const existing = map.get(key);
      map.set(key, mergeEvents(existing, event));
    }
  }

  return Array.from(map.values());
}

async function fetchFeaturedOddsBundle(apiKey) {
  const diagnostics = {
    mode: "v6_odds_ingestion_diagnostics",
    oddsRequests: [],
    oddsApiErrors: [],
    featuredOddsCount: 0,
    h2hCount: 0,
    spreadsCount: 0,
    totalsCount: 0,
    combinedFeaturedCount: 0,
    mergedFeaturedCount: 0,
    matchedOddsEventCount: 0,
    scheduleOnlyFallbackCount: 0,
    marketBearingEventCount: 0
  };

  const [h2h, spreads, totals, combined] = await Promise.all([
    fetchOddsList(apiKey, ["h2h"], diagnostics, "h2h_only"),
    fetchOddsList(apiKey, ["spreads"], diagnostics, "spreads_only"),
    fetchOddsList(apiKey, ["totals"], diagnostics, "totals_only"),
    fetchOddsList(apiKey, FEATURED_MARKETS, diagnostics, "featured_combined")
  ]);

  diagnostics.h2hCount = safeArray(h2h).length;
  diagnostics.spreadsCount = safeArray(spreads).length;
  diagnostics.totalsCount = safeArray(totals).length;
  diagnostics.combinedFeaturedCount = safeArray(combined).length;

  const merged = mergeOddsEventLists([h2h, spreads, totals, combined]);
  diagnostics.featuredOddsCount = merged.length;
  diagnostics.mergedFeaturedCount = merged.length;
  diagnostics.marketBearingEventCount = merged.filter(e => safeArray(e.bookmakers).some(b => safeArray(b.markets).length)).length;

  return { events: merged, diagnostics };
}

async function fetchEventMarkets(eventId, apiKey, markets, diagnostics, label) {
  if (!eventId || String(eventId).startsWith("schedule-")) return null;
  const marketText = encodeURIComponent(markets.join(","));
  const attempts = [
    { region: "us", url: `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "us2", url: `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us2&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "us,us2", url: `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?regions=us,us2&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` },
    { region: "all", url: `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` }
  ];

  let merged = null;
  const diag = diagnostics || null;
  const tag = label || markets.join("+");

  for (const attempt of attempts) {
    try {
      const data = await fetchJson(attempt.url, 22000);
      const bookCount = data && typeof data === "object" ? safeArray(data.bookmakers).length : 0;
      if (diag) {
        diag.eventMarketRequests = diag.eventMarketRequests || [];
        diag.eventMarketRequests.push({ eventId, label: tag, markets: markets.join(","), region: attempt.region, ok: true, bookmakerCount: bookCount });
      }
      if (data && typeof data === "object") merged = mergeEvents(merged, data);
      if (bookCount > 0) break;
    } catch (err) {
      if (diag) {
        diag.eventMarketRequests = diag.eventMarketRequests || [];
        diag.oddsApiErrors = diag.oddsApiErrors || [];
        diag.eventMarketRequests.push({ eventId, label: tag, markets: markets.join(","), region: attempt.region, ok: false, error: String(err.message || err).slice(0, 300) });
        diag.oddsApiErrors.push({ label: `event_${tag}`, eventId, region: attempt.region, message: String(err.message || err).slice(0, 300) });
      }
    }
  }

  return merged;
}

function mergeEvents(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const map = new Map();
  for (const book of safeArray(a.bookmakers)) map.set(book.key || Math.random(), { ...book, markets: safeArray(book.markets) });
  for (const book of safeArray(b.bookmakers)) {
    const key = book.key || Math.random();
    const existing = map.get(key);
    if (!existing) map.set(key, { ...book, markets: safeArray(book.markets) });
    else {
      const mm = new Map();
      for (const m of safeArray(existing.markets)) mm.set(m.key || Math.random(), m);
      for (const m of safeArray(book.markets)) mm.set(m.key || Math.random(), m);
      map.set(key, { ...existing, ...book, markets: Array.from(mm.values()) });
    }
  }
  return { ...a, ...b, bookmakers: Array.from(map.values()) };
}

async function fetchScheduleWindow() {
  const startDate = getEtYmd();
  const endDate = addDaysYmd(startDate, 2);
  const url = `${MLB_SCHEDULE_BASE}?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=probablePitcher`;
  const json = await fetchJson(url, 15000);
  const out = [];
  for (const dateBlock of safeArray(json?.dates)) {
    for (const g of safeArray(dateBlock?.games)) {
      out.push({
        gamePk: g.gamePk || null,
        commenceTime: g.gameDate || null,
        away: String(g?.teams?.away?.team?.name || ""),
        home: String(g?.teams?.home?.team?.name || ""),
        awayProbablePitcher: String(g?.teams?.away?.probablePitcher?.fullName || "TBD"),
        homeProbablePitcher: String(g?.teams?.home?.probablePitcher?.fullName || "TBD"),
        awayProbablePitcherId: g?.teams?.away?.probablePitcher?.id || null,
        homeProbablePitcherId: g?.teams?.home?.probablePitcher?.id || null
      });
    }
  }
  return out;
}

function findScheduleMatch(event, scheduleGames) {
  const away = normalizeTeamName(event?.away_team);
  const home = normalizeTeamName(event?.home_team);
  const eventTime = event?.commence_time ? new Date(event.commence_time).getTime() : null;
  return safeArray(scheduleGames).find(g => {
    if (normalizeTeamName(g.away) !== away || normalizeTeamName(g.home) !== home) return false;
    if (!eventTime || !g.commenceTime) return true;
    return Math.abs(new Date(g.commenceTime).getTime() - eventTime) <= 8 * 60 * 60 * 1000;
  }) || null;
}

function findOddsMatchForScheduleGame(scheduleGame, oddsEvents) {
  const away = normalizeTeamName(scheduleGame?.away);
  const home = normalizeTeamName(scheduleGame?.home);
  const gameTime = scheduleGame?.commenceTime ? new Date(scheduleGame.commenceTime).getTime() : null;
  return safeArray(oddsEvents).find(e => {
    if (normalizeTeamName(e?.away_team) !== away || normalizeTeamName(e?.home_team) !== home) return false;
    if (!gameTime || !e?.commence_time) return true;
    return Math.abs(new Date(e.commence_time).getTime() - gameTime) <= 8 * 60 * 60 * 1000;
  }) || null;
}

function getMarket(event, key, preferredOnly = false) {
  const books = safeArray(event?.bookmakers);
  const ordered = [];
  for (const pref of BOOKMAKER_PREFERENCE) {
    const hit = books.find(b => b?.key === pref);
    if (hit) ordered.push(hit);
  }
  for (const b of books) if (!ordered.includes(b)) ordered.push(b);
  const searchBooks = preferredOnly ? ordered.slice(0, 1) : ordered;
  for (const b of searchBooks) {
    const m = safeArray(b?.markets).find(x => x?.key === key);
    if (m) return { market: m, bookKey: b.key || null };
  }
  return { market: null, bookKey: null };
}

function findOutcomeByTeam(market, team) {
  const target = normalizeTeamName(team);
  return safeArray(market?.outcomes).find(o => normalizeTeamName(o?.name) === target) || null;
}

function findOutcomeByName(market, name) {
  const target = normalizeName(name);
  return safeArray(market?.outcomes).find(o => normalizeName(o?.name) === target) || null;
}

function parseMoneyline(event, key, away, home) {
  const { market, bookKey } = getMarket(event, key, false);
  const awayO = findOutcomeByTeam(market, away);
  const homeO = findOutcomeByTeam(market, home);
  return { awayPrice: toPrice(awayO?.price), homePrice: toPrice(homeO?.price), bookKey };
}

function parseSpread(event, key, away, home) {
  const { market, bookKey } = getMarket(event, key, false);
  const awayO = findOutcomeByTeam(market, away);
  const homeO = findOutcomeByTeam(market, home);
  return { awayPoint: toPoint(awayO?.point), awayPrice: toPrice(awayO?.price), homePoint: toPoint(homeO?.point), homePrice: toPrice(homeO?.price), bookKey };
}

function parseTotal(event, key) {
  const { market, bookKey } = getMarket(event, key, false);
  const over = findOutcomeByName(market, "Over");
  const under = findOutcomeByName(market, "Under");
  return { line: toLine(over?.point) ?? toLine(under?.point), overPrice: toPrice(over?.price), underPrice: toPrice(under?.price), bookKey };
}

function marketAvailability(odds) {
  return {
    moneyline: odds.moneylineData.awayPrice != null || odds.moneylineData.homePrice != null,
    runLine: odds.spreadData.awayPoint != null || odds.spreadData.homePoint != null,
    total: odds.totalData.line != null,
    f5Moneyline: odds.f5MoneylineData.awayPrice != null || odds.f5MoneylineData.homePrice != null,
    f5RunLine: odds.f5RunLineData.awayPoint != null || odds.f5RunLineData.homePoint != null,
    f5Total: odds.f5TotalData.line != null
  };
}

function runEnv(totalLine) {
  if (totalLine === null || totalLine === undefined || totalLine === "") return { label: "neutral", score: 0, totalLine: null };
  const line = Number(totalLine);
  if (!Number.isFinite(line) || line <= 0) return { label: "neutral", score: 0, totalLine: null };
  if (line <= 7.5) return { label: "low_run", score: -0.30, totalLine: line };
  if (line >= 9.0) return { label: "high_run", score: 0.32, totalLine: line };
  if (line >= 8.5) return { label: "slightly_high_run", score: 0.16, totalLine: line };
  if (line <= 8.0) return { label: "slightly_low_run", score: -0.13, totalLine: line };
  return { label: "neutral", score: 0, totalLine: line };
}

function buildComponentScores(ctx) {
  const awayCtx = getTeamContext(ctx.awayTeam);
  const homeCtx = getTeamContext(ctx.homeTeam);
  const env = runEnv(ctx.totalData.line);
  const awayStarterKnown = ctx.probablePitchers.awayId ? 0.14 : normalizeName(ctx.probablePitchers.away) === "tbd" ? -0.04 : 0.08;
  const homeStarterKnown = ctx.probablePitchers.homeId ? 0.14 : normalizeName(ctx.probablePitchers.home) === "tbd" ? -0.04 : 0.08;
  return {
    side: {
      startingPitcher: round2((homeStarterKnown - awayStarterKnown) + (homeCtx.prevention - awayCtx.prevention) * 0.8),
      bullpen: round2((homeCtx.bullpen - awayCtx.bullpen) * 0.95),
      lineup: round2((homeCtx.offense - awayCtx.offense) * 1.05),
      offenseVsHand: round2((homeCtx.offense - awayCtx.offense) * 0.55)
    },
    total: {
      starters: round2(-1 * ((homeCtx.prevention + awayCtx.prevention) / 2) - ((homeStarterKnown + awayStarterKnown) * 0.10)),
      lineup: round2(((homeCtx.offense + awayCtx.offense) / 2) + env.score),
      parkFactor: round2((homeCtx.park - 1.0) * 1.6),
      bullpen: round2(-1 * ((homeCtx.bullpen + awayCtx.bullpen) / 2) * 0.5)
    },
    market: { runEnvironment: env.label, runEnvironmentScore: env.score, totalLine: env.totalLine, parkFactor: homeCtx.park },
    teamContext: { away: awayCtx, home: homeCtx },
    liveFeedStatus: {
      probablePitchers: ctx.probablePitchers.away !== "TBD" && ctx.probablePitchers.home !== "TBD" ? "live" : "partial",
      lineup: "projected",
      marketContext: "live",
      teamStrength: "static_proxy",
      parkFactor: "static_proxy"
    }
  };
}

function buildModelOutputs(ctx) {
  const s = ctx.componentScores.side;
  const t = ctx.componentScores.total;
  const sideComposite = round2(Number(s.startingPitcher || 0) + Number(s.bullpen || 0) + Number(s.lineup || 0) + Number(s.offenseVsHand || 0));
  const totalComposite = round2(Number(t.starters || 0) + Number(t.lineup || 0) + Number(t.parkFactor || 0) + Number(t.bullpen || 0));
  const homeWinProb = clamp(0.5 + sideComposite * 0.13, 0.34, 0.66);
  const awayWinProb = clamp(1 - homeWinProb, 0.34, 0.66);
  const marketHomeProb = americanToProb(ctx.moneylineData.homePrice);
  const marketAwayProb = americanToProb(ctx.moneylineData.awayPrice);
  const totalLine = ctx.totalData.line;
  const fairTotal = totalLine != null ? round2(totalLine + totalComposite * 1.15) : null;
  const overProb = totalLine != null && fairTotal != null ? clamp(0.5 + (fairTotal - totalLine) * 0.12, 0.32, 0.68) : null;
  const underProb = overProb != null ? clamp(1 - overProb, 0.32, 0.68) : null;
  const marketOverProb = americanToProb(ctx.totalData.overPrice);
  const marketUnderProb = americanToProb(ctx.totalData.underPrice);
  return {
    sideComposite, totalComposite,
    fairMlAway: probToAmerican(awayWinProb), fairMlHome: probToAmerican(homeWinProb), fairTotal,
    awayWinProb: round2(awayWinProb * 100), homeWinProb: round2(homeWinProb * 100),
    awayEdgePct: marketAwayProb != null ? round2((awayWinProb - marketAwayProb) * 100) : 0,
    homeEdgePct: marketHomeProb != null ? round2((homeWinProb - marketHomeProb) * 100) : 0,
    overEdgePct: marketOverProb != null && overProb != null ? round2((overProb - marketOverProb) * 100) : 0,
    underEdgePct: marketUnderProb != null && underProb != null ? round2((underProb - marketUnderProb) * 100) : 0,
    overConfidence: overProb != null ? round2(overProb * 100) : null,
    underConfidence: underProb != null ? round2(underProb * 100) : null
  };
}

function scoreCandidate(c, ctx) {
  const implied = americanToProb(c.oddsPrice);
  const edge = implied != null && c.fairProb != null ? round2((Number(c.fairProb) - implied) * 100) : Number(c.edgePct || 0);
  const edgeScore = Math.max(-2, edge * 0.22);
  const price = toPrice(c.oddsPrice);
  const priceBonus = price == null ? -2 : price >= -140 && price <= 180 ? 1.3 : price >= -175 && price <= 250 ? 0.7 : 0.2;
  const marketShape = getMarketShapeScore(c, ctx);
  const completeness = getCompleteness(c, ctx);
  const finalScore = round2(edgeScore + priceBonus + marketShape + completeness / 100);
  return addConfidenceFields({
    ...c,
    impliedProb: implied,
    edgePct: edge,
    valueScore: round2(edgeScore + priceBonus),
    contextScore: round2(marketShape),
    dataCompleteness: completeness,
    finalScore,
    confidenceScore: confidencePct(finalScore),
    confidence: "Low",
    recommendedTiming: "Pass / monitor",
    recommendedStakeUnits: 0,
    missedHighReasons: []
  });
}

function getMarketShapeScore(c, ctx) {
  const env = Math.abs(Number(ctx.componentScores.market.runEnvironmentScore || 0));
  const sideShape = Math.abs(Number(ctx.modelOutputs.sideComposite || 0));
  const totalShape = Math.abs(Number(ctx.modelOutputs.totalComposite || 0));
  if (c.marketFamily === "full" && c.market === "moneyline") return sideShape * 1.25;
  if (c.marketFamily === "full" && c.market === "runline") return sideShape * 0.95;
  if (c.marketFamily === "full" && c.market === "total") return totalShape * 1.25 + env;
  if (c.marketFamily === "f5" && c.market.includes("side")) return sideShape * 1.35;
  if (c.marketFamily === "f5" && c.market.includes("runline")) return sideShape * 1.05;
  if (c.marketFamily === "f5" && c.market.includes("total")) return totalShape * 1.30 + env;
  if (c.marketFamily === "prop" && c.propSubType === "hitter") return Math.abs(Number(c.contextTilt || 0)) * 1.3 + env * 0.7;
  if (c.marketFamily === "prop" && c.propSubType === "pitcher") return Math.abs(Number(c.contextTilt || 0)) * 1.15 + env * 0.6;
  return 0;
}

function getCompleteness(c, ctx) {
  let score = 0;
  score += ctx.componentScores.liveFeedStatus.probablePitchers === "live" ? 20 : 10;
  score += ctx.totalData.line != null ? 20 : 5;
  score += 20; // live market feed reached
  score += 15; // static team context
  score += 10; // static park context
  score += c.marketFamily === "prop" ? 10 : 5;
  return clamp(score, 0, 100);
}

function candidateKey(c) { return `${c.marketFamily}|${c.market}|${c.side}|${c.teamSide || ""}|${c.player || ""}|${c.bestBet}`; }

function candidateScript(c, ctx) {
  const script = {
    team: null,
    runEnv: null,
    pitcherTeam: null,
    pitcherSide: null,
    hitterSide: null,
    marketBucket: String(c?.market || ""),
    propSubType: c?.propSubType || null
  };

  if (["moneyline", "runline", "f5_moneyline", "f5_runline"].includes(c.market)) {
    script.team = c.teamSide || null;
  }

  if (["total", "f5_total"].includes(c.market)) {
    script.runEnv = c.side === "over" || c.side === "under" ? c.side : null;
  }

  if (c.propSubType === "hitter") {
    script.hitterSide = c.side;
    script.runEnv = c.side === "over" ? "over" : c.side === "under" ? "under" : null;
  }

  if (c.propSubType === "pitcher") {
    const p = normalizeName(c.player);
    const awayP = normalizeName(ctx.probablePitchers.away);
    const homeP = normalizeName(ctx.probablePitchers.home);
    script.pitcherTeam = p && p === awayP ? "away" : p && p === homeP ? "home" : null;
    script.pitcherSide = c.side;

    // Pitcher overs generally imply pitcher-friendly / run-suppression script.
    // Pitcher unders generally imply offense-friendly / run-creation script.
    if (c.side === "over") script.runEnv = "under";
    if (c.side === "under") script.runEnv = "over";
  }

  return script;
}

function oppositeTeam(side) {
  if (side === "away") return "home";
  if (side === "home") return "away";
  return null;
}

function supportWeight(c) {
  const raw = Number(c?.finalScore || 0);
  return clamp(raw > 0 ? raw : 0.25, 0.25, 7.5);
}

function buildSameGameScenario(candidates, ctx) {
  const sideSupport = { away: 0, home: 0 };
  const runSupport = { over: 0, under: 0 };
  const drivers = [];

  const sideComposite = Number(ctx?.modelOutputs?.sideComposite || 0);
  if (Math.abs(sideComposite) > 0) {
    const side = sideComposite >= 0 ? "home" : "away";
    const weight = Math.abs(sideComposite) * 1.4;
    sideSupport[side] += weight;
    drivers.push(`model side composite leans ${side} (${round2(weight)})`);
  }

  const totalComposite = Number(ctx?.modelOutputs?.totalComposite || 0);
  if (Math.abs(totalComposite) > 0) {
    const env = totalComposite >= 0 ? "over" : "under";
    const weight = Math.abs(totalComposite) * 1.2;
    runSupport[env] += weight;
    drivers.push(`model total composite leans ${env} (${round2(weight)})`);
  }

  const marketRun = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0);
  if (Math.abs(marketRun) > 0) {
    const env = marketRun >= 0 ? "over" : "under";
    const weight = Math.abs(marketRun) * 1.3;
    runSupport[env] += weight;
    drivers.push(`market run environment leans ${env} (${round2(weight)})`);
  }

  for (const c of safeArray(candidates)) {
    const s = candidateScript(c, ctx);
    const w = supportWeight(c);

    if (s.team) {
      const mult = c.marketFamily === "f5" ? 1.18 : 1.0;
      sideSupport[s.team] += w * mult;
      drivers.push(`${c.bestBet} supports ${s.team} side (${round2(w * mult)})`);
    }

    if (s.runEnv) {
      let mult = 1.0;
      if (c.market === "total" || c.market === "f5_total") mult = 1.18;
      if (c.propSubType === "hitter") mult = 0.78;
      if (c.propSubType === "pitcher") mult = c.market === "pitcher_outs" ? 0.88 : 0.72;
      runSupport[s.runEnv] += w * mult;
      drivers.push(`${c.bestBet} supports ${s.runEnv} run script (${round2(w * mult)})`);
    }

    if (s.pitcherTeam && s.pitcherSide === "over") {
      sideSupport[s.pitcherTeam] += w * 0.42;
      drivers.push(`${c.bestBet} supports ${s.pitcherTeam} starter-dominance script (${round2(w * 0.42)})`);
    }

    if (s.pitcherTeam && s.pitcherSide === "under") {
      const opp = oppositeTeam(s.pitcherTeam);
      if (opp) {
        sideSupport[opp] += w * 0.28;
        drivers.push(`${c.bestBet} supports ${opp} offense-vs-starter script (${round2(w * 0.28)})`);
      }
    }
  }

  const sideDiff = round2(sideSupport.home - sideSupport.away);
  const runDiff = round2(runSupport.over - runSupport.under);

  const sideLean = Math.abs(sideDiff) >= 0.35 ? (sideDiff > 0 ? "home" : "away") : "neutral";
  const runLean = Math.abs(runDiff) >= 0.35 ? (runDiff > 0 ? "over" : "under") : "neutral";

  return {
    mode: "same_game_scenario_arbitration",
    sideLean,
    runLean,
    sideSupport: { away: round2(sideSupport.away), home: round2(sideSupport.home), diffHomeMinusAway: sideDiff },
    runSupport: { over: round2(runSupport.over), under: round2(runSupport.under), diffOverMinusUnder: runDiff },
    drivers: drivers.slice(0, 16)
  };
}

function evaluateScenarioAlignment(candidate, scenario, ctx) {
  const script = candidateScript(candidate, ctx);
  let alignmentScore = 0;
  let hardConflict = false;
  let capConfidence = null;
  const notes = [];

  if (scenario.sideLean && scenario.sideLean !== "neutral") {
    if (script.team) {
      if (script.team === scenario.sideLean) {
        alignmentScore += 0.55;
        notes.push(`aligns with ${scenario.sideLean} side script`);
      } else {
        alignmentScore -= 0.95;
        hardConflict = true;
        capConfidence = "Low";
        notes.push(`conflicts with ${scenario.sideLean} side script`);
      }
    }

    if (script.pitcherTeam && script.pitcherSide === "over") {
      if (script.pitcherTeam === scenario.sideLean) {
        alignmentScore += 0.42;
        notes.push(`own starter over supports ${scenario.sideLean} side script`);
      } else {
        alignmentScore -= 0.85;
        hardConflict = true;
        capConfidence = "Low";
        notes.push(`opposing starter over conflicts with ${scenario.sideLean} side script`);
      }
    }

    if (script.pitcherTeam && script.pitcherSide === "under") {
      if (script.pitcherTeam !== scenario.sideLean) {
        alignmentScore += 0.38;
        notes.push(`opposing starter under supports ${scenario.sideLean} side script`);
      } else {
        alignmentScore -= 0.30;
        capConfidence = capConfidence || "Medium";
        notes.push(`own starter under weakens ${scenario.sideLean} side script`);
      }
    }
  }

  if (scenario.runLean && scenario.runLean !== "neutral") {
    if (script.runEnv) {
      if (script.runEnv === scenario.runLean) {
        alignmentScore += 0.55;
        notes.push(`aligns with ${scenario.runLean} run script`);
      } else {
        alignmentScore -= 0.80;
        notes.push(`conflicts with ${scenario.runLean} run script`);

        if (candidate.market === "total" || candidate.market === "f5_total") {
          hardConflict = true;
          capConfidence = "Low";
        } else if (candidate.propSubType === "hitter" && candidate.side === "over" && scenario.runLean === "under") {
          hardConflict = true;
          capConfidence = "Low";
        } else if (candidate.market === "pitcher_outs" && candidate.side === "over" && scenario.runLean === "over") {
          hardConflict = true;
          capConfidence = "Low";
        } else {
          capConfidence = capConfidence || "Medium";
        }
      }
    }

    if (scenario.runLean === "over" && candidate.propSubType === "hitter" && candidate.side === "over") {
      alignmentScore += 0.32;
      notes.push("hitter over supports game-over script");
    }

    if (scenario.runLean === "under" && candidate.propSubType === "pitcher" && candidate.side === "over") {
      alignmentScore += 0.32;
      notes.push("pitcher over supports game-under script");
    }

    if (scenario.runLean === "under" && candidate.propSubType === "hitter" && candidate.side === "over") {
      alignmentScore -= 0.65;
      hardConflict = true;
      capConfidence = "Low";
      notes.push("hitter over conflicts with game-under script");
    }

    if (scenario.runLean === "over" && candidate.market === "pitcher_outs" && candidate.side === "over") {
      alignmentScore -= 0.55;
      hardConflict = true;
      capConfidence = "Low";
      notes.push("pitcher outs over conflicts with game-over script");
    }
  }

  let status = "neutral";
  if (hardConflict) status = "hard_conflict";
  else if (alignmentScore >= 0.35) status = "aligned";
  else if (alignmentScore <= -0.35) status = "soft_conflict";

  return {
    script: candidateScript(candidate, ctx),
    scriptAlignmentScore: round2(alignmentScore),
    scriptAlignmentStatus: status,
    scriptHardConflict: hardConflict,
    scriptConfidenceCap: capConfidence,
    scriptNotes: notes
  };
}

function conflictReason(a, b, ctx) {
  const x = candidateScript(a, ctx);
  const y = candidateScript(b, ctx);
  if ((x.team && y.pitcherTeam && y.pitcherSide === "over" && x.team !== y.pitcherTeam) || (y.team && x.pitcherTeam && x.pitcherSide === "over" && y.team !== x.pitcherTeam)) return "Conflicts with opposing starter over prop.";
  if (x.runEnv && y.runEnv && x.runEnv !== y.runEnv) return "Conflicts with stronger same-game scoring script.";
  if (x.team && y.team && x.team !== y.team) return "Conflicts with stronger same-game side script.";
  return "Same-game script conflict.";
}

function rankCandidates(candidates, ctx) {
  const deduped = new Map();

  for (const c of safeArray(candidates)) {
    if (!c.bestBet || !hasValue(c.oddsPrice)) continue;
    const scored = scoreCandidate(c, ctx);
    const key = candidateKey(scored);
    const existing = deduped.get(key);
    if (!existing || Number(scored.finalScore || 0) > Number(existing.finalScore || 0)) deduped.set(key, scored);
  }

  const prelim = Array.from(deduped.values()).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
  const scenario = buildSameGameScenario(prelim, ctx);
  ctx.sameGameScenario = scenario;

  return prelim
    .map(c => {
      const alignment = evaluateScenarioAlignment(c, scenario, ctx);
      const adjustedScore = round2(Number(c.finalScore || 0) + Number(alignment.scriptAlignmentScore || 0) - (alignment.scriptHardConflict ? 0.85 : 0));
      return addConfidenceFields({
        ...c,
        ...alignment,
        preScriptScore: c.finalScore,
        finalScore: adjustedScore,
        conflictPenalty: alignment.scriptHardConflict ? 0.85 : alignment.scriptAlignmentStatus === "soft_conflict" ? 0.35 : 0,
        conflictReason: alignment.scriptNotes.join("; ") || "No material same-game script conflict.",
        confidenceScore: confidencePct(adjustedScore)
      });
    })
    .sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))
    .map((c, i) => addConfidenceFields({ ...c, slateRank: i + 1 }));
}

function candidateThresholds(c) {
  const isProp = c.marketFamily === "prop";
  const isHitter = isProp && c.propSubType === "hitter";
  const isPitcher = isProp && c.propSubType === "pitcher";
  const isF5 = c.marketFamily === "f5";
  const isFull = c.marketFamily === "full";

  let high = 2.75;
  let medium = 1.85;
  let minEdgeHigh = 1.25;
  let minEdgeMedium = -0.25;
  let minCompletenessHigh = 65;

  if (isFull && c.market === "moneyline") { high = 2.70; medium = 1.80; minEdgeHigh = 1.35; }
  if (isFull && c.market === "runline") { high = 2.95; medium = 2.05; minEdgeHigh = 1.50; }
  if (isFull && c.market === "total") { high = 2.75; medium = 1.90; minEdgeHigh = 1.25; }
  if (isF5 && c.market === "f5_moneyline") { high = 2.85; medium = 1.95; minEdgeHigh = 1.35; }
  if (isF5 && c.market === "f5_runline") { high = 3.05; medium = 2.10; minEdgeHigh = 1.50; }
  if (isF5 && c.market === "f5_total") { high = 2.90; medium = 1.95; minEdgeHigh = 1.30; }
  if (isHitter) { high = 3.05; medium = 2.10; minEdgeHigh = 1.10; minCompletenessHigh = 70; }
  if (isPitcher) { high = 2.95; medium = 2.00; minEdgeHigh = 1.10; minCompletenessHigh = 70; }

  if (c.scriptAlignmentStatus === "aligned") {
    high -= 0.18;
    medium -= 0.10;
  }

  if (c.scriptAlignmentStatus === "soft_conflict") {
    high += 0.45;
    medium += 0.25;
  }

  return { high: round2(high), medium: round2(medium), minEdgeHigh, minEdgeMedium, minCompletenessHigh };
}

function buildMissedHighReasons(c, thresholds) {
  const missed = [];
  if (!c || !c.bestBet || !hasValue(c.oddsPrice)) missed.push("missing playable market or odds price");
  if (c.scriptHardConflict || c.scriptConfidenceCap === "Low") missed.push("same-game script conflict capped at Low");
  if (Number(c.finalScore || 0) < thresholds.high) missed.push(`finalScore below High threshold (${c.finalScore} < ${thresholds.high})`);
  if (Number(c.edgePct || 0) < thresholds.minEdgeHigh) missed.push(`edge below High minimum (${c.edgePct} < ${thresholds.minEdgeHigh})`);
  if (Number(c.dataCompleteness || 0) < thresholds.minCompletenessHigh) missed.push(`dataCompleteness below High minimum (${c.dataCompleteness} < ${thresholds.minCompletenessHigh})`);
  return missed;
}

function assignBalancedConfidence(c) {
  if (!c || !c.bestBet || !hasValue(c.oddsPrice)) return "Low";
  if (c.scriptHardConflict || c.scriptConfidenceCap === "Low") return "Low";

  const t = candidateThresholds(c);
  const score = Number(c.finalScore || 0);
  const edge = Number(c.edgePct || 0);
  const completeness = Number(c.dataCompleteness || 0);

  if (score >= t.high && edge >= t.minEdgeHigh && completeness >= t.minCompletenessHigh) return "High";
  if (score >= t.medium && edge >= t.minEdgeMedium) return "Medium";
  return "Low";
}

function confidenceCalibrateCandidates(ranked, ctx) {
  // V7: same-game logic remains active, but High confidence is no longer guaranteed.
  // Candidates must clear score, edge, completeness, and script-alignment gates.
  const arr = safeArray(ranked).map(c => {
    const thresholds = candidateThresholds(c);
    const assigned = assignBalancedConfidence(c);
    const reason = assigned === "High"
      ? `V7 balanced calibration: candidate cleared High threshold ${thresholds.high}, edge minimum ${thresholds.minEdgeHigh}, and same-game script review.`
      : assigned === "Medium"
        ? `V7 balanced calibration: candidate cleared Medium threshold ${thresholds.medium} but did not clear all High gates.`
        : `V7 balanced calibration: candidate did not clear High/Medium gates or was capped by same-game script review.`;

    return setConfidence({
      ...c,
      highThreshold: thresholds.high,
      mediumThreshold: thresholds.medium,
      minEdgeHigh: thresholds.minEdgeHigh,
      minEdgeMedium: thresholds.minEdgeMedium,
      minCompletenessHigh: thresholds.minCompletenessHigh,
      missedHighReasons: buildMissedHighReasons(c, thresholds)
    }, assigned, reason);
  });

  return arr.map(addConfidenceFields).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
}

function bestPrice(current, next) {
  const a = toPrice(current);
  const b = toPrice(next);
  if (a === null) return b;
  if (b === null) return a;
  return b > a ? b : a;
}

function pushCandidate(out, c) {
  if (!c || !c.bestBet || !hasValue(c.oddsPrice)) return;
  out.push(c);
}

function generateFullGameCandidates(ctx) {
  const out = [];
  const ml = ctx.moneylineData, rl = ctx.spreadData, total = ctx.totalData, model = ctx.modelOutputs;
  if (ml.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.awayPrice, fairProb: Number(model.awayWinProb || 50) / 100, reasons: ["Away moneyline evaluated against market price and team context."] });
  if (ml.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.homePrice, fairProb: Number(model.homeWinProb || 50) / 100, reasons: ["Home moneyline evaluated against market price and team context."] });
  if (rl.awayPoint != null && rl.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ${formatPoint(rl.awayPoint)}`, bestBetType: "Run Line", oddsPrice: rl.awayPrice, fairProb: clamp(Number(model.awayWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Away run line evaluated from side strength and price."] });
  if (rl.homePoint != null && rl.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ${formatPoint(rl.homePoint)}`, bestBetType: "Run Line", oddsPrice: rl.homePrice, fairProb: clamp(Number(model.homeWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Home run line evaluated from side strength and price."] });
  if (total.line != null && total.overPrice != null && model.overConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "over", bestBet: `Over ${total.line}`, bestBetType: "Total", oddsPrice: total.overPrice, fairProb: Number(model.overConfidence || 50) / 100, reasons: ["Over evaluated against park, offense, starters, and market total."] });
  if (total.line != null && total.underPrice != null && model.underConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "under", bestBet: `Under ${total.line}`, bestBetType: "Total", oddsPrice: total.underPrice, fairProb: Number(model.underConfidence || 50) / 100, reasons: ["Under evaluated against park, offense, starters, and market total."] });
  return out;
}

function generateF5Candidates(ctx) {
  const out = [];
  const ml = ctx.f5MoneylineData, rl = ctx.f5RunLineData, total = ctx.f5TotalData, model = ctx.modelOutputs;
  const sideScore = Number(ctx.componentScores.side.startingPitcher || 0) + Number(ctx.componentScores.side.lineup || 0);
  const homeProb = clamp(0.5 + sideScore * 0.16, 0.34, 0.66);
  const awayProb = clamp(1 - homeProb, 0.34, 0.66);
  if (ml.awayPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_moneyline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} F5 ML`, bestBetType: "F5 Moneyline", oddsPrice: ml.awayPrice, fairProb: awayProb, reasons: ["Away F5 moneyline emphasizes starter and lineup edge."] });
  if (ml.homePrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_moneyline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} F5 ML`, bestBetType: "F5 Moneyline", oddsPrice: ml.homePrice, fairProb: homeProb, reasons: ["Home F5 moneyline emphasizes starter and lineup edge."] });
  if (rl.awayPoint != null && rl.awayPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_runline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} F5 ${formatPoint(rl.awayPoint)}`, bestBetType: "F5 Run Line", oddsPrice: rl.awayPrice, fairProb: clamp(awayProb + 0.025, 0.05, 0.95), reasons: ["Away F5 run line uses starter-weighted side strength."] });
  if (rl.homePoint != null && rl.homePrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_runline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} F5 ${formatPoint(rl.homePoint)}`, bestBetType: "F5 Run Line", oddsPrice: rl.homePrice, fairProb: clamp(homeProb + 0.025, 0.05, 0.95), reasons: ["Home F5 run line uses starter-weighted side strength."] });
  if (total.line != null && total.overPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_total", side: "over", bestBet: `F5 Over ${total.line}`, bestBetType: "F5 Total", oddsPrice: total.overPrice, fairProb: Number(model.overConfidence || 50) / 100, reasons: ["F5 over uses early-game environment and starter context."] });
  if (total.line != null && total.underPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_total", side: "under", bestBet: `F5 Under ${total.line}`, bestBetType: "F5 Total", oddsPrice: total.underPrice, fairProb: Number(model.underConfidence || 50) / 100, reasons: ["F5 under uses early-game environment and starter context."] });
  return out;
}

function propLabel(key) {
  return {
    batter_hits: "Hits", batter_total_bases: "Total Bases", batter_home_runs: "Home Runs", batter_rbis: "RBIs",
    batter_runs_scored: "Runs Scored", batter_hits_runs_rbis: "Hits + Runs + RBIs", batter_stolen_bases: "Stolen Bases",
    batter_walks: "Walks", batter_singles: "Singles", batter_doubles: "Doubles", batter_triples: "Triples",
    pitcher_strikeouts: "Pitcher Strikeouts", pitcher_outs: "Pitcher Outs"
  }[key] || key;
}

function propSide(outcome) {
  const txt = `${outcome?.name || ""} ${outcome?.description || ""}`.toLowerCase();
  if (/\bover\b/.test(txt)) return "over";
  if (/\bunder\b/.test(txt)) return "under";
  return null;
}

function propPlayer(outcome) {
  const desc = String(outcome?.description || "").trim();
  const name = String(outcome?.name || "").trim();
  if (desc && !/^over$/i.test(desc) && !/^under$/i.test(desc)) return desc;
  if (name && !/^over$/i.test(name) && !/^under$/i.test(name)) return name;
  return "";
}

function propTilt(marketKey, side, ctx) {
  const env = Number(ctx.componentScores.market.runEnvironmentScore || 0);
  const high = env > 0 ? env : 0;
  const low = env < 0 ? Math.abs(env) : 0;
  const base = marketKey === "pitcher_strikeouts" ? 0.12 : marketKey === "pitcher_outs" ? 0.10 : marketKey === "batter_total_bases" ? 0.14 : marketKey === "batter_home_runs" ? 0.09 : marketKey === "batter_hits_runs_rbis" ? 0.13 : 0.09;
  if (marketKey.startsWith("batter_")) return round2(side === "over" ? base + high * 0.20 - low * 0.05 : base * 0.65 + low * 0.16 - high * 0.05);
  if (marketKey.startsWith("pitcher_")) return round2(side === "over" ? base + low * 0.18 - high * 0.07 : base * 0.65 + high * 0.15 - low * 0.05);
  return base;
}

function buildPropCandidates(propOdds, ctx) {
  const map = new Map();
  for (const book of safeArray(propOdds?.bookmakers)) {
    for (const market of safeArray(book?.markets)) {
      const marketKey = String(market?.key || "");
      if (!PROP_MARKETS.includes(marketKey)) continue;
      for (const outcome of safeArray(market.outcomes)) {
        const player = propPlayer(outcome);
        const side = propSide(outcome);
        const point = toLine(outcome?.point);
        const price = toPrice(outcome?.price);
        if (!player || !side || point == null || price == null) continue;
        const key = `${normalizeName(player)}|${marketKey}|${point}`;
        const row = map.get(key) || { player, marketKey, point, overPrice: null, underPrice: null, overBook: null, underBook: null };
        if (side === "over" && bestPrice(row.overPrice, price) === price) { row.overPrice = price; row.overBook = book.key || null; }
        if (side === "under" && bestPrice(row.underPrice, price) === price) { row.underPrice = price; row.underBook = book.key || null; }
        map.set(key, row);
      }
    }
  }
  const out = [];
  for (const row of map.values()) {
    const label = propLabel(row.marketKey);
    const propSubType = row.marketKey.startsWith("pitcher_") ? "pitcher" : "hitter";
    for (const side of ["over", "under"]) {
      const price = side === "over" ? row.overPrice : row.underPrice;
      const bookKey = side === "over" ? row.overBook : row.underBook;
      if (price == null) continue;
      const implied = americanToProb(price) || 0.5;
      const tilt = propTilt(row.marketKey, side, ctx);
      const fairProb = clamp(implied + tilt * (side === "over" ? 0.28 : 0.22), 0.05, 0.95);
      out.push({
        marketFamily: "prop", propSubType, market: row.marketKey, player: row.player, side, bookKey,
        bestBet: `${row.player} ${label} ${side === "over" ? "Over" : "Under"} ${row.point}`,
        bestBetType: "Prop", oddsPrice: price, fairProb: round2(fairProb), contextTilt: tilt,
        modelProb: round2(fairProb), reasons: [`${label} ${side} evaluated across all available prop books.`]
      });
    }
  }
  return out;
}

function filterCandidatesForView(candidates, viewMode) {
  if (viewMode === "f5") return safeArray(candidates).filter(c => c.marketFamily === "f5");
  if (viewMode === "hitter_props") return safeArray(candidates).filter(c => c.marketFamily === "prop" && c.propSubType === "hitter");
  if (viewMode === "pitcher_props") return safeArray(candidates).filter(c => c.marketFamily === "prop" && c.propSubType === "pitcher");
  if (viewMode === "props") return safeArray(candidates).filter(c => c.marketFamily === "prop");
  return safeArray(candidates).filter(c => c.marketFamily === "full");
}

function chooseBest(filtered) { return safeArray(filtered).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))[0] || null; }

function topProp(ranked) {
  const p = safeArray(ranked).find(c => c.marketFamily === "prop");
  if (!p) return null;
  return { player: p.player, market: p.market, price: p.oddsPrice, modelProb: round2(Number(p.modelProb || p.fairProb || 0.5) * 100), reasons: safeArray(p.reasons) };
}

function confidenceMap(candidates, market) {
  const away = safeArray(candidates).find(c => c.market === market && c.side === "away");
  const home = safeArray(candidates).find(c => c.market === market && c.side === "home");
  return { away: away ? confidencePct(away.finalScore) : null, home: home ? confidencePct(home.finalScore) : null };
}

function totalConfidenceMap(candidates, market) {
  const over = safeArray(candidates).find(c => c.market === market && c.side === "over");
  const under = safeArray(candidates).find(c => c.market === market && c.side === "under");
  return { over: over ? confidencePct(over.finalScore) : null, under: under ? confidencePct(under.finalScore) : null };
}

function impliedRuns(ctx) {
  if (ctx.totalData.line === null || ctx.totalData.line === undefined || ctx.totalData.line === "") return { away: null, home: null, diffHomeMinusAway: 0 };
  const total = Number(ctx.totalData.line);
  if (!Number.isFinite(total) || total <= 0) return { away: null, home: null, diffHomeMinusAway: 0 };
  const homeProb = Number(ctx.modelOutputs.homeWinProb || 50) / 100;
  const diff = clamp((homeProb - 0.5) * 2.2, -0.85, 0.85);
  return { away: round2(total / 2 - diff / 2), home: round2(total / 2 + diff / 2), diffHomeMinusAway: round2(diff) };
}

function buildGameResponse(event, ctx, ranked, filtered, viewMode) {
  const best = chooseBest(filtered);
  const full = ranked.filter(c => c.marketFamily === "full");
  const f5 = ranked.filter(c => c.marketFamily === "f5");
  const prop = topProp(ranked);
  const away = event.away_team;
  const home = event.home_team;
  const id = event.id || `${normalizeName(away)}-at-${normalizeName(home)}`;

  const game = {
    id, eventId: id, rawCommenceTime: event.commence_time || null, time: formatEtDateTime(event.commence_time), away, home, viewMode,
    probablePitchers: ctx.probablePitchers,
    lineupMode: "projected",
    lineupSource: "Probable pitchers + static team context",

    moneyline: ctx.moneylineData.awayPrice != null || ctx.moneylineData.homePrice != null ? `${away} ${formatPrice(ctx.moneylineData.awayPrice)} | ${home} ${formatPrice(ctx.moneylineData.homePrice)}` : "N/A",
    runLine: ctx.spreadData.awayPoint != null || ctx.spreadData.homePoint != null ? `${away} ${formatPoint(ctx.spreadData.awayPoint)} (${formatPrice(ctx.spreadData.awayPrice)}) | ${home} ${formatPoint(ctx.spreadData.homePoint)} (${formatPrice(ctx.spreadData.homePrice)})` : "N/A",
    total: ctx.totalData.line != null ? `Over ${ctx.totalData.line} ${formatPrice(ctx.totalData.overPrice)} | Under ${ctx.totalData.line} ${formatPrice(ctx.totalData.underPrice)}` : "N/A",
    firstFiveMoneyline: ctx.f5MoneylineData.awayPrice != null || ctx.f5MoneylineData.homePrice != null ? `${away} ${formatPrice(ctx.f5MoneylineData.awayPrice)} | ${home} ${formatPrice(ctx.f5MoneylineData.homePrice)}` : "N/A",
    firstFiveRunLine: ctx.f5RunLineData.awayPoint != null || ctx.f5RunLineData.homePoint != null ? `${away} F5 ${formatPoint(ctx.f5RunLineData.awayPoint)} (${formatPrice(ctx.f5RunLineData.awayPrice)}) | ${home} F5 ${formatPoint(ctx.f5RunLineData.homePoint)} (${formatPrice(ctx.f5RunLineData.homePrice)})` : "N/A",
    firstFiveTotal: ctx.f5TotalData.line != null ? `Over ${ctx.f5TotalData.line} ${formatPrice(ctx.f5TotalData.overPrice)} | Under ${ctx.f5TotalData.line} ${formatPrice(ctx.f5TotalData.underPrice)}` : "N/A",

    bestBet: best ? best.bestBet : "Pass",
    bestBetType: best ? best.bestBetType : "Pass",
    bestBetOdds: best ? best.oddsPrice : null,
    confidence: best ? best.confidence : "Low",
    confidenceScore: best ? best.confidenceScore : 0,
    recommendedTiming: best ? best.recommendedTiming : "Monitor market",
    recommendedStakeUnits: best ? best.recommendedStakeUnits : 0,
    reasons: best ? safeArray(best.reasons) : [`No valid ${viewMode} market candidate was available for this game.`],

    fairMlAway: ctx.modelOutputs.fairMlAway,
    fairMlHome: ctx.modelOutputs.fairMlHome,
    fairTotal: ctx.modelOutputs.fairTotal,
    awayEdgePct: ctx.modelOutputs.awayEdgePct,
    homeEdgePct: ctx.modelOutputs.homeEdgePct,
    overEdgePct: ctx.modelOutputs.overEdgePct,
    underEdgePct: ctx.modelOutputs.underEdgePct,

    moneylineConfidence: confidenceMap(full, "moneyline"),
    totalConfidence: totalConfidenceMap(full, "total"),
    runLineConfidence: confidenceMap(full, "runline"),
    firstFiveMoneylineConfidence: confidenceMap(f5, "f5_moneyline"),
    firstFiveTotalConfidence: totalConfidenceMap(f5, "f5_total"),
    firstFiveRunLineConfidence: confidenceMap(f5, "f5_runline"),

    topPropOverall: prop,
    topPropOverallReason: prop ? `${prop.market} ranked highest among prop candidates.` : "No supported prop returned.",
    propStatus: prop ? "Top prop candidate returned." : "No supported prop returned for this game.",
    componentScores: ctx.componentScores,
    marketRunEnvironment: ctx.componentScores.market.runEnvironment,
    impliedRuns: ctx.impliedRuns,
    riskWarnings: [
      ...(ctx.componentScores.liveFeedStatus.probablePitchers !== "live" ? ["Probable pitcher feed is partial or unavailable."] : []),
      "Lineups are projected, not confirmed."
    ],
    parkFactor: ctx.componentScores.market.parkFactor,
    marketAvailability: ctx.marketAvailability,
    debug: {
      confidenceGuarantee: "Backend assigns High/Medium from ranked valid candidates after fake-zero guards. High is no longer purely threshold-based.",
      selectedBest: best ? {
        bestBet: best.bestBet, confidence: best.confidence, finalScore: best.finalScore, edgePct: best.edgePct,
        dataCompleteness: best.dataCompleteness, conflictPenalty: best.conflictPenalty, conflictReason: best.conflictReason
      } : null,
      propDiagnostics: ctx.propDiagnostics,
      sameGameScenario: ctx.sameGameScenario || null,
      topCandidates: ranked.slice(0, 14).map(c => ({
        bestBet: c.bestBet, bestBetType: c.bestBetType, marketFamily: c.marketFamily, propSubType: c.propSubType || null,
        oddsPrice: c.oddsPrice, edgePct: c.edgePct, finalScore: c.finalScore, confidence: c.confidence,
        conflictPenalty: c.conflictPenalty, conflictReason: c.conflictReason, slateRank: c.slateRank
      }))
    }
  };

  return addConfidenceFields(game);
}

function forceViewConfidence(games, viewMode) {
  // V7 final lock: do not force High confidence. Only enforce same-game caps and prevent High overload.
  const arr = safeArray(games);

  const playable = arr
    .filter(g => g && g.bestBet && g.bestBet !== "Pass" && g.bestBetType && g.bestBetType !== "Pass")
    .sort((a, b) => {
      const bc = Number(b.debug?.selectedBest?.finalScore ?? b.confidenceScore ?? 0);
      const ac = Number(a.debug?.selectedBest?.finalScore ?? a.confidenceScore ?? 0);
      if (bc !== ac) return bc - ac;
      return String(a.time || "").localeCompare(String(b.time || ""));
    });

  if (!playable.length) {
    return arr.map(g => addConfidenceFields({
      ...g,
      confidence: "Low",
      confidenceForceDebug: {
        forceRan: true,
        calibrationMode: "v7_balanced_confidence_no_forced_high",
        viewMode,
        playableRows: 0,
        reason: "No non-Pass bestBet rows existed for this view. This is candidate/prop parsing, not confidence gating."
      }
    }));
  }

  for (const g of playable) {
    if (g.debug?.selectedBest?.scriptHardConflict || g.debug?.selectedBest?.scriptConfidenceCap === "Low") {
      Object.assign(g, setConfidence(g, "Low", "V7 final check: hard same-game conflict remains capped at Low."));
    }
  }

  const highRows = playable
    .filter(g => g.confidence === "High")
    .sort((a, b) => Number(b.debug?.selectedBest?.finalScore ?? b.confidenceScore ?? 0) - Number(a.debug?.selectedBest?.finalScore ?? a.confidenceScore ?? 0));

  const maxHigh = Math.max(1, Math.floor(playable.length * 0.28));
  const demotedHigh = [];
  if (highRows.length > maxHigh) {
    for (const g of highRows.slice(maxHigh)) {
      demotedHigh.push(g.bestBet);
      Object.assign(g, setConfidence(
        g,
        "Medium",
        `V7 final check: demoted from High to Medium to prevent slate-level High overload. Max High for ${viewMode}: ${maxHigh}.`
      ));
    }
  }

  return arr.map(g => addConfidenceFields({
    ...g,
    confidenceForceDebug: {
      forceRan: true,
      calibrationMode: "v7_balanced_confidence_no_forced_high",
      viewMode,
      playableRows: playable.length,
      highRowsBeforeSlateCap: highRows.length,
      maxHighRowsAllowed: maxHigh,
      demotedHighBets: demotedHigh,
      reason: "V7 trusts candidate-level thresholds and same-game arbitration. It does not force a High row when no candidate earns one.",
      scenario: g.debug?.sameGameScenario || null
    }
  }));
}

function counts(games) {
  const out = { highCount: 0, mediumCount: 0, lowCount: 0, passCount: 0, playableCount: 0 };
  for (const g of safeArray(games)) {
    if (!g || !g.bestBet || g.bestBet === "Pass") { out.passCount += 1; continue; }
    out.playableCount += 1;
    if (g.confidence === "High") out.highCount += 1;
    else if (g.confidence === "Medium") out.mediumCount += 1;
    else out.lowCount += 1;
  }
  return out;
}

async function buildGameContext(event, apiKey, scheduleGames, viewMode, oddsDiagnostics) {
  const detailed = await fetchEventMarkets(event.id, apiKey, ALL_MARKETS, oddsDiagnostics, "event_all_markets");
  const merged = mergeEvents(event, detailed);
  const scheduleMatch = findScheduleMatch(event, scheduleGames);
  const away = event.away_team;
  const home = event.home_team;

  const ctx = {
    eventId: event.id,
    awayTeam: away,
    homeTeam: home,
    probablePitchers: {
      away: scheduleMatch?.awayProbablePitcher || "TBD",
      home: scheduleMatch?.homeProbablePitcher || "TBD",
      awayId: scheduleMatch?.awayProbablePitcherId || null,
      homeId: scheduleMatch?.homeProbablePitcherId || null,
      awayHand: null,
      homeHand: null
    },
    moneylineData: parseMoneyline(merged, "h2h", away, home),
    spreadData: parseSpread(merged, "spreads", away, home),
    totalData: parseTotal(merged, "totals"),
    f5MoneylineData: parseMoneyline(merged, "h2h_1st_5_innings", away, home),
    f5RunLineData: parseSpread(merged, "spreads_1st_5_innings", away, home),
    f5TotalData: parseTotal(merged, "totals_1st_5_innings"),
    propDiagnostics: {
      propRequestMade: ["props", "hitter_props", "pitcher_props"].includes(viewMode),
      propBookmakers: 0,
      propMarketsReturned: [],
      propCandidateCount: 0
    }
  };

  ctx.componentScores = buildComponentScores(ctx);
  ctx.modelOutputs = buildModelOutputs(ctx);
  ctx.impliedRuns = impliedRuns(ctx);
  ctx.marketAvailability = marketAvailability(ctx);

  const books = safeArray(merged?.bookmakers);
  const propMarketsReturned = Array.from(new Set(books.flatMap(b => safeArray(b.markets).map(m => m.key).filter(k => PROP_MARKETS.includes(k)))));
  ctx.propDiagnostics.propBookmakers = books.filter(b => safeArray(b.markets).some(m => PROP_MARKETS.includes(m.key))).length;
  ctx.propDiagnostics.propMarketsReturned = propMarketsReturned;

  const propCandidates = buildPropCandidates(merged, ctx);
  ctx.propDiagnostics.propCandidateCount = propCandidates.length;

  const candidates = [
    ...generateFullGameCandidates(ctx),
    ...generateF5Candidates(ctx),
    ...propCandidates
  ];

  const ranked = confidenceCalibrateCandidates(rankCandidates(candidates, ctx), ctx);
  const filtered = filterCandidatesForView(ranked, viewMode);
  return { ctx, ranked, filtered };
}

function validView(view) {
  return ["full", "f5", "props", "pitcher_props", "hitter_props"].includes(view) ? view : "full";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const viewMode = validView(String(req.query?.view || "full"));
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ games: [], error: "Missing ODDS_API_KEY environment variable", mode: viewMode });
  }

  try {
    const [oddsBundle, scheduleGames] = await Promise.all([
      fetchFeaturedOddsBundle(apiKey).catch(err => ({
        events: [],
        diagnostics: {
          mode: "v6_odds_ingestion_diagnostics",
          oddsRequests: [],
          oddsApiErrors: [{ label: "featured_bundle", message: String(err.message || err).slice(0, 300) }],
          featuredOddsCount: 0,
          h2hCount: 0,
          spreadsCount: 0,
          totalsCount: 0,
          combinedFeaturedCount: 0,
          mergedFeaturedCount: 0,
          matchedOddsEventCount: 0,
          scheduleOnlyFallbackCount: 0,
          marketBearingEventCount: 0
        }
      })),
      fetchScheduleWindow().catch(() => [])
    ]);

    const oddsEvents = safeArray(oddsBundle.events);
    const oddsDiagnostics = oddsBundle.diagnostics || { mode: "v6_odds_ingestion_diagnostics", oddsRequests: [], oddsApiErrors: [] };
    oddsDiagnostics.scheduleGameCount = safeArray(scheduleGames).length;

    const unique = new Map();
    for (const e of safeArray(oddsEvents)) if (e?.away_team && e?.home_team) unique.set(eventKey(e.away_team, e.home_team), e);
    for (const g of safeArray(scheduleGames)) {
      const match = findOddsMatchForScheduleGame(g, oddsEvents);
      if (match) oddsDiagnostics.matchedOddsEventCount = Number(oddsDiagnostics.matchedOddsEventCount || 0) + 1;
      const event = match || { id: `schedule-${normalizeName(g.away)}-at-${normalizeName(g.home)}-${g.commenceTime || ""}`, commence_time: g.commenceTime, away_team: g.away, home_team: g.home, bookmakers: [] };
      if (!match) oddsDiagnostics.scheduleOnlyFallbackCount = Number(oddsDiagnostics.scheduleOnlyFallbackCount || 0) + 1;
      if (event?.away_team && event?.home_team && !unique.has(eventKey(event.away_team, event.home_team))) unique.set(eventKey(event.away_team, event.home_team), event);
    }

    const events = Array.from(unique.values()).sort((a, b) => new Date(a.commence_time || 0).getTime() - new Date(b.commence_time || 0).getTime());
    const games = [];

    for (const event of events) {
      try {
        const built = await buildGameContext(event, apiKey, scheduleGames, viewMode, oddsDiagnostics);
        games.push(buildGameResponse(event, built.ctx, built.ranked, built.filtered, viewMode));
      } catch (err) {
        games.push(addConfidenceFields({
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
          reasons: [`Game build failed: ${err.message}`],
          moneyline: "N/A", runLine: "N/A", total: "N/A",
          firstFiveMoneyline: "N/A", firstFiveRunLine: "N/A", firstFiveTotal: "N/A",
          probablePitchers: { away: "TBD", home: "TBD" },
          lineupMode: "projected", lineupSource: "Fallback",
          riskWarnings: ["This game fell back due to a per-game processing error."],
          componentScores: null,
          debug: { error: err.message }
        }));
      }
    }

    const calibratedGames = forceViewConfidence(games, viewMode);
    const summary = counts(calibratedGames);

    return res.status(200).json({
      games: calibratedGames,
      mode: viewMode,
      count: calibratedGames.length,
      playableCount: summary.playableCount,
      highCount: summary.highCount,
      mediumCount: summary.mediumCount,
      lowCount: summary.lowCount,
      passCount: summary.passCount,
      confidenceSummary: summary,
      calibrationMode: "v7_balanced_confidence_no_forced_high",
      oddsDiagnostics
    });
  } catch (err) {
    return res.status(500).json({ games: [], error: "Dashboard build failed", details: err.message, mode: viewMode });
  }
};
