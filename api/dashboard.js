// api/dashboard.js
// Full replacement V12.4: Hitter-prop market funnel rebuild after long-shot leakage. Keeps V12.4 emergency pitcher/under/price controls.
// Required Vercel env var: ODDS_API_KEY

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const MLB_SCHEDULE_BASE = "https://statsapi.mlb.com/api/v1/schedule";

const DASHBOARD_MODEL_REVISION = {
  id: "v12-4-hitter-prop-market-funnel-2026-06-09",
  date: "2026-06-09",
  label: "V12.4 Hitter Prop Market Funnel: safe-market priority, long-shot caps, price discipline, and V12.4 emergency controls"
};

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

// V12.4: hitter props are now market-funneled before confidence.
// High Confidence should come from repeatable events first, not long-shot payout math.
const SAFE_HITTER_HIGH_MARKETS = new Set([
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
  "batter_singles",
  "batter_walks"
]);
const LONGSHOT_HITTER_MARKETS = new Set([
  "batter_home_runs",
  "batter_rbis",
  "batter_runs_scored",
  "batter_stolen_bases",
  "batter_doubles",
  "batter_triples"
]);
const HITTER_HIGH_PRICE_MIN = -175;
const HITTER_HIGH_PRICE_MAX = 150;
const HITTER_STRETCH_PRICE_MAX = 175;
const PITCHER_PROP_MARKETS = ["pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs"];
const PROP_MARKETS = [...HITTER_PROP_MARKETS, ...PITCHER_PROP_MARKETS];
const ALL_MARKETS = [...FEATURED_MARKETS, ...F5_MARKETS, ...PROP_MARKETS];

const PLAYABLE_BOOKMAKERS = ["betmgm", "draftkings", "fanduel"];
const BOOKMAKER_PREFERENCE = PLAYABLE_BOOKMAKERS.slice();
const PLAYABLE_BOOKMAKER_PARAM = PLAYABLE_BOOKMAKERS.join(",");

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

const STADIUM_CONTEXT = {
  "arizona diamondbacks": { lat: 33.4455, lon: -112.0667, roof: "retractable" },
  "athletics": { lat: 38.5802, lon: -121.5139, roof: "outdoor" },
  "atlanta braves": { lat: 33.8908, lon: -84.4677, roof: "outdoor" },
  "baltimore orioles": { lat: 39.2839, lon: -76.6217, roof: "outdoor" },
  "boston red sox": { lat: 42.3467, lon: -71.0972, roof: "outdoor" },
  "chicago cubs": { lat: 41.9484, lon: -87.6553, roof: "outdoor" },
  "chicago white sox": { lat: 41.8300, lon: -87.6339, roof: "outdoor" },
  "cincinnati reds": { lat: 39.0979, lon: -84.5082, roof: "outdoor" },
  "cleveland guardians": { lat: 41.4962, lon: -81.6852, roof: "outdoor" },
  "colorado rockies": { lat: 39.7561, lon: -104.9942, roof: "outdoor" },
  "detroit tigers": { lat: 42.3390, lon: -83.0485, roof: "outdoor" },
  "houston astros": { lat: 29.7573, lon: -95.3555, roof: "retractable" },
  "kansas city royals": { lat: 39.0517, lon: -94.4803, roof: "outdoor" },
  "los angeles angels": { lat: 33.8003, lon: -117.8827, roof: "outdoor" },
  "los angeles dodgers": { lat: 34.0739, lon: -118.2400, roof: "outdoor" },
  "miami marlins": { lat: 25.7781, lon: -80.2197, roof: "retractable" },
  "milwaukee brewers": { lat: 43.0280, lon: -87.9712, roof: "retractable" },
  "minnesota twins": { lat: 44.9817, lon: -93.2778, roof: "outdoor" },
  "new york mets": { lat: 40.7571, lon: -73.8458, roof: "outdoor" },
  "new york yankees": { lat: 40.8296, lon: -73.9262, roof: "outdoor" },
  "philadelphia phillies": { lat: 39.9061, lon: -75.1665, roof: "outdoor" },
  "pittsburgh pirates": { lat: 40.4469, lon: -80.0057, roof: "outdoor" },
  "san diego padres": { lat: 32.7073, lon: -117.1566, roof: "outdoor" },
  "san francisco giants": { lat: 37.7786, lon: -122.3893, roof: "outdoor" },
  "seattle mariners": { lat: 47.5914, lon: -122.3325, roof: "retractable" },
  "st louis cardinals": { lat: 38.6226, lon: -90.1928, roof: "outdoor" },
  "tampa bay rays": { lat: 27.7683, lon: -82.6534, roof: "indoor" },
  "texas rangers": { lat: 32.7473, lon: -97.0847, roof: "retractable" },
  "toronto blue jays": { lat: 43.6414, lon: -79.3894, roof: "retractable" },
  "washington nationals": { lat: 38.8730, lon: -77.0074, roof: "outdoor" }
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
function getStadiumContext(team) { return STADIUM_CONTEXT[normalizeTeamName(team)] || { lat: null, lon: null, roof: "unknown" }; }
function seasonYearFromIso(iso) { try { return Number(new Date(iso || Date.now()).toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric" })); } catch (_) { return Number(new Date().getUTCFullYear()); } }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function haversineMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function sum(arr) { return safeArray(arr).map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0); }
function inningsToOuts(ip) {
  if (!hasValue(ip)) return 0;
  const parts = String(ip).split(".");
  return (Number(parts[0] || 0) * 3) + Number(parts[1] || 0);
}

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
    { region: "bookmakers:betmgm,draftkings,fanduel", url: `${ODDS_API_BASE}/sports/baseball_mlb/odds?bookmakers=${encodeURIComponent(PLAYABLE_BOOKMAKER_PARAM)}&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` }
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
    mode: "v8_odds_ingestion_diagnostics",
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
    { region: "bookmakers:betmgm,draftkings,fanduel", url: `${ODDS_API_BASE}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds?bookmakers=${encodeURIComponent(PLAYABLE_BOOKMAKER_PARAM)}&oddsFormat=american&dateFormat=iso&markets=${marketText}&apiKey=${encodeURIComponent(apiKey)}` }
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
  for (const book of safeArray(a.bookmakers)) {
    if (book?.key && !PLAYABLE_BOOKMAKERS.includes(book.key)) continue;
    map.set(book.key || Math.random(), { ...book, markets: safeArray(book.markets) });
  }
  for (const book of safeArray(b.bookmakers)) {
    if (book?.key && !PLAYABLE_BOOKMAKERS.includes(book.key)) continue;
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

async function fetchRecentLeagueScheduleWindow() {
  const endDate = addDaysYmd(getEtYmd(), -1);
  const startDate = addDaysYmd(endDate, -6);
  const url = `${MLB_SCHEDULE_BASE}?sportId=1&startDate=${startDate}&endDate=${endDate}`;
  const json = await fetchJson(url, 18000);
  const out = [];
  for (const dateBlock of safeArray(json?.dates)) {
    for (const g of safeArray(dateBlock?.games)) {
      const detailed = String(g?.status?.detailedState || "");
      const isFinal = /final|completed early|game over/i.test(detailed);
      if (!isFinal) continue;
      out.push({
        gamePk: g.gamePk || null,
        commenceTime: g.gameDate || null,
        away: String(g?.teams?.away?.team?.name || ""),
        home: String(g?.teams?.home?.team?.name || ""),
        awayScore: Number(g?.teams?.away?.score || 0),
        homeScore: Number(g?.teams?.home?.score || 0)
      });
    }
  }
  return out;
}

function buildRecentLeagueContext(recentGames) {
  const map = {};
  const sorted = safeArray(recentGames).slice().sort((a, b) => new Date(a.commenceTime || 0).getTime() - new Date(b.commenceTime || 0).getTime());
  for (const g of sorted) {
    const rows = [
      { team: g.away, opp: g.home, runsFor: g.awayScore, runsAgainst: g.homeScore, venueHost: g.home, time: g.commenceTime },
      { team: g.home, opp: g.away, runsFor: g.homeScore, runsAgainst: g.awayScore, venueHost: g.home, time: g.commenceTime }
    ];
    for (const r of rows) {
      const key = normalizeTeamName(r.team);
      if (!map[key]) map[key] = { games: [], lastGameTime: null, lastVenueHost: null };
      map[key].games.push(r);
      map[key].lastGameTime = r.time;
      map[key].lastVenueHost = r.venueHost;
    }
  }
  const out = {};
  for (const [team, info] of Object.entries(map)) {
    const games = info.games.slice(-7);
    const last3 = games.slice(-3);
    const runsFor = sum(games.map(g => g.runsFor));
    const runsAgainst = sum(games.map(g => g.runsAgainst));
    const wins = games.filter(g => g.runsFor > g.runsAgainst).length;
    const losses = games.filter(g => g.runsFor < g.runsAgainst).length;
    const rpg = games.length ? runsFor / games.length : null;
    const rapg = games.length ? runsAgainst / games.length : null;
    const recentOffenseScore = rpg == null ? 0 : clamp((rpg - 4.4) * 0.16, -0.6, 0.6);
    const recentPreventionScore = rapg == null ? 0 : clamp((4.4 - rapg) * 0.16, -0.6, 0.6);
    const last3Games = last3.length;
    const bullpenFreshnessScore = clamp(0.18 - Math.max(0, last3Games - 1) * 0.12, -0.35, 0.22);
    out[team] = {
      gamesLast7: games.length,
      winsLast7: wins,
      lossesLast7: losses,
      runsPerGameLast7: rpg != null ? round2(rpg) : null,
      runsAllowedPerGameLast7: rapg != null ? round2(rapg) : null,
      recentOffenseScore: round2(recentOffenseScore),
      recentPreventionScore: round2(recentPreventionScore),
      bullpenFreshnessScore: round2(bullpenFreshnessScore),
      lastGameTime: info.lastGameTime,
      lastVenueHost: info.lastVenueHost,
      gamesLast3: last3Games
    };
  }
  return out;
}

function buildTravelRestContext(team, currentHomeTeam, currentCommenceTime, recentLeagueContext) {
  const recent = recentLeagueContext?.[normalizeTeamName(team)] || null;
  const currentVenue = getStadiumContext(currentHomeTeam);
  if (!recent) {
    return { restDays: null, travelMiles: null, travelScore: 0, restScore: 0, gamesLast3: 0 };
  }
  let restDays = null;
  if (recent.lastGameTime && currentCommenceTime) {
    restDays = Math.floor((new Date(currentCommenceTime).getTime() - new Date(recent.lastGameTime).getTime()) / 86400000);
    if (!Number.isFinite(restDays)) restDays = null;
  }
  const lastVenue = getStadiumContext(recent.lastVenueHost || team);
  const travelMiles = haversineMiles(lastVenue.lat, lastVenue.lon, currentVenue.lat, currentVenue.lon);
  const travelPenalty = travelMiles == null ? 0 : clamp(travelMiles / 1800, 0, 1.2) * -0.16;
  const restScore = restDays == null ? 0 : clamp((restDays - 1) * 0.08, -0.12, 0.18);
  return {
    restDays,
    travelMiles: travelMiles != null ? round2(travelMiles) : null,
    travelScore: round2(travelPenalty),
    restScore: round2(restScore),
    gamesLast3: recent.gamesLast3 || 0
  };
}
function pickPitchingStatValue(stat, keys) {
  for (const key of keys) {
    if (hasValue(stat?.[key])) return stat[key];
  }
  return null;
}

function summarizePitcherGameLog(json) {
  const splits = safeArray(json?.stats?.[0]?.splits || json?.people?.[0]?.stats?.[0]?.splits || []);
  const games = splits.map(s => s?.stat || {}).filter(Boolean);
  const recent = games.slice(0, 3);
  const bucket = arr => {
    const outs = sum(arr.map(g => inningsToOuts(g.inningsPitched)));
    const ip = outs / 3;
    const so = sum(arr.map(g => toNum(pickPitchingStatValue(g, ["strikeOuts", "strikeouts"]))));
    const bb = sum(arr.map(g => toNum(pickPitchingStatValue(g, ["baseOnBalls", "walks"]))));
    const er = sum(arr.map(g => toNum(pickPitchingStatValue(g, ["earnedRuns"]))));
    const hits = sum(arr.map(g => toNum(pickPitchingStatValue(g, ["hits"]))));
    const whip = ip > 0 ? (hits + bb) / ip : null;
    const era = ip > 0 ? (er * 9) / ip : null;
    const k9 = ip > 0 ? (so * 9) / ip : null;
    const bb9 = ip > 0 ? (bb * 9) / ip : null;
    const avgOuts = arr.length ? outs / arr.length : null;
    return {
      games: arr.length,
      innings: round2(ip),
      era: era != null ? round2(era) : null,
      whip: whip != null ? round2(whip) : null,
      strikeouts: so,
      walks: bb,
      earnedRuns: er,
      hits,
      k9: k9 != null ? round2(k9) : null,
      bb9: bb9 != null ? round2(bb9) : null,
      avgOuts: avgOuts != null ? round2(avgOuts) : null
    };
  };
  return { recent: bucket(recent), season: bucket(games) };
}

function pitcherQualityScore(summary) {
  const src = summary?.recent?.games ? summary.recent : summary?.season;
  if (!src || !src.games) return 0;
  let score = 0;
  if (src.era != null) score += clamp((4.1 - src.era) * 0.12, -0.55, 0.55);
  if (src.whip != null) score += clamp((1.28 - src.whip) * 0.45, -0.45, 0.45);
  if (src.k9 != null) score += clamp((src.k9 - 8.6) * 0.05, -0.35, 0.35);
  if (src.bb9 != null) score += clamp((3.1 - src.bb9) * 0.05, -0.25, 0.25);
  if (src.avgOuts != null) score += clamp((src.avgOuts - 15.5) * 0.035, -0.25, 0.25);
  return round2(score);
}

async function fetchPitcherRecentSummary(playerId, season, cache) {
  if (!playerId) return null;
  const key = `${playerId}|${season}`;
  if (cache && cache.has(key)) return cache.get(key);
  const url = `https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=pitching&season=${encodeURIComponent(season)}`;
  try {
    const json = await fetchJson(url, 16000);
    const summary = summarizePitcherGameLog(json);
    if (cache) cache.set(key, summary);
    return summary;
  } catch (_) {
    if (cache) cache.set(key, null);
    return null;
  }
}


function parseDecimalStat(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/^\./, "0."));
  return Number.isFinite(n) ? n : null;
}

function extractSeasonHittingStat(person) {
  const stats = safeArray(person?.stats);
  for (const bucket of stats) {
    for (const split of safeArray(bucket?.splits)) {
      if (split?.stat) return split.stat;
    }
  }
  return null;
}

function summarizeHitterSeason(stat) {
  if (!stat) return null;
  const avg = parseDecimalStat(stat.avg);
  const obp = parseDecimalStat(stat.obp);
  const slg = parseDecimalStat(stat.slg);
  const ops = parseDecimalStat(stat.ops);
  const atBats = toNum(stat.atBats);
  const plateAppearances = toNum(stat.plateAppearances || stat.atBats);
  const homeRuns = toNum(stat.homeRuns);
  const hits = toNum(stat.hits);
  const doubles = toNum(stat.doubles);
  const triples = toNum(stat.triples);
  const walks = toNum(stat.baseOnBalls || stat.walks);
  return {
    avg, obp, slg, ops, atBats, plateAppearances, homeRuns, hits, doubles, triples, walks,
    hrRate: plateAppearances > 0 ? round2(homeRuns / plateAppearances) : null,
    hitRate: atBats > 0 ? round2(hits / atBats) : avg,
    xbhRate: atBats > 0 ? round2((doubles + triples + homeRuns) / atBats) : null
  };
}

function scoreHitterSeason(stats, lineupSpot) {
  if (!stats) return { total: -0.35, contact: -0.20, power: -0.20, plateSkill: -0.20, samplePenalty: 0.25 };
  let contact = 0;
  let power = 0;
  let plate = 0;
  let samplePenalty = 0;
  if (stats.avg != null) contact += clamp((stats.avg - 0.245) * 4.0, -0.55, 0.70);
  if (stats.obp != null) { contact += clamp((stats.obp - 0.315) * 2.2, -0.35, 0.45); plate += clamp((stats.obp - 0.315) * 2.4, -0.35, 0.55); }
  if (stats.slg != null) power += clamp((stats.slg - 0.405) * 2.8, -0.65, 0.85);
  if (stats.ops != null) { contact += clamp((stats.ops - 0.720) * 0.75, -0.35, 0.45); power += clamp((stats.ops - 0.720) * 0.85, -0.35, 0.55); }
  if (stats.hrRate != null) power += clamp((stats.hrRate - 0.030) * 7.0, -0.20, 0.35);
  if (stats.xbhRate != null) power += clamp((stats.xbhRate - 0.080) * 3.0, -0.20, 0.35);
  if (stats.plateAppearances && stats.plateAppearances < 80) samplePenalty += 0.22;
  else if (stats.plateAppearances && stats.plateAppearances < 160) samplePenalty += 0.10;
  const lineup = lineupSpot == null ? -0.12 : lineupSpot <= 2 ? 0.36 : lineupSpot <= 4 ? 0.30 : lineupSpot <= 5 ? 0.20 : lineupSpot <= 6 ? 0.06 : lineupSpot <= 7 ? -0.10 : -0.28;
  const total = round2(contact * 0.45 + power * 0.40 + plate * 0.18 + lineup - samplePenalty);
  return { total, contact: round2(contact), power: round2(power), plateSkill: round2(plate), lineup: round2(lineup), samplePenalty: round2(samplePenalty) };
}

async function fetchHitterSeasonStats(playerIds, season, cache) {
  const ids = safeArray(playerIds).map(Number).filter(Number.isFinite);
  const out = {};
  const missing = [];
  for (const id of ids) {
    const key = `hit|${id}|${season}`;
    if (cache && cache.has(key)) out[id] = cache.get(key);
    else missing.push(id);
  }
  if (!missing.length) return out;
  const hydrate = encodeURIComponent(`stats(group=[hitting],type=[season],season=${season})`);
  const url = `https://statsapi.mlb.com/api/v1/people?personIds=${encodeURIComponent(missing.join(","))}&hydrate=${hydrate}`;
  try {
    const json = await fetchJson(url, 18000);
    for (const person of safeArray(json?.people)) {
      const id = Number(person?.id);
      const stat = summarizeHitterSeason(extractSeasonHittingStat(person));
      const key = `hit|${id}|${season}`;
      if (cache) cache.set(key, stat);
      out[id] = stat;
    }
  } catch (_) {
    for (const id of missing) {
      const key = `hit|${id}|${season}`;
      if (cache) cache.set(key, null);
      out[id] = null;
    }
  }
  return out;
}

async function fetchGameLineupContext(gamePk, season, cache) {
  if (!gamePk) return { lineupStatus: "missing", byName: {}, byId: {}, notes: ["No MLB gamePk available for lineup/player quality lookup."] };
  const key = `lineup|${gamePk}|${season}`;
  if (cache && cache.has(key)) return cache.get(key);
  try {
    const url = `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
    const json = await fetchJson(url, 18000);
    const teams = json?.liveData?.boxscore?.teams || {};
    const rows = [];
    for (const side of ["away", "home"]) {
      const t = teams?.[side] || {};
      const order = safeArray(t.battingOrder).map(Number).filter(Number.isFinite);
      const players = t.players || {};
      const ids = order.length ? order : Object.keys(players).map(k => Number(String(k).replace(/^ID/, ""))).filter(Number.isFinite).slice(0, 13);
      ids.forEach((id, idx) => {
        const rec = players[`ID${id}`] || {};
        const fullName = rec?.person?.fullName || rec?.person?.boxscoreName || "";
        if (!fullName) return;
        rows.push({ id, name: fullName, side, lineupSpot: order.length ? idx + 1 : null, position: rec?.position?.abbreviation || null });
      });
    }
    const statsById = await fetchHitterSeasonStats(rows.map(r => r.id), season, cache);
    const byName = {};
    const byId = {};
    for (const r of rows) {
      const stats = statsById[r.id] || null;
      const quality = scoreHitterSeason(stats, r.lineupSpot);
      const info = { ...r, normalizedName: normalizeName(r.name), stats, qualityScore: quality.total, qualityBreakdown: quality };
      byName[normalizeName(r.name)] = info;
      byId[r.id] = info;
    }
    const lineupStatus = rows.some(r => r.lineupSpot != null) ? "confirmed_or_live" : "roster_only";
    const result = { lineupStatus, byName, byId, playerCount: rows.length, notes: [`Hitter context ${lineupStatus}; ${rows.length} player records loaded.`] };
    if (cache) cache.set(key, result);
    return result;
  } catch (err) {
    const result = { lineupStatus: "missing", byName: {}, byId: {}, playerCount: 0, notes: [`Lineup/player quality lookup failed: ${String(err.message || err).slice(0, 140)}`] };
    if (cache) cache.set(key, result);
    return result;
  }
}

async function fetchWeatherContext(homeTeam, commenceTime, cache) {
  const key = `${normalizeTeamName(homeTeam)}|${String(commenceTime || "").slice(0, 13)}`;
  if (cache && cache.has(key)) return cache.get(key);
  const stadium = getStadiumContext(homeTeam);
  if (!Number.isFinite(stadium.lat) || !Number.isFinite(stadium.lon)) {
    const neutral = { roof: stadium.roof || "unknown", tempF: null, windMph: null, precipProb: null, weatherScore: 0, summary: "weather unavailable" };
    if (cache) cache.set(key, neutral);
    return neutral;
  }
  if (stadium.roof === "indoor" || stadium.roof === "retractable") {
    const indoor = { roof: stadium.roof, tempF: null, windMph: 0, precipProb: 0, weatherScore: 0, summary: `${stadium.roof} roof neutralizes most weather impact` };
    if (cache) cache.set(key, indoor);
    return indoor;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=3&timezone=America%2FNew_York`;
  try {
    const json = await fetchJson(url, 12000);
    const hours = safeArray(json?.hourly?.time);
    const localHour = String(commenceTime || "").replace("Z", "").slice(0, 13);
    const idx = hours.findIndex(t => String(t || "").slice(0, 13) === localHour);
    const use = idx >= 0 ? idx : 0;
    const tempF = toNum(json?.hourly?.temperature_2m?.[use]);
    const windMph = toNum(json?.hourly?.wind_speed_10m?.[use]);
    const precipProb = toNum(json?.hourly?.precipitation_probability?.[use]);
    let weatherScore = 0;
    weatherScore += clamp((tempF - 72) * 0.006, -0.15, 0.16);
    weatherScore -= clamp((precipProb - 25) * 0.002, 0, 0.12);
    const out = { roof: stadium.roof, tempF: round2(tempF), windMph: round2(windMph), precipProb: round2(precipProb), weatherScore: round2(weatherScore), summary: `temp ${round2(tempF)}F, wind ${round2(windMph)} mph, precip ${round2(precipProb)}%` };
    if (cache) cache.set(key, out);
    return out;
  } catch (_) {
    const neutral = { roof: stadium.roof, tempF: null, windMph: null, precipProb: null, weatherScore: 0, summary: "weather unavailable" };
    if (cache) cache.set(key, neutral);
    return neutral;
  }
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
  const books = safeArray(event?.bookmakers).filter(b => !b?.key || PLAYABLE_BOOKMAKERS.includes(b.key));
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
  const awayStarterKnown = ctx.probablePitchers.awayId ? 0.12 : normalizeName(ctx.probablePitchers.away) === "tbd" ? -0.04 : 0.06;
  const homeStarterKnown = ctx.probablePitchers.homeId ? 0.12 : normalizeName(ctx.probablePitchers.home) === "tbd" ? -0.04 : 0.06;
  const awayPitcherScore = Number(ctx.realWorld?.pitchers?.away?.qualityScore || 0);
  const homePitcherScore = Number(ctx.realWorld?.pitchers?.home?.qualityScore || 0);
  const awayRecentOffense = Number(ctx.realWorld?.teams?.away?.recentOffenseScore || 0);
  const homeRecentOffense = Number(ctx.realWorld?.teams?.home?.recentOffenseScore || 0);
  const awayRecentPrevention = Number(ctx.realWorld?.teams?.away?.recentPreventionScore || 0);
  const homeRecentPrevention = Number(ctx.realWorld?.teams?.home?.recentPreventionScore || 0);
  const awayBullpenFresh = Number(ctx.realWorld?.teams?.away?.bullpenFreshnessScore || 0);
  const homeBullpenFresh = Number(ctx.realWorld?.teams?.home?.bullpenFreshnessScore || 0);
  const awayTravelScore = Number(ctx.realWorld?.travel?.away?.travelScore || 0) + Number(ctx.realWorld?.travel?.away?.restScore || 0);
  const homeTravelScore = Number(ctx.realWorld?.travel?.home?.travelScore || 0) + Number(ctx.realWorld?.travel?.home?.restScore || 0);
  const weatherScore = Number(ctx.realWorld?.weather?.weatherScore || 0);
  return {
    side: {
      startingPitcher: round2((homeStarterKnown + homePitcherScore + homeRecentPrevention * 0.45) - (awayStarterKnown + awayPitcherScore + awayRecentPrevention * 0.45)),
      bullpen: round2(((homeCtx.bullpen + homeBullpenFresh) - (awayCtx.bullpen + awayBullpenFresh)) * 0.95),
      lineup: round2(((homeCtx.offense + homeRecentOffense) - (awayCtx.offense + awayRecentOffense)) * 1.05),
      offenseVsHand: round2(((homeCtx.offense * 0.65 + homeRecentOffense * 0.35) - (awayCtx.offense * 0.65 + awayRecentOffense * 0.35)) * 0.7),
      travelRest: round2(homeTravelScore - awayTravelScore)
    },
    total: {
      starters: round2(-1 * ((homeCtx.prevention + awayCtx.prevention) / 2) - ((homePitcherScore + awayPitcherScore) * 0.55) - ((homeStarterKnown + awayStarterKnown) * 0.08)),
      lineup: round2(((homeCtx.offense + awayCtx.offense) / 2) + ((homeRecentOffense + awayRecentOffense) / 2) + env.score),
      parkFactor: round2((homeCtx.park - 1.0) * 1.6 + weatherScore),
      bullpen: round2(-1 * (((homeCtx.bullpen + awayCtx.bullpen) / 2) + ((homeBullpenFresh + awayBullpenFresh) / 2)) * 0.55),
      travelRest: round2(-1 * ((awayTravelScore + homeTravelScore) / 2) * 0.45)
    },
    market: { runEnvironment: env.label, runEnvironmentScore: env.score, totalLine: env.totalLine, parkFactor: homeCtx.park },
    teamContext: { away: awayCtx, home: homeCtx },
    realWorld: {
      pitchers: {
        away: { qualityScore: round2(awayPitcherScore), recent: ctx.realWorld?.pitchers?.away?.summary?.recent || null },
        home: { qualityScore: round2(homePitcherScore), recent: ctx.realWorld?.pitchers?.home?.summary?.recent || null }
      },
      teams: {
        away: ctx.realWorld?.teams?.away || null,
        home: ctx.realWorld?.teams?.home || null
      },
      travel: ctx.realWorld?.travel || null,
      weather: ctx.realWorld?.weather || null
    },
    liveFeedStatus: {
      probablePitchers: ctx.probablePitchers.away !== "TBD" && ctx.probablePitchers.home !== "TBD" ? "live" : "partial",
      lineup: ctx.realWorld?.hitters?.lineupStatus || "projected",
      marketContext: "live",
      teamStrength: "mixed_live_plus_static",
      parkFactor: "static_proxy",
      recentPitcherForm: ctx.realWorld?.pitchers?.away?.summary || ctx.realWorld?.pitchers?.home?.summary ? "live" : "missing",
      recentTeamForm: ctx.realWorld?.teams?.away || ctx.realWorld?.teams?.home ? "live" : "missing",
      travelRest: ctx.realWorld?.travel ? "live" : "missing",
      weather: ctx.realWorld?.weather ? "live_or_neutral" : "missing"
    }
  };
}

function buildModelOutputs(ctx) {
  const s = ctx.componentScores.side;
  const t = ctx.componentScores.total;
  const sideComposite = round2(Number(s.startingPitcher || 0) + Number(s.bullpen || 0) + Number(s.lineup || 0) + Number(s.offenseVsHand || 0) + Number(s.travelRest || 0));
  const totalComposite = round2(Number(t.starters || 0) + Number(t.lineup || 0) + Number(t.parkFactor || 0) + Number(t.bullpen || 0) + Number(t.travelRest || 0));
  const homeWinProb = clamp(0.5 + sideComposite * 0.13, 0.31, 0.69);
  const awayWinProb = clamp(1 - homeWinProb, 0.31, 0.69);
  const marketHomeProb = americanToProb(ctx.moneylineData.homePrice);
  const marketAwayProb = americanToProb(ctx.moneylineData.awayPrice);
  const totalLine = ctx.totalData.line;
  const fairTotal = totalLine != null ? round2(totalLine + totalComposite * 1.15) : null;
  const overProb = totalLine != null && fairTotal != null ? clamp(0.5 + (fairTotal - totalLine) * 0.12, 0.28, 0.72) : null;
  const underProb = overProb != null ? clamp(1 - overProb, 0.28, 0.72) : null;
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

function getPriceDisciplineScore(c) {
  const price = toPrice(c?.oddsPrice);
  if (price == null) return -1.4;
  let score = 0;
  if (price >= -135 && price <= 125) score += 0.38;
  else if (price > 125 && price <= 160) score += 0.10;
  else if (price > 160) score -= clamp((price - 160) * 0.008, 0, 1.15);
  else if (price < -185) score -= clamp((Math.abs(price) - 185) * 0.004, 0, 0.85);

  if (c?.marketFamily === "prop" && price > 135) score -= 0.18;
  if ((c?.market === "runline" || c?.market === "f5_runline") && price > 135) score -= 0.12;
  return round2(score);
}

function pitcherExpectedStrikeouts(summary) {
  const src = summary?.recent?.games ? summary.recent : summary?.season;
  if (!src) return null;
  if (src.k9 != null && src.avgOuts != null) return round2((Number(src.k9) * Number(src.avgOuts)) / 27);
  return null;
}

function pitcherExpectedOuts(summary) {
  const src = summary?.recent?.games ? summary.recent : summary?.season;
  if (!src) return null;
  return src.avgOuts != null ? round2(src.avgOuts) : null;
}

function pitcherExpectedEarnedRuns(summary) {
  const src = summary?.recent?.games ? summary.recent : summary?.season;
  if (!src) return null;
  const outs = src.avgOuts != null ? Number(src.avgOuts) : 15.5;
  if (src.era == null) return null;
  return round2((Number(src.era) * outs) / 27);
}

function hitterOverBaseRate(marketKey, point) {
  const p = Number(point);
  if (!Number.isFinite(p)) return null;
  const priors = {
    batter_total_bases: { 0.5: 0.72, 1.5: 0.43, 2.5: 0.22, 3.5: 0.10, 4.5: 0.05 },
    batter_hits: { 0.5: 0.67, 1.5: 0.30, 2.5: 0.12, 3.5: 0.04 },
    batter_home_runs: { 0.5: 0.13, 1.5: 0.02 },
    batter_rbis: { 0.5: 0.30, 1.5: 0.09, 2.5: 0.03 },
    batter_runs_scored: { 0.5: 0.35, 1.5: 0.10, 2.5: 0.03 },
    batter_hits_runs_rbis: { 0.5: 0.76, 1.5: 0.48, 2.5: 0.24, 3.5: 0.11, 4.5: 0.05 },
    batter_stolen_bases: { 0.5: 0.10, 1.5: 0.01 },
    batter_walks: { 0.5: 0.27, 1.5: 0.05 },
    batter_singles: { 0.5: 0.38, 1.5: 0.09, 2.5: 0.02 },
    batter_doubles: { 0.5: 0.11, 1.5: 0.01 },
    batter_triples: { 0.5: 0.02, 1.5: 0.001 }
  };
  const table = priors[marketKey];
  if (!table) return null;
  if (table[p] != null) return table[p];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let last = table[keys[0]];
  for (const k of keys) {
    if (p <= k) return table[k];
    last = table[k];
  }
  return last * Math.pow(0.55, Math.max(0, p - keys[keys.length - 1]));
}
function propModelProbability(marketKey, side, point, ctx, player) {
  const env = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0);
  const weatherScore = Number(ctx?.realWorld?.weather?.weatherScore || 0);
  const awayPitcherName = normalizeName(ctx?.probablePitchers?.away);
  const homePitcherName = normalizeName(ctx?.probablePitchers?.home);
  const playerName = normalizeName(player);
  const pitcherTeam = playerName && playerName === awayPitcherName ? "away" : playerName && playerName === homePitcherName ? "home" : null;
  const pitcherSummary = pitcherTeam ? ctx?.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
  const oppTeam = pitcherTeam === "away" ? "home" : pitcherTeam === "home" ? "away" : null;
  const oppRecent = oppTeam ? Number(ctx?.realWorld?.teams?.[oppTeam]?.recentOffenseScore || 0) : 0;
  const ownRecent = pitcherTeam ? Number(ctx?.realWorld?.teams?.[pitcherTeam]?.recentPreventionScore || 0) : 0;
  const ownBullpenFresh = pitcherTeam ? Number(ctx?.realWorld?.teams?.[pitcherTeam]?.bullpenFreshnessScore || 0) : 0;

  if (marketKey.startsWith("pitcher_")) {
    if (marketKey === "pitcher_strikeouts") {
      const expected = pitcherExpectedStrikeouts(pitcherSummary);
      if (expected != null) {
        const diff = expected - Number(point);
        const quality = pitcherQualityScore(pitcherSummary);
        let overProb = 0.5 + diff * 0.17 + quality * 0.08 - oppRecent * 0.05 - weatherScore * 0.04 + ownBullpenFresh * 0.03 + ownRecent * 0.03;
        overProb = clamp(overProb, 0.07, 0.86);
        return side === "over" ? overProb : clamp(1 - overProb, 0.14, 0.93);
      }
    }
    if (marketKey === "pitcher_outs") {
      const expected = pitcherExpectedOuts(pitcherSummary);
      if (expected != null) {
        const diff = expected - Number(point);
        const quality = pitcherQualityScore(pitcherSummary);
        let overProb = 0.5 + diff * 0.14 + quality * 0.06 + ownBullpenFresh * 0.06 - oppRecent * 0.04;
        overProb = clamp(overProb, 0.08, 0.88);
        return side === "over" ? overProb : clamp(1 - overProb, 0.12, 0.92);
      }
    }
    if (marketKey === "pitcher_earned_runs") {
      const expected = pitcherExpectedEarnedRuns(pitcherSummary);
      if (expected != null) {
        const diff = expected - Number(point);
        const quality = pitcherQualityScore(pitcherSummary);
        let overProb = 0.5 + diff * 0.22 - quality * 0.08 + oppRecent * 0.05 + weatherScore * 0.05;
        overProb = clamp(overProb, 0.08, 0.88);
        return side === "over" ? overProb : clamp(1 - overProb, 0.12, 0.92);
      }
    }
    return null;
  }

  const overBase = hitterOverBaseRate(marketKey, point);
  if (overBase != null) {
    const awayPitcherScore = Number(ctx?.realWorld?.pitchers?.away?.qualityScore || 0);
    const homePitcherScore = Number(ctx?.realWorld?.pitchers?.home?.qualityScore || 0);
    const weakerPitcherBoost = clamp((-1 * ((homePitcherScore + awayPitcherScore) / 2)) * 0.05, -0.04, 0.09);
    const teamRecent = clamp(((Number(ctx?.realWorld?.teams?.away?.recentOffenseScore || 0) + Number(ctx?.realWorld?.teams?.home?.recentOffenseScore || 0)) / 2) * 0.04, -0.05, 0.08);
    let overProb = overBase + weakerPitcherBoost + teamRecent + weatherScore * 0.05 + env * 0.04;
    overProb = clamp(overProb, 0.03, 0.90);
    return side === "over" ? overProb : clamp(1 - overProb, 0.10, 0.97);
  }

  return null;
}

function pitcherContextForCandidate(c, ctx) {
  const pitcherTeam = normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.away) ? "away"
    : normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.home) ? "home" : null;
  const summary = pitcherTeam ? ctx?.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
  const recent = summary?.recent?.games ? summary.recent : summary?.season;
  const oppTeam = pitcherTeam === "away" ? "home" : pitcherTeam === "home" ? "away" : null;
  const oppRecentOffense = oppTeam ? Number(ctx?.realWorld?.teams?.[oppTeam]?.recentOffenseScore || 0) : 0;
  return { pitcherTeam, summary, recent, oppTeam, oppRecentOffense };
}


function getHitterInfo(ctx, player) {
  const key = normalizeName(player);
  return ctx?.realWorld?.hitters?.byName?.[key] || null;
}

function getSideTeamName(ctx, side) {
  return side === "away" ? ctx?.awayTeam : side === "home" ? ctx?.homeTeam : null;
}

function teamOffenseComposite(ctx, side) {
  const teamName = getSideTeamName(ctx, side);
  const stat = getTeamContext(teamName);
  const recent = Number(ctx?.realWorld?.teams?.[side]?.recentOffenseScore || 0);
  return round2(Number(stat.offense || 0) + recent);
}

function opponentSide(side) { return side === "away" ? "home" : side === "home" ? "away" : null; }

function opponentOffenseDifficulty(ctx, sideFacingPitcher) {
  const opp = opponentSide(sideFacingPitcher);
  if (!opp) return 0;
  const offense = teamOffenseComposite(ctx, opp);
  const runEnvScore = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0);
  const weatherScore = Number(ctx?.realWorld?.weather?.weatherScore || 0);
  return round2(offense + runEnvScore * 0.35 + weatherScore * 0.25);
}

function buildHitterProfessionalContext(c, ctx) {
  const info = getHitterInfo(ctx, c.player);
  const side = info?.side || null;
  const opp = side ? opponentSide(side) : null;
  const oppPitcherQuality = opp ? Number(ctx?.realWorld?.pitchers?.[opp]?.qualityScore || 0) : ((Number(ctx?.realWorld?.pitchers?.away?.qualityScore || 0) + Number(ctx?.realWorld?.pitchers?.home?.qualityScore || 0)) / 2);
  const oppPitcherWeakness = -1 * oppPitcherQuality;
  const ownOffense = side ? teamOffenseComposite(ctx, side) : ((teamOffenseComposite(ctx, "away") + teamOffenseComposite(ctx, "home")) / 2);
  const runEnvScore = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0) + Number(ctx?.realWorld?.weather?.weatherScore || 0);
  const q = info?.qualityBreakdown || scoreHitterSeason(null, null);
  const point = Number(c.point || 0);

  let propFit = 0;
  if (c.market === "batter_total_bases") propFit = q.power * 0.52 + q.contact * 0.34;
  else if (c.market === "batter_hits") propFit = q.contact * 0.78 + q.plateSkill * 0.16;
  else if (c.market === "batter_home_runs") propFit = q.power * 0.65 - 0.30;
  else if (c.market === "batter_rbis" || c.market === "batter_runs_scored") propFit = q.total * 0.30 + ownOffense * 0.36 - 0.22;
  else if (c.market === "batter_hits_runs_rbis") propFit = q.total * 0.45 + ownOffense * 0.55;
  else if (c.market === "batter_walks") propFit = q.plateSkill * 0.82 + q.contact * 0.08;
  else if (c.market === "batter_doubles" || c.market === "batter_triples" || c.market === "batter_stolen_bases") propFit = q.total * 0.22 - 0.35;
  else propFit = q.total * 0.65;

  let overScore = propFit + Number(q.lineup || 0) * 0.45 + ownOffense * 0.65 + oppPitcherWeakness * 0.55 + runEnvScore * 0.45;
  if (point >= 2.5 && (c.market === "batter_total_bases" || c.market === "batter_hits")) overScore -= 0.25;
  if (!info) overScore -= 0.45;
  if (info?.lineupSpot != null && info.lineupSpot >= 7 && c.side === "over") overScore -= 0.22;

  const underScore = (-overScore * 0.75) + (oppPitcherQuality > 0 ? oppPitcherQuality * 0.25 : 0);
  const score = c.side === "over" ? overScore : underScore;

  const notes = [];
  if (info) {
    notes.push(`${info.name} hitter-quality score ${round2(info.qualityScore)}${info.lineupSpot ? `, lineup spot ${info.lineupSpot}` : ""}.`);
    if (info.stats?.ops != null) notes.push(`Season OPS ${info.stats.ops}, SLG ${info.stats.slg ?? "N/A"}, AVG ${info.stats.avg ?? "N/A"}.`);
  } else {
    notes.push("Hitter not found in confirmed/live lineup context; High requires stronger non-lineup support.");
  }
  notes.push(`Opposing pitcher quality proxy ${round2(oppPitcherQuality)} and team/run environment ${round2(ownOffense + runEnvScore)}.`);

  const gateFailures = [];
  if (c.side === "over") {
    if (!info) gateFailures.push("hitter lineup/player-quality context missing");
    if (info?.lineupSpot != null && info.lineupSpot >= 6) gateFailures.push("hitter is outside the preferred top-five lineup funnel for Over");
    if (c.market === "batter_total_bases" && (q.power < 0.06 || q.contact < 0.05)) gateFailures.push("power/contact blend is weak for Total Bases Over");
    if (c.market === "batter_hits" && q.contact < 0.10) gateFailures.push("contact support is weak for Hits Over");
    if (c.market === "batter_hits_runs_rbis" && (q.total < 0.06 || ownOffense + runEnvScore < 0.00)) gateFailures.push("H+R+RBI needs player quality plus team run environment support");
    if (c.market === "batter_walks" && q.plateSkill < 0.06) gateFailures.push("walks over requires plate-discipline support");
    if (LONGSHOT_HITTER_MARKETS.has(c.market)) gateFailures.push("one-event long-shot hitter market is not suitable for High by default");
    if (overScore < 0.16) gateFailures.push("professional hitter-context score is not strong enough for Over");
  }

  const cap = gateFailures.length >= 2 ? "Low" : gateFailures.length === 1 ? "Medium" : null;
  return {
    type: "hitter",
    score: round2(score),
    hitterQualityScore: info ? round2(info.qualityScore) : null,
    contactScore: round2(q.contact || 0),
    powerScore: round2(q.power || 0),
    plateSkillScore: round2(q.plateSkill || 0),
    lineupSpot: info?.lineupSpot || null,
    playerTeamSide: side,
    opponentPitcherQuality: round2(oppPitcherQuality),
    ownOffenseScore: round2(ownOffense),
    runEnvironmentScore: round2(runEnvScore),
    gateFailures,
    confidenceCap: cap,
    notes
  };
}

function buildPitcherProfessionalContext(c, ctx) {
  const pc = pitcherContextForCandidate(c, ctx);
  const recent = pc.recent || null;
  const pitcherQuality = pitcherQualityScore(pc.summary);
  const oppDifficulty = pc.pitcherTeam ? opponentOffenseDifficulty(ctx, pc.pitcherTeam) : 0;
  const workload = recent?.avgOuts != null ? clamp((Number(recent.avgOuts) - 15.5) * 0.08, -0.45, 0.55) : 0;
  const kSkill = recent?.k9 != null ? clamp((Number(recent.k9) - 8.6) * 0.075, -0.45, 0.60) : 0;
  const runEnvScore = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0) + Number(ctx?.realWorld?.weather?.weatherScore || 0);
  let score = 0;

  if (c.market === "pitcher_strikeouts") {
    const overSupport = pitcherQuality * 0.35 + kSkill * 0.75 + workload * 0.30 - oppDifficulty * 0.55 - runEnvScore * 0.10;
    score = c.side === "over" ? overSupport : -overSupport;
  } else if (c.market === "pitcher_outs") {
    const overSupport = workload * 0.85 + pitcherQuality * 0.30 - oppDifficulty * 0.65 - Math.max(0, runEnvScore) * 0.25;
    score = c.side === "over" ? overSupport : -overSupport;
  } else if (c.market === "pitcher_earned_runs") {
    const overSupport = oppDifficulty * 0.75 + Math.max(0, runEnvScore) * 0.45 - pitcherQuality * 0.42;
    score = c.side === "over" ? overSupport : -overSupport;
  }

  const notes = [];
  if (recent?.k9 != null) notes.push(`${c.player} recent K/9 ${recent.k9}, average outs ${recent.avgOuts ?? "N/A"}.`);
  else notes.push("Pitcher recent game-log context is limited or unavailable.");
  notes.push(`Opponent offense difficulty proxy ${round2(oppDifficulty)}; pitcher quality score ${round2(pitcherQuality)}.`);

  const gateFailures = [];
  if (c.market === "pitcher_strikeouts" && c.side === "over") {
    if (kSkill < -0.10) gateFailures.push("pitcher strikeout form is not supportive");
    if (oppDifficulty > 0.18) gateFailures.push("opponent offense/contact difficulty is elevated");
  }
  if (c.market === "pitcher_outs" && c.side === "over") {
    if (workload < 0) gateFailures.push("recent workload does not support outs over");
    if (oppDifficulty > 0.12) gateFailures.push("opponent offense may pressure pitch count/leash");
  }

  const cap = gateFailures.length >= 2 ? "Low" : gateFailures.length === 1 ? "Medium" : null;
  return {
    type: "pitcher",
    score: round2(score),
    pitcherQualityScore: round2(pitcherQuality),
    opponentOffenseDifficultyScore: round2(oppDifficulty),
    workloadScore: round2(workload),
    strikeoutSkillScore: round2(kSkill),
    runEnvironmentScore: round2(runEnvScore),
    pitcherTeamSide: pc.pitcherTeam,
    gateFailures,
    confidenceCap: cap,
    notes
  };
}

function buildSideProfessionalContext(c, ctx) {
  let score = 0;
  const notes = [];
  if (c.teamSide) {
    const opp = opponentSide(c.teamSide);
    const ownOffense = teamOffenseComposite(ctx, c.teamSide);
    const oppOffense = teamOffenseComposite(ctx, opp);
    const ownPitcher = Number(ctx?.realWorld?.pitchers?.[c.teamSide]?.qualityScore || 0);
    const oppPitcher = Number(ctx?.realWorld?.pitchers?.[opp]?.qualityScore || 0);
    const ownBullpen = Number(ctx?.realWorld?.teams?.[c.teamSide]?.bullpenFreshnessScore || 0) + Number(getTeamContext(getSideTeamName(ctx, c.teamSide)).bullpen || 0);
    const oppBullpen = Number(ctx?.realWorld?.teams?.[opp]?.bullpenFreshnessScore || 0) + Number(getTeamContext(getSideTeamName(ctx, opp)).bullpen || 0);
    score = (ownOffense - oppOffense) * 0.55 + (ownPitcher - oppPitcher) * 0.65 + (ownBullpen - oppBullpen) * 0.35;
    notes.push(`${getSideTeamName(ctx, c.teamSide)} side context: offense ${round2(ownOffense)}, starter edge ${round2(ownPitcher - oppPitcher)}, bullpen edge ${round2(ownBullpen - oppBullpen)}.`);
  }
  return { type: "side", score: round2(score), gateFailures: [], confidenceCap: null, notes };
}

function buildTotalProfessionalContext(c, ctx) {
  const totalComposite = Number(ctx?.modelOutputs?.totalComposite || 0);
  const starterTotalScore = Number(ctx?.componentScores?.total?.starters || 0);
  const runEnvScore = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0) + Number(ctx?.realWorld?.weather?.weatherScore || 0);
  const overSupport = totalComposite * 0.65 + runEnvScore * 0.50 - starterTotalScore * 0.25;
  const score = c.side === "over" ? overSupport : -overSupport;
  return { type: "total", score: round2(score), runEnvironmentScore: round2(runEnvScore), gateFailures: [], confidenceCap: null, notes: [`Total context: model total composite ${round2(totalComposite)}, starter/run-prevention score ${round2(starterTotalScore)}, run environment ${round2(runEnvScore)}.`] };
}

function buildProfessionalBetContext(c, ctx) {
  if (c?.marketFamily === "prop" && c?.propSubType === "hitter") return buildHitterProfessionalContext(c, ctx);
  if (c?.marketFamily === "prop" && c?.propSubType === "pitcher") return buildPitcherProfessionalContext(c, ctx);
  if (["moneyline", "runline", "f5_moneyline", "f5_runline"].includes(c?.market)) return buildSideProfessionalContext(c, ctx);
  if (["total", "f5_total"].includes(c?.market)) return buildTotalProfessionalContext(c, ctx);
  return { type: "unknown", score: 0, gateFailures: [], confidenceCap: null, notes: [] };
}

function getHistoricalTrustFadeScore(c, ctx, professional) {
  let adjustment = 0;
  let antiSignalActive = false;
  let fadeEligible = false;
  const notes = [];

  if (c.market === "pitcher_strikeouts" && c.side === "over") {
    adjustment += 0.18;
    notes.push("Historical preserve: K Over was the cleanest non-negative prop direction in the archive.");
  }
  if (c.market === "pitcher_strikeouts" && c.side === "under" && Number(professional?.score || 0) < 0.12) {
    adjustment -= 0.55;
    antiSignalActive = true;
    fadeEligible = true;
    notes.push("Historical anti-signal: K Under failed when pitcher K/workload context did not clearly support the under.");
  }
  if (c.market === "batter_total_bases" && c.side === "over" && safeArray(professional?.gateFailures).length) {
    adjustment -= 0.55;
    antiSignalActive = true;
    fadeEligible = true;
    notes.push("Historical anti-signal: weak-context Total Bases Overs were a recurring leak.");
  }
  if (c.market === "batter_hits" && c.side === "over" && safeArray(professional?.gateFailures).length) {
    adjustment -= 0.38;
    antiSignalActive = true;
    fadeEligible = true;
    notes.push("Historical watchlist: Hits Over requires contact/lineup/matchup support before trust.");
  }
  if ((c.market === "batter_total_bases" || c.market === "batter_hits") && c.side === "under" && Number(professional?.score || 0) > 0.05) {
    adjustment += 0.12;
    notes.push("Historical watchlist-positive: hitter unders were better than overs, but sample size remains small.");
  }
  const price = toPrice(c.oddsPrice);
  if ((c.market === "moneyline" || c.market === "f5_moneyline") && price != null && price < -155 && Number(c.edgePct || 0) < 1.0) {
    adjustment -= 0.22;
    notes.push("Market discipline: expensive favorite requires stronger edge before trust.");
  }

  return { adjustment: round2(adjustment), notes, antiSignalActive, fadeEligible };
}

function isInverseCandidate(a, b) {
  if (!a || !b || a === b) return false;
  if (a.market !== b.market) return false;
  if (a.marketFamily !== b.marketFamily) return false;
  if (a.propSubType !== b.propSubType) return false;
  if (a.player || b.player) {
    if (normalizeName(a.player) !== normalizeName(b.player)) return false;
    if (String(a.point) !== String(b.point)) return false;
  }
  if ((a.side === "over" && b.side === "under") || (a.side === "under" && b.side === "over")) return true;
  if ((a.side === "away" && b.side === "home") || (a.side === "home" && b.side === "away")) return true;
  return false;
}

function fadeIsSupported(original, inverse) {
  if (!inverse || !hasValue(inverse.oddsPrice)) return false;
  const price = toPrice(inverse.oddsPrice);
  if (price == null) return false;
  if (price < -210 || price > 180) return false;
  if (Number(inverse.edgePct || 0) < -0.65) return false;
  if (inverse.scriptHardConflict || inverse.scriptConfidenceCap === "Low") return false;
  if (original.market === "pitcher_strikeouts" && original.side === "under") return Number(inverse.professionalScore || 0) >= -0.10;
  if ((original.market === "batter_total_bases" || original.market === "batter_hits") && original.side === "over") return Number(inverse.professionalScore || 0) >= -0.05 && Number(inverse.finalScore || 0) >= 1.5;
  return Number(inverse.finalScore || 0) >= 1.8;
}

function applyHybridTrustFadePassLayer(candidates, ctx) {
  const arr = safeArray(candidates).map(c => addConfidenceFields({
    ...c,
    decisionMode: c.decisionMode || "Trust Model",
    trustFadePassDecision: c.trustFadePassDecision || "trust",
    fadeCandidateFor: c.fadeCandidateFor || null,
    hybridNotes: safeArray(c.hybridNotes)
  }));

  for (const original of arr) {
    if (!original.historicalAntiSignalActive) continue;
    const inverse = arr.find(c => isInverseCandidate(original, c));
    original.finalScore = round2(Number(original.finalScore || 0) - 0.45);
    original.confidenceScore = confidencePct(original.finalScore);
    original.trustFadePassDecision = "pass";
    original.decisionMode = "Pass";
    original.hybridNotes = safeArray(original.hybridNotes).concat(["Hybrid V12: original candidate matches a documented old-model anti-signal."]);
    original.professionalConfidenceCap = original.professionalConfidenceCap || "Medium";

    if (fadeIsSupported(original, inverse)) {
      inverse.finalScore = round2(Number(inverse.finalScore || 0) + (original.market === "pitcher_strikeouts" ? 0.62 : 0.34));
      inverse.confidenceScore = confidencePct(inverse.finalScore);
      inverse.trustFadePassDecision = "fade";
      inverse.decisionMode = "Fade Model";
      inverse.fadeCandidateFor = original.bestBet;
      inverse.hybridNotes = safeArray(inverse.hybridNotes).concat([`Hybrid V12: fade candidate against old-model anti-signal (${original.bestBet}).`]);
      inverse.reasons = safeArray(inverse.reasons).concat([`Hybrid V12 fade layer: selected as the better-supported opposite of ${original.bestBet}.`]);
    }
  }

  return arr.sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
}

function getPhase1DirectionalPenalty(c, ctx) {
  let penalty = 0;
  const notes = [];
  const totalComposite = Number(ctx?.modelOutputs?.totalComposite || 0);
  const starterTotalScore = Number(ctx?.componentScores?.total?.starters || 0);
  const runLean = ctx?.sameGameScenario?.runLean || "neutral";
  const runEnvScore = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0);

  // Data Trends: F5 Under was the strongest directional leak. Only penalize when context disagrees.
  if (c.market === "f5_total" && c.side === "under") {
    let conflict = 0;
    if (totalComposite > 0.08) conflict += 1;
    if (runLean === "over") conflict += 1;
    if (runEnvScore > 0.10) conflict += 1;
    if (starterTotalScore > -0.05) conflict += 1;

    if (conflict >= 2) {
      penalty += 0.95;
      notes.push("Phase 1: F5 Under penalized because total/script context leans run creation.");
    } else if (conflict === 1) {
      penalty += 0.38;
      notes.push("Phase 1: mild F5 Under watchlist penalty.");
    }
  }

  // Game Over is watchlist only: penalize only when starter/prevention context conflicts with the Over.
  if (c.market === "total" && c.side === "over") {
    let conflict = 0;
    if (totalComposite < -0.08) conflict += 1;
    if (runLean === "under") conflict += 1;
    if (starterTotalScore < -0.12) conflict += 1;

    if (conflict >= 2) {
      penalty += 0.55;
      notes.push("Phase 1: Game Over penalized because starter/prevention and script context lean under.");
    }
  }

  // Pitcher K Under: do not suppress all K props; gate only against strong K/workload profile.
  if (c.market === "pitcher_strikeouts" && c.side === "under") {
    const pc = pitcherContextForCandidate(c, ctx);
    const expected = pitcherExpectedStrikeouts(pc.summary);
    let conflict = 0;
    if (expected != null && Number(c.point) <= expected) conflict += 1;
    if (pc.recent?.k9 != null && Number(pc.recent.k9) >= 8.9) conflict += 1;
    if (pc.recent?.avgOuts != null && Number(pc.recent.avgOuts) >= 15.5) conflict += 1;
    if (Number(c.contextTilt || 0) < -0.08) conflict += 1;

    if (conflict >= 2) {
      penalty += 0.85;
      notes.push("Phase 1: K Under penalized because pitcher K form/workload does not support the under.");
    } else if (conflict === 1) {
      penalty += 0.28;
      notes.push("Phase 1: mild K Under watchlist penalty.");
    }
  }

  // Pitcher Outs Over watchlist: only penalize when workload/leash profile is not clearly supportive.
  if (c.market === "pitcher_outs" && c.side === "over") {
    const pc = pitcherContextForCandidate(c, ctx);
    const expected = pitcherExpectedOuts(pc.summary);
    let conflict = 0;
    if (expected != null && Number(c.point) >= expected) conflict += 1;
    if (pc.recent?.avgOuts != null && Number(pc.recent.avgOuts) < 16.5) conflict += 1;
    if (pc.oppRecentOffense > 0.12) conflict += 1;

    if (conflict >= 2) {
      penalty += 0.55;
      notes.push("Phase 1: Pitcher Outs Over penalized because workload/opponent context is not supportive.");
    }
  }

  // Hitter TB/Hits overs: add conditional skill-context filter. We lack true AVG/SLG fields, so use available proxies:
  // point aggression, model probability, pitcher weakness, run environment, team offense context, and price discipline.
  if (c.propSubType === "hitter" && c.side === "over" && (c.market === "batter_total_bases" || c.market === "batter_hits")) {
    const modelProb = Number(c.modelProb || c.fairProb || 0);
    const point = Number(c.point || 0);
    const pitcherWeakness = -1 * ((Number(ctx?.realWorld?.pitchers?.away?.qualityScore || 0) + Number(ctx?.realWorld?.pitchers?.home?.qualityScore || 0)) / 2);
    const recentOffense = (Number(ctx?.realWorld?.teams?.away?.recentOffenseScore || 0) + Number(ctx?.realWorld?.teams?.home?.recentOffenseScore || 0)) / 2;
    const envSupport = runEnvScore + Number(ctx?.realWorld?.weather?.weatherScore || 0);
    const price = toPrice(c.oddsPrice);

    let weakSupport = 0;
    if (modelProb < 0.54) weakSupport += 1;
    if (pitcherWeakness < 0.04) weakSupport += 1;
    if (recentOffense < 0.02) weakSupport += 1;
    if (envSupport < 0.02) weakSupport += 1;
    if (price != null && price > 125) weakSupport += 1;

    if (c.market === "batter_total_bases") {
      if (point >= 1.5 && weakSupport >= 2) {
        penalty += 0.90;
        notes.push("Phase 1: TB Over requires stronger hitter/context support than price alone.");
      }
      if (point >= 2.5 && weakSupport >= 1) {
        penalty += 0.55;
        notes.push("Phase 1: elevated TB Over line needs stronger contact/power/matchup support.");
      }
    }

    if (c.market === "batter_hits") {
      if (point >= 0.5 && weakSupport >= 3) {
        penalty += 0.65;
        notes.push("Phase 1: Hits Over penalized because contact/matchup proxies are not supportive.");
      }
      if (point >= 1.5 && weakSupport >= 1) {
        penalty += 0.50;
        notes.push("Phase 1: multi-hit Over needs stronger contact and lineup context.");
      }
    }
  }

  return { penalty: round2(penalty), notes };
}

function getImplausibilityPenalty(c, ctx) {
  let penalty = 0;
  const notes = [];
  const point = Number(c?.point);

  if (c?.marketFamily === "prop" && c?.propSubType === "hitter") {
    if (c.market === "batter_total_bases" && c.side === "over") {
      if (point >= 4.5) { penalty += 2.45; notes.push("very aggressive total-bases alt line"); }
      else if (point >= 3.5) { penalty += 1.95; notes.push("aggressive total-bases alt line"); }
      else if (point >= 2.5) { penalty += 0.90; notes.push("elevated total-bases line"); }
      else if (point >= 1.5) { penalty += 0.18; notes.push("TB over needs skill/context confirmation"); }
    }
    if (c.market === "batter_hits" && c.side === "over") {
      if (point >= 2.5) { penalty += 1.25; notes.push("aggressive hits alt line"); }
      else if (point >= 1.5) { penalty += 0.45; notes.push("multi-hit line needs stronger support"); }
    }
    if (c.market === "batter_home_runs" && c.side === "over") {
      penalty += point >= 1.5 ? 2.4 : 1.45;
      notes.push("home run overs are low-frequency events");
    }
    if ((c.market === "batter_rbis" || c.market === "batter_runs_scored" || c.market === "batter_hits_runs_rbis") && c.side === "over") {
      if (point >= 3.5) { penalty += 1.35; notes.push("high counting-stat alt line"); }
      else if (point >= 2.5) { penalty += 0.75; notes.push("counting-stat line elevated"); }
    }
    if (toPrice(c.oddsPrice) != null && toPrice(c.oddsPrice) > 150) {
      penalty += 0.35;
      notes.push("plus-money prop requires stronger baseball support");
    }
  }

  if (c?.market === "pitcher_strikeouts") {
    const pc = pitcherContextForCandidate(c, ctx);
    const expected = pitcherExpectedStrikeouts(pc.summary);
    const recent = pc.recent;
    if (expected != null) {
      if (c.side === "over") {
        if (point >= expected + 1.0) { penalty += 1.20; notes.push("strikeout over sits well above recent expectation"); }
        else if (point >= expected + 0.5) { penalty += 0.65; notes.push("strikeout over above recent expectation"); }
        if (recent?.avgOuts != null && recent.avgOuts < 15) { penalty += 0.28; notes.push("short leash hurts strikeout-over ceiling"); }
      } else if (c.side === "under") {
        if (point <= expected - 1.0) { penalty += 0.90; notes.push("strikeout under sits well below recent expectation"); }
        else if (point <= expected - 0.5) { penalty += 0.45; notes.push("strikeout under below recent expectation"); }
        if (recent?.k9 != null && recent.k9 > 9.7) { penalty += 0.22; notes.push("strong strikeout form resists under"); }
      }
    } else if (c.side === "under") {
      penalty += 0.12;
    }
  }

  if (c?.market === "pitcher_outs") {
    const pc = pitcherContextForCandidate(c, ctx);
    const expected = pitcherExpectedOuts(pc.summary);
    if (expected != null) {
      if (c.side === "over") {
        if (point >= expected + 1.5) { penalty += 1.05; notes.push("outs over above recent workload"); }
        else if (point >= expected + 0.5) { penalty += 0.55; notes.push("outs over slightly above recent workload"); }
      } else {
        if (point <= expected - 1.5) { penalty += 0.75; notes.push("outs under below recent workload"); }
      }
    }
  }

  if (c?.market === "pitcher_earned_runs") {
    const pc = pitcherContextForCandidate(c, ctx);
    const expected = pitcherExpectedEarnedRuns(pc.summary);
    if (expected != null) {
      if (c.side === "over" && point >= expected + 1.0) { penalty += 0.85; notes.push("earned-runs over above recent expectation"); }
      if (c.side === "under" && point <= expected - 1.0) { penalty += 0.65; notes.push("earned-runs under below recent expectation"); }
    }
  }

  const phase1 = getPhase1DirectionalPenalty(c, ctx);
  penalty += Number(phase1.penalty || 0);
  notes.push(...phase1.notes);

  return { penalty: round2(penalty), notes };
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
  score += 20;
  score += 15;
  score += 10;
  score += c.marketFamily === "prop" ? 10 : 5;
  return clamp(score, 0, 100);
}



function normalizeMarketName(raw) {
  return String(raw || "")
    .replace(/strikouts/ig, "strikeouts")
    .replace(/strike\s+outs/ig, "strikeouts")
    .replace(/total\s+base\b/ig, "total bases")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateDirection(c) {
  if (c?.side === "over" || c?.side === "under") return c.side;
  const text = `${c?.bestBet || ""} ${c?.market || ""} ${c?.bestBetType || ""}`.toLowerCase();
  if (/\bover\b/.test(text)) return "over";
  if (/\bunder\b/.test(text)) return "under";
  return c?.side || null;
}

function canonicalMarketLabel(c) {
  const key = String(c?.market || c?.bestBetType || "");
  const map = {
    batter_total_bases: "Total Bases",
    batter_hits: "Hits",
    batter_singles: "Singles",
    batter_stolen_bases: "Stolen Bases",
    pitcher_strikeouts: "Pitcher Strikeouts",
    pitcher_outs: "Pitcher Outs",
    pitcher_earned_runs: "Pitcher Earned Runs",
    moneyline: "Moneyline",
    runline: "Run Line",
    total: "Game Total",
    f5_moneyline: "F5 Moneyline",
    f5_runline: "F5 Run Line",
    f5_total: "F5 Total"
  };
  return normalizeMarketName(map[key] || key);
}

function isInvalidCandidate(c) {
  const odds = Number(c?.oddsPrice);
  const line = Number(c?.point ?? c?.line);
  const text = `${c?.matchup || ""} ${c?.bestBet || ""} ${c?.player || ""}`;
  const testPick = /test away|test home|sample pick|placeholder/i.test(text);
  const missingOdds = !Number.isFinite(odds) || odds === 0 || Math.abs(odds) < 80;
  const zeroLinePlaceholder = missingOdds && /(?:F5\s*)?(?:Run Line|Total|ML|Moneyline)/i.test(`${c?.bestBetType || ""} ${c?.market || ""}`) && (!Number.isFinite(line) || line === 0);
  return !!(testPick || missingOdds || zeroLinePlaceholder);
}

function v122ConfirmedLineup(ctx) {
  return ctx?.realWorld?.hitters?.lineupStatus === "confirmed_or_live";
}

function v122StartingPitchersConfirmed(ctx) {
  return ctx?.componentScores?.liveFeedStatus?.probablePitchers === "live" || (!!ctx?.probablePitchers?.awayId && !!ctx?.probablePitchers?.homeId);
}

function v122WeatherDelayRisk(ctx) {
  const p = Number(ctx?.realWorld?.weather?.precipProb);
  if (!Number.isFinite(p)) return 0;
  return clamp(p, 0, 100);
}

function v122SupportCount(c) {
  let count = 0;
  if (Number(c?.edgePct || 0) >= 1.5) count += 1;
  if (Number(c?.professionalRawScore || 0) >= 0.12) count += 1;
  if (Number(c?.professionalScore || 0) >= 0.20) count += 1;
  if (Number(c?.contextScore || 0) >= 0.15) count += 1;
  if (Number(c?.valueScore || 0) >= 0.10) count += 1;
  if (!safeArray(c?.professionalGateFailures).length) count += 1;
  if (!safeArray(c?.riskTags).length) count += 1;
  return count;
}

function getNoBadContextTags(c, ctx, professional) {
  const tags = [];
  const marketType = c?.marketFamily === "prop" ? `${c?.propSubType || ""}_prop` : c?.marketFamily || "";
  const direction = candidateDirection(c);
  const lineupConfirmed = v122ConfirmedLineup(ctx);
  const startersConfirmed = v122StartingPitchersConfirmed(ctx);
  const weatherRisk = v122WeatherDelayRisk(ctx);
  const lineupSpot = Number(professional?.lineupSpot ?? c?.lineupSpot);

  if (c?.marketFamily === "prop" && c?.propSubType === "hitter" && !lineupConfirmed) tags.push("lineup_not_confirmed");
  if ((/full|f5|pitcher_prop/.test(marketType) || c?.propSubType === "pitcher") && !startersConfirmed) tags.push("starting_pitcher_not_confirmed");
  if (c?.marketFamily === "prop" && c?.propSubType === "pitcher" && weatherRisk >= 50) tags.push("weather_delay_pitcher_prop_risk");
  if (weatherRisk >= 70) tags.push("weather_delay_or_wind_risk");
  if (c?.marketFamily === "prop" && c?.propSubType === "hitter" && direction === "over" && Number.isFinite(lineupSpot) && lineupSpot >= 7) tags.push("bad_lineup_spot_for_over");
  if (isInvalidCandidate(c)) tags.push("invalid_pick");
  return tags;
}


function v123IsDangerPlusMoney(price) {
  const p = toPrice(price);
  return p != null && p >= 121 && p <= 160;
}

function v123UnderPreventionSupport(ctx, market) {
  const totalComposite = Number(ctx?.modelOutputs?.totalComposite || 0);
  const marketRun = Number(ctx?.componentScores?.market?.runEnvironmentScore || 0);
  const starterRunPrevention = Number(ctx?.componentScores?.total?.starters || ctx?.componentScores?.total?.startingPitchers || 0);
  const bullpenRunPrevention = Number(ctx?.componentScores?.total?.bullpen || 0);
  const weatherRun = Number(ctx?.componentScores?.market?.weatherScore || 0);
  const line = market === "f5_total" ? Number(ctx?.f5TotalData?.line || 0) : Number(ctx?.totalData?.line || 0);
  let support = 0;
  if (totalComposite <= -0.08) support += 1;
  if (marketRun <= -0.06) support += 1;
  if (starterRunPrevention <= -0.06) support += 1;
  if (market !== "f5_total" && bullpenRunPrevention <= -0.04) support += 1;
  if (weatherRun <= -0.04) support += 1;
  if (line >= 8.5) support += 1;
  return support;
}

function v123PitcherPropNoHighTag(c) {
  const market = canonicalMarketLabel(c);
  const direction = candidateDirection(c);
  if (c?.marketFamily !== "prop" || c?.propSubType !== "pitcher") return null;
  if (/Earned Runs/i.test(market) && direction === "under") return "pitcher_er_under_no_high_emergency";
  if (/Strikeouts/i.test(market) && direction === "under") return "pitcher_k_under_no_high_emergency";
  if (/Pitcher Outs/i.test(market) && direction === "under") return "pitcher_outs_under_no_high_emergency";
  return null;
}

function v123HitterQualityGate(g) {
  // V12.4 keeps the name for compatibility, but the gate is now market-funneled.
  const spot = Number(g?.lineupSpot);
  const edge = Number(g?.edgePct || 0);
  const score = Number(g?.finalScore || 0);
  const quality = Number(g?.hitterQualityScore || 0);
  const contact = Number(g?.hitterContactScore || 0);
  const power = Number(g?.hitterPowerScore || 0);
  const oppPitcher = Number(g?.opponentPitcherQuality || 0);
  const tags = safeArray(g?.riskTags);
  const over = String(g?.side || "").toLowerCase() === "over";
  const topOrder = Number.isFinite(spot) && spot <= 5;
  const playerSupport = quality >= 0.08 || contact >= 0.10 || power >= 0.10;
  const matchupSupport = oppPitcher <= 0.03 || Number(g?.contextSupportCount || 0) >= 4;
  const noHighTags = [
    "lineup_not_confirmed", "bad_lineup_spot_for_over", "invalid_pick", "odds_missing_or_invalid",
    "hitter_high_requires_confirmed_lineup_v124", "hitter_market_not_safe_for_high_v124",
    "longshot_hitter_market_no_high_v124", "hitter_longshot_price_no_high_v124",
    "hitter_too_expensive_no_high_v124", "hitter_stretch_price_needs_elite_context_v124",
    "hitter_over_high_requires_top5_lineup_v124"
  ];
  const cleanRisk = !tags.some(t => noHighTags.includes(t));
  if (!cleanRisk || !topOrder) return false;
  if (over && !(playerSupport && matchupSupport)) return false;
  return score >= 3.08 && edge >= 1.05;
}


function v124IsHitterProp(c) {
  return c?.marketFamily === "prop" && c?.propSubType === "hitter";
}

function v124IsLongshotHitterMarket(c) {
  if (!v124IsHitterProp(c)) return false;
  const market = c.market;
  const point = Number(c.point || 0);
  if (LONGSHOT_HITTER_MARKETS.has(market)) return true;
  if (market === "batter_hits" && candidateDirection(c) === "over" && point >= 1.5) return true;
  if (market === "batter_total_bases" && candidateDirection(c) === "over" && point >= 2.5) return true;
  if (market === "batter_hits_runs_rbis" && candidateDirection(c) === "over" && point >= 2.5) return true;
  if (market === "batter_walks" && candidateDirection(c) === "over" && point >= 1.5) return true;
  return false;
}

function v124IsSafeHitterHighMarket(c, professional) {
  if (!v124IsHitterProp(c)) return false;
  const market = c.market;
  const side = candidateDirection(c);
  const point = Number(c.point || 0);
  const plate = Number(professional?.plateSkillScore || 0);
  if (!SAFE_HITTER_HIGH_MARKETS.has(market)) return false;
  if (market === "batter_hits" && side === "over") return point <= 0.5;
  if (market === "batter_total_bases" && side === "over") return point <= 1.5;
  if (market === "batter_hits_runs_rbis" && side === "over") return point <= 1.5;
  if (market === "batter_singles") return point <= 0.5;
  if (market === "batter_walks" && side === "over") return point <= 0.5 && plate >= 0.06;
  return side === "under" && (market === "batter_singles" || market === "batter_hits" || market === "batter_total_bases") && point <= 0.5;
}

function v124HitterPriceTier(price) {
  const p = toPrice(price);
  if (p == null) return "missing";
  if (p < HITTER_HIGH_PRICE_MIN) return "too_expensive";
  if (p <= HITTER_HIGH_PRICE_MAX) return "playable_high";
  if (p <= HITTER_STRETCH_PRICE_MAX) return "stretch";
  return "longshot_price";
}

function v124HitterHighGateFailureTags(c, professional, ctx) {
  const tags = [];
  if (!v124IsHitterProp(c)) return tags;
  const side = candidateDirection(c);
  const priceTier = v124HitterPriceTier(c?.oddsPrice);
  const lineupConfirmed = v122ConfirmedLineup(ctx);
  const lineupSpot = Number(professional?.lineupSpot ?? c?.lineupSpot ?? 99);
  const contact = Number(professional?.contactScore || 0);
  const power = Number(professional?.powerScore || 0);
  const quality = Number(professional?.hitterQualityScore ?? c?.hitterQualityScore ?? 0);
  const oppPitcherQuality = Number(professional?.opponentPitcherQuality || 0);
  const ownOffense = Number(professional?.ownOffenseScore || 0);
  const runEnv = Number(professional?.runEnvironmentScore || 0);
  const safeMarket = v124IsSafeHitterHighMarket(c, professional);
  const longshotMarket = v124IsLongshotHitterMarket(c);

  if (!lineupConfirmed) tags.push("hitter_high_requires_confirmed_lineup_v124");
  if (side === "over" && (!Number.isFinite(lineupSpot) || lineupSpot > 5)) tags.push("hitter_over_high_requires_top5_lineup_v124");
  if (!safeMarket) tags.push("hitter_market_not_safe_for_high_v124");
  if (longshotMarket) tags.push("longshot_hitter_market_no_high_v124");
  if (priceTier === "longshot_price") tags.push("hitter_longshot_price_no_high_v124");
  if (priceTier === "too_expensive") tags.push("hitter_too_expensive_no_high_v124");
  if (priceTier === "stretch" && !(quality >= 0.12 && (contact >= 0.12 || power >= 0.12) && oppPitcherQuality <= -0.03 && ownOffense + runEnv >= 0.05)) tags.push("hitter_stretch_price_needs_elite_context_v124");

  if (side === "over") {
    if (c.market === "batter_hits" && contact < 0.10) tags.push("hits_over_needs_contact_skill_v124");
    if (c.market === "batter_total_bases" && !(contact >= 0.05 && power >= 0.06)) tags.push("tb_over_needs_contact_power_blend_v124");
    if (c.market === "batter_hits_runs_rbis" && !(quality >= 0.08 && ownOffense + runEnv >= 0.03)) tags.push("hrrbi_over_needs_player_and_team_environment_v124");
    if (c.market === "batter_walks" && Number(professional?.plateSkillScore || 0) < 0.06) tags.push("walks_over_needs_plate_skill_v124");
  }

  return tags;
}

function v124HitterDisplayPenalty(c, professional, ctx) {
  if (!v124IsHitterProp(c)) return { delta: 0, tags: [] };
  const tags = [];
  let delta = 0;
  const side = candidateDirection(c);
  const priceTier = v124HitterPriceTier(c?.oddsPrice);
  const safeMarket = v124IsSafeHitterHighMarket(c, professional);
  const longshot = v124IsLongshotHitterMarket(c);
  const lineupSpot = Number(professional?.lineupSpot ?? c?.lineupSpot ?? 99);
  const quality = Number(professional?.hitterQualityScore ?? c?.hitterQualityScore ?? 0);
  const contact = Number(professional?.contactScore || 0);
  const power = Number(professional?.powerScore || 0);
  const oppPitcherQuality = Number(professional?.opponentPitcherQuality || 0);
  const ownOffense = Number(professional?.ownOffenseScore || 0);
  const runEnv = Number(professional?.runEnvironmentScore || 0);

  if (safeMarket) { delta += 0.18; tags.push("v124_safe_hitter_market_priority"); }
  if (longshot) { delta -= 1.45; tags.push("v124_longshot_hitter_market_tax"); }
  if (priceTier === "longshot_price") { delta -= 1.25; tags.push("v124_hitter_longshot_price_tax"); }
  if (priceTier === "too_expensive") { delta -= 0.65; tags.push("v124_hitter_expensive_price_tax"); }
  if (priceTier === "stretch") { delta -= 0.40; tags.push("v124_hitter_stretch_price_tax"); }
  if (side === "over" && Number.isFinite(lineupSpot) && lineupSpot > 5) { delta -= 0.55; tags.push("v124_hitter_over_lower_order_tax"); }
  if (side === "over" && quality < 0.04 && contact < 0.06 && power < 0.06) { delta -= 0.70; tags.push("v124_hitter_over_lacks_player_quality"); }
  if (side === "over" && oppPitcherQuality > 0.08) { delta -= 0.35; tags.push("v124_hitter_over_strong_opposing_pitcher_tax"); }
  if (side === "over" && ownOffense + runEnv < -0.08) { delta -= 0.28; tags.push("v124_hitter_over_poor_run_environment_tax"); }
  return { delta: round2(delta), tags };
}

function applyPriceDisciplineV122(c, score, tags) {
  const odds = toPrice(c?.oddsPrice);
  const market = canonicalMarketLabel(c);
  const direction = candidateDirection(c);
  let out = Number(score || 0);

  if (odds == null) {
    tags.push("odds_missing_or_invalid");
    return out - 2.0;
  }

  if (v123IsDangerPlusMoney(odds)) { out -= 0.85; tags.push("plus_money_121_160_emergency_tax"); }
  if (odds != null && odds > 0 && !v123IsDangerPlusMoney(odds)) { out -= 0.12; tags.push("plus_money_mild_value_check"); }
  if (/Total Bases/i.test(market) && direction === "over" && odds < -150) { out -= 0.55; tags.push("tb_over_expensive_price"); }
  if (/Hits/i.test(market) && !/Runs|RBIs/i.test(market) && direction === "over" && odds < -170) { out -= 0.45; tags.push("hits_over_expensive_price"); }
  if (/Singles/i.test(market) && direction === "under" && odds < -140) { out -= 0.30; tags.push("singles_under_price_tax"); }
  if (/Stolen Bases/i.test(market) && direction === "over") { out -= 0.90; tags.push("stolen_base_over_requires_elite_setup"); }
  if (/Pitcher Outs/i.test(market) && Math.abs(odds) > 145) { out -= 0.35; tags.push("pitcher_outs_price_tax"); }
  if (/Strikeouts/i.test(market) && direction === "over" && odds < -150) { out -= 0.28; tags.push("k_over_price_tax"); }
  if (/Run Line/i.test(market) && odds < -140) { out -= 0.35; tags.push("run_line_price_tax"); }
  return round2(out);
}

function applyMarketSpecificRulesV122(c, ctx, professional, score, tags) {
  const market = canonicalMarketLabel(c);
  const direction = candidateDirection(c);
  const price = toPrice(c?.oddsPrice);
  const point = Number(c?.point || 0);
  let out = Number(score || 0);
  const profScore = Number(professional?.score || 0);
  const hitterContact = Number(professional?.contactScore || 0);
  const hitterPower = Number(professional?.powerScore || 0);
  const lineupSpot = Number(professional?.lineupSpot || 99);
  const oppPitcherQuality = Number(professional?.opponentPitcherQuality || 0);
  const ownOffense = Number(professional?.ownOffenseScore || 0);
  const runEnv = Number(professional?.runEnvironmentScore || 0);
  const pitcherQuality = Number(professional?.pitcherQualityScore || 0);
  const oppOffenseDifficulty = Number(professional?.opponentOffenseDifficultyScore || 0);
  const workload = Number(professional?.workloadScore || 0);
  const kSkill = Number(professional?.strikeoutSkillScore || 0);
  const weatherRisk = v122WeatherDelayRisk(ctx);

  if ((c.market === "total" || c.market === "f5_total") && direction === "under") {
    const support = v123UnderPreventionSupport(ctx, c.market);
    const line = c.market === "f5_total" ? Number(ctx?.f5TotalData?.line || point || 0) : Number(ctx?.totalData?.line || point || 0);
    if (support < (c.market === "f5_total" ? 4 : 3)) {
      out -= c.market === "f5_total" ? 1.15 : 0.85;
      tags.push(c.market === "f5_total" ? "f5_under_lacks_prevention_context_emergency" : "game_under_lacks_prevention_context_emergency");
    }
    if (line > 0 && line <= (c.market === "f5_total" ? 4.0 : 7.5)) {
      out -= 0.45;
      tags.push(c.market === "f5_total" ? "f5_low_total_under_tax" : "low_total_under_tax");
    }
    if (runEnv >= 0.05) {
      out -= 0.35;
      tags.push("under_conflicts_with_run_environment");
    }
  }

  if ((c.market === "total" || c.market === "f5_total") && direction === "over") {
    const support = [runEnv >= 0, Number(ctx?.modelOutputs?.totalComposite || 0) >= 0, Number(c?.edgePct || 0) >= 1.0].filter(Boolean).length;
    if (support >= 2) { out += 0.12; tags.push(c.market === "f5_total" ? "v123_preserve_f5_over_profile" : "v123_preserve_game_over_profile"); }
  }

  if (c?.marketFamily === "prop" && c?.propSubType === "pitcher") {
    out -= 0.55;
    tags.push("pitcher_prop_emergency_probation");
    const noHigh = v123PitcherPropNoHighTag(c);
    if (noHigh) {
      tags.push(noHigh);
      out -= /Earned Runs/i.test(market) ? 3.00 : 2.10;
    }
  }

  if (v124IsHitterProp(c)) {
    const hp = v124HitterDisplayPenalty(c, professional, ctx);
    out += hp.delta;
    tags.push(...hp.tags);
    const highGateTags = v124HitterHighGateFailureTags(c, professional, ctx);
    if (highGateTags.length) {
      tags.push(...highGateTags);
      out -= Math.min(1.20, 0.18 * highGateTags.length);
    }
  }

  if (/Total Bases/i.test(market) && direction === "over") {
    const supportCount = [
      hitterContact >= 0.05,
      hitterPower >= 0.05,
      Number.isFinite(lineupSpot) && lineupSpot <= 6,
      oppPitcherQuality <= -0.04,
      ownOffense + runEnv >= 0.05
    ].filter(Boolean).length;
    if (supportCount < 3) { out -= 0.90; tags.push("tb_over_missing_skill_context"); }
    if (supportCount < 4 && price != null && price < -130) { out -= 0.35; tags.push("tb_over_expensive_without_full_support"); }
    if (point >= 1.5) { out -= 0.35; tags.push("tb_over_higher_line_tax"); }
  }

  if (/Total Bases/i.test(market) && direction === "under") {
    const underSupport = (Number.isFinite(lineupSpot) && lineupSpot >= 6) || hitterContact <= -0.03 || oppPitcherQuality >= 0.08 || ownOffense + runEnv <= -0.05;
    if (!underSupport) { out -= 0.22; tags.push("tb_under_lacks_context"); }
  }

  if (/Hits/i.test(market) && !/Runs|RBIs/i.test(market) && direction === "over") {
    const supportCount = [
      hitterContact >= 0.12,
      Number.isFinite(lineupSpot) && lineupSpot <= 5,
      oppPitcherQuality <= 0.05,
      ownOffense + runEnv >= 0.00,
      price == null || price >= -170
    ].filter(Boolean).length;
    if (supportCount < 4) { out -= 0.75; tags.push("hits_over_missing_contact_context"); }
  }

  if (/Hits/i.test(market) && !/Runs|RBIs/i.test(market) && direction === "under") {
    const underSupport = (Number.isFinite(lineupSpot) && lineupSpot >= 6) || oppPitcherQuality >= 0.08 || ownOffense + runEnv <= -0.05;
    const dangerousUnder = Number.isFinite(lineupSpot) && lineupSpot <= 4 && hitterContact >= 0.25;
    if (!underSupport) { out -= 0.25; tags.push("hits_under_lacks_support"); }
    if (dangerousUnder) { out -= 0.35; tags.push("elite_contact_top_order_under_risk"); }
  }

  if (/Singles/i.test(market) && direction === "under") {
    if (price != null && price < -140) { out -= 0.25; tags.push("singles_under_too_expensive"); }
    if (Number.isFinite(lineupSpot) && lineupSpot <= 4 && hitterContact >= 0.25) { out -= 0.35; tags.push("dangerous_contact_hitter_under"); }
    if (ownOffense + runEnv >= 0.25) { out -= 0.20; tags.push("high_team_total_under_risk"); }
  }

  if (/Stolen Bases/i.test(market) && direction === "over") {
    const eliteSetupCount = [
      Number.isFinite(lineupSpot) && lineupSpot <= 2,
      hitterContact >= 0.10,
      ownOffense >= 0.08,
      runEnv >= 0.00
    ].filter(Boolean).length;
    if (eliteSetupCount < 3) { out -= 1.40; tags.push("sb_over_lacks_stolen_base_setup"); }
    if (price != null && price >= 500) { out -= 0.35; tags.push("longshot_sb_over_tax"); }
    if (eliteSetupCount < 4) tags.push("sb_over_no_high_confidence");
  }

  if (/Pitcher Outs/i.test(market) && direction === "over") {
    const supportCount = [
      workload >= 0.05,
      pitcherQuality >= 0.08,
      oppOffenseDifficulty <= 0.06,
      weatherRisk < 40,
      runEnv <= 0.10
    ].filter(Boolean).length;
    if (supportCount < 5) { out -= supportCount < 4 ? 1.20 : 0.75; tags.push("outs_over_workload_not_supported"); tags.push("pitcher_outs_over_needs_elite_support"); }
    if (weatherRisk >= 40) { out -= 0.55; tags.push("weather_delay_pitcher_prop_risk"); }
  }

  if (/Pitcher Outs/i.test(market) && direction === "under") {
    const underSupport = workload <= -0.05 || oppOffenseDifficulty >= 0.12 || weatherRisk >= 40 || runEnv >= 0.10;
    if (!underSupport) { out -= 0.35; tags.push("outs_under_lacks_hook_support"); }
  }

  if (/Strikeouts/i.test(market) && direction === "over") {
    const supportCount = [
      kSkill >= 0.02,
      workload >= -0.05,
      oppOffenseDifficulty <= 0.10,
      pitcherQuality >= 0.02,
      weatherRisk < 50
    ].filter(Boolean).length;
    if (supportCount < 5) { out -= supportCount < 4 ? 1.05 : 0.55; tags.push("k_over_missing_support"); tags.push("pitcher_k_over_needs_elite_support"); }
    if (weatherRisk >= 50) { out -= 0.70; tags.push("weather_delay_pitcher_prop_risk"); }
  }

  if (/Strikeouts/i.test(market) && direction === "under") {
    const underSupport = kSkill <= -0.02 || workload <= -0.08 || oppOffenseDifficulty >= 0.12;
    if (!underSupport) { out -= 0.55; tags.push("k_under_lacks_contact_or_leash_support"); }
  }

  if (/Moneyline|Run Line/i.test(market)) {
    const supportCount = v122SupportCount({ ...c, professionalRawScore: profScore });
    if (supportCount < 4) { out -= 0.65; tags.push("side_lacks_context_edge"); }
    if (v123IsDangerPlusMoney(price) && supportCount < 5) { out -= 0.60; tags.push("plus_money_121_160_no_high_without_overwhelming_edge"); }
    if (/Run Line/i.test(market) && c?.teamSide === "home" && String(c?.bestBet || "").includes("-1.5")) { out -= 0.30; tags.push("home_favorite_run_line_bottom9_risk"); }
    if (/Run Line/i.test(market) && Number(ctx?.totalData?.line || 0) <= 7.5 && String(c?.bestBet || "").includes("-1.5")) { out -= 0.45; tags.push("favorite_run_line_low_total_risk"); }
  }

  return round2(out);
}

function applyOverconfidenceCapV122(score, c, tags) {
  let out = Number(score || 0);
  const supportCount = v122SupportCount(c);
  const isSide = ["moneyline", "runline", "f5_moneyline", "f5_runline"].includes(c?.market);
  if (isSide && Number(c?.confidenceScore || confidencePct(out)) >= 95) {
    out = Math.min(out - 0.80, 5.50);
    tags.push("side_bet_overconfidence_cap");
  }
  if (Number(c?.confidenceScore || confidencePct(out)) >= 95 && supportCount < 4) {
    out = Math.min(out - 0.70, 5.50);
    tags.push("high_score_without_context_cap");
  }
  return round2(out);
}

function hardRiskCapV122(tags) {
  const hard = [
    "invalid_pick",
    "odds_missing_or_invalid",
    "lineup_not_confirmed",
    "starting_pitcher_not_confirmed",
    "weather_delay_pitcher_prop_risk",
    "weather_delay_or_wind_risk",
    "sb_over_no_high_confidence",
    "pitcher_er_under_no_high_emergency",
    "pitcher_k_under_no_high_emergency",
    "pitcher_outs_under_no_high_emergency",
    "pitcher_prop_no_high_without_elite_alignment",
    "plus_money_121_160_no_high_without_overwhelming_edge",
    "hitter_high_requires_confirmed_lineup_v124",
    "hitter_market_not_safe_for_high_v124",
    "longshot_hitter_market_no_high_v124",
    "hitter_longshot_price_no_high_v124",
    "hitter_too_expensive_no_high_v124",
    "hitter_stretch_price_needs_elite_context_v124",
    "hitter_over_high_requires_top5_lineup_v124"
  ];
  if (safeArray(tags).some(t => hard.includes(t))) return "Medium";
  if (safeArray(tags).length >= 4) return "Medium";
  return null;
}

function scoreCandidate(c, ctx) {
  if (isInvalidCandidate(c)) {
    return addConfidenceFields({
      ...c,
      invalidPick: true,
      riskTags: ["invalid_pick"],
      impliedProb: null,
      edgePct: 0,
      valueScore: -2,
      contextScore: 0,
      professionalScore: 0,
      finalScore: -9,
      confidenceScore: 1,
      confidence: "Low",
      recommendedTiming: "Pass / invalid",
      recommendedStakeUnits: 0,
      missedHighReasons: ["invalid placeholder/missing odds candidate blocked before recommendation stream"],
      decisionMode: "Pass",
      trustFadePassDecision: "pass",
      hybridNotes: ["V12.4 invalid-pick blocker removed this candidate from trust consideration."]
    });
  }

  const implied = americanToProb(c.oddsPrice);
  const edge = implied != null && c.fairProb != null ? round2((Number(c.fairProb) - implied) * 100) : Number(c.edgePct || 0);
  const professional = buildProfessionalBetContext(c, ctx);
  const historical = getHistoricalTrustFadeScore(c, ctx, professional);

  // V12.4: split betting value from baseball/professional context, then apply risk gates before confidence.
  const baseMarketValueScore = round2(edge * 0.10 + getPriceDisciplineScore(c) * 0.72);
  const baseballContextScore = round2(getMarketShapeScore(c, ctx) * 0.95);
  const professionalContextScore = round2(Number(professional.score || 0) * 1.45);
  const completeness = getCompleteness(c, ctx);
  const impl = getImplausibilityPenalty(c, ctx);
  const riskTags = [];
  riskTags.push(...getNoBadContextTags(c, ctx, professional));

  let scored = round2(
    baseMarketValueScore +
    baseballContextScore +
    professionalContextScore +
    completeness / 155 +
    Number(historical.adjustment || 0) -
    Number(impl.penalty || 0)
  );

  scored = applyPriceDisciplineV122(c, scored, riskTags);
  scored = applyMarketSpecificRulesV122(c, ctx, professional, scored, riskTags);

  const tempForCap = { ...c, edgePct: edge, professionalScore: professionalContextScore, professionalRawScore: professional.score, valueScore: baseMarketValueScore, contextScore: baseballContextScore, professionalGateFailures: professional.gateFailures, riskTags, confidenceScore: confidencePct(scored) };
  const tempSupport = v122SupportCount(tempForCap);
  if (v123IsDangerPlusMoney(c?.oddsPrice) && tempSupport < 5) riskTags.push("plus_money_121_160_no_high_without_overwhelming_edge");
  if (c?.marketFamily === "prop" && c?.propSubType === "pitcher" && tempSupport < 5) riskTags.push("pitcher_prop_no_high_without_elite_alignment");

  scored = applyOverconfidenceCapV122(scored, tempForCap, riskTags);

  const hardCap = hardRiskCapV122(riskTags);
  const professionalCap = professional.confidenceCap || null;
  const combinedCap = hardCap === "Medium" && professionalCap !== "Low" ? "Medium" : professionalCap || hardCap;

  return addConfidenceFields({
    ...c,
    normalizedMarket: canonicalMarketLabel(c),
    direction: candidateDirection(c),
    impliedProb: implied,
    edgePct: edge,
    valueScore: baseMarketValueScore,
    contextScore: baseballContextScore,
    professionalScore: professionalContextScore,
    professionalRawScore: round2(professional.score || 0),
    professionalContext: professional,
    professionalNotes: safeArray(professional.notes),
    professionalGateFailures: safeArray(professional.gateFailures),
    professionalConfidenceCap: combinedCap,
    hitterQualityScore: professional.hitterQualityScore ?? null,
    hitterContactScore: professional.contactScore ?? null,
    hitterPowerScore: professional.powerScore ?? null,
    pitcherQualityScore: professional.pitcherQualityScore ?? null,
    opponentOffenseDifficultyScore: professional.opponentOffenseDifficultyScore ?? null,
    opponentPitcherQuality: professional.opponentPitcherQuality ?? null,
    lineupSpot: professional.lineupSpot ?? null,
    bookSource: c.bookKey || c.sourceBook || null,
    historicalTrendAdjustment: Number(historical.adjustment || 0),
    historicalTrendNotes: safeArray(historical.notes),
    historicalAntiSignalActive: !!historical.antiSignalActive,
    fadeEligible: !!historical.fadeEligible,
    riskTags: Array.from(new Set(riskTags)),
    contextSupportCount: v122SupportCount({ ...c, edgePct: edge, professionalScore: professionalContextScore, professionalRawScore: professional.score, valueScore: baseMarketValueScore, contextScore: baseballContextScore, professionalGateFailures: professional.gateFailures, riskTags }),
    implausibilityPenalty: round2(impl.penalty || 0),
    implausibilityNotes: impl.notes,
    dataCompleteness: completeness,
    scoreBeforePenalties: round2(baseMarketValueScore + baseballContextScore + professionalContextScore + completeness / 155 + Number(historical.adjustment || 0)),
    scoreAfterPenalties: scored,
    finalScore: scored,
    confidenceScore: confidencePct(scored),
    confidence: "Low",
    recommendedTiming: "Pass / monitor",
    recommendedStakeUnits: 0,
    missedHighReasons: [],
    decisionMode: "Trust Model",
    trustFadePassDecision: "trust",
    hybridNotes: []
  });
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
        sideSupport[opp] += w * 0.12;
        drivers.push(`${c.bestBet} supports ${opp} offense-vs-starter script (${round2(w * 0.12)})`);
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
        alignmentScore += 0.18;
        notes.push(`opposing starter under supports ${scenario.sideLean} side script`);
      } else {
        alignmentScore -= 0.22;
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
      alignmentScore += 0.44;
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

function rankCandidates(candidates, ctx) {
  const deduped = new Map();

  for (const c of safeArray(candidates)) {
    if (!c.bestBet || !hasValue(c.oddsPrice) || isInvalidCandidate(c)) continue;
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
  const isHitter = c.marketFamily === "prop" && c.propSubType === "hitter";
  const isPitcher = c.marketFamily === "prop" && c.propSubType === "pitcher";
  const isF5 = c.marketFamily === "f5";
  const isFull = c.marketFamily === "full";

  let high = 2.95;
  let medium = 2.05;
  let minEdgeHigh = 1.35;
  let minEdgeMedium = 0.05;
  let minCompletenessHigh = 68;

  if (isFull && c.market === "moneyline") { high = 2.90; medium = 2.00; minEdgeHigh = 1.45; }
  if (isFull && c.market === "runline") { high = 3.10; medium = 2.20; minEdgeHigh = 1.60; }
  if (isFull && c.market === "total") { high = 2.95; medium = 2.05; minEdgeHigh = 1.35; }
  if (isF5 && c.market === "f5_moneyline") { high = 3.00; medium = 2.10; minEdgeHigh = 1.45; }
  if (isF5 && c.market === "f5_runline") { high = 3.18; medium = 2.28; minEdgeHigh = 1.60; }
  if (isF5 && c.market === "f5_total") { high = 3.10; medium = 2.18; minEdgeHigh = 1.45; }
  if (isHitter) { high = 3.18; medium = 2.24; minEdgeHigh = 1.25; minEdgeMedium = 0.10; minCompletenessHigh = 70; }
  if (isPitcher) { high = 4.35; medium = 2.55; minEdgeHigh = 2.25; minEdgeMedium = 0.25; minCompletenessHigh = 78; }

  if (c.market === "total" && c.side === "under") {
    high += 0.75;
    medium += 0.25;
    minEdgeHigh += 0.35;
  }

  if (c.market === "f5_total" && c.side === "under") {
    high += 1.10;
    medium += 0.35;
    minEdgeHigh += 0.45;
  }

  if (c.market === "pitcher_strikeouts" && c.side === "under") {
    high += 2.00;
    medium += 0.35;
  }

  if (c.market === "pitcher_outs" && c.side === "under") {
    high += 2.00;
    medium += 0.35;
  }

  if (c.market === "pitcher_earned_runs" && c.side === "under") {
    high += 3.25;
    medium += 0.60;
  }

  if (c.market === "pitcher_outs" && c.side === "over") {
    high += 0.85;
  }

  if (c.market === "pitcher_strikeouts" && c.side === "over") {
    high += 0.55;
  }

  if (c.propSubType === "hitter" && c.side === "over" && (c.market === "batter_total_bases" || c.market === "batter_hits")) {
    high += c.market === "batter_total_bases" ? 0.38 : 0.25;
    medium += 0.14;
    minEdgeHigh += 0.20;
  }

  if (v124IsHitterProp(c) && v124IsLongshotHitterMarket(c)) {
    high += 2.20;
    medium += 0.80;
    minEdgeHigh += 0.70;
    minCompletenessHigh += 10;
  }

  if (v124IsHitterProp(c) && v124HitterPriceTier(c.oddsPrice) === "longshot_price") {
    high += 1.40;
    medium += 0.35;
    minEdgeHigh += 0.45;
  }

  if (Number(c.implausibilityPenalty || 0) >= 1.5) {
    high += 0.55;
    medium += 0.30;
  } else if (Number(c.implausibilityPenalty || 0) >= 0.75) {
    high += 0.25;
    medium += 0.15;
  }

  if (c.scriptAlignmentStatus === "aligned") {
    high -= 0.12;
    medium -= 0.08;
  }

  if (c.scriptAlignmentStatus === "soft_conflict") {
    high += 0.45;
    medium += 0.25;
  }

  if (safeArray(c.professionalGateFailures).length) {
    high += 0.65;
    medium += 0.22;
    minEdgeHigh += 0.20;
  }

  if (c.professionalConfidenceCap === "Medium") {
    high += 1.25;
  }

  if (c.professionalConfidenceCap === "Low") {
    high += 2.25;
    medium += 1.10;
  }

  if (c.trustFadePassDecision === "fade") {
    high -= 0.08;
  }

  if (c.trustFadePassDecision === "pass") {
    high += 1.00;
    medium += 0.45;
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
  if (Number(c.implausibilityPenalty || 0) > 0) missed.push(`implausibility penalty applied (${c.implausibilityPenalty})`);
  if (safeArray(c.professionalGateFailures).length) missed.push(`professional-context gate failed: ${safeArray(c.professionalGateFailures).join('; ')}`);
  if (c.professionalConfidenceCap) missed.push(`professional-context confidence cap: ${c.professionalConfidenceCap}`);
  if (c.historicalAntiSignalActive) missed.push("historical anti-signal matched old-model losing pattern");
  if (c.trustFadePassDecision === "pass") missed.push("hybrid layer classified original lean as Pass");
  if (safeArray(c.riskTags).length) missed.push(`V12.4 risk tags: ${safeArray(c.riskTags).join('; ')}`);
  return missed;
}

function assignBalancedConfidence(c) {
  if (!c || !c.bestBet || !hasValue(c.oddsPrice)) return "Low";
  if (c.scriptHardConflict || c.scriptConfidenceCap === "Low") return "Low";
  if (c.professionalConfidenceCap === "Low") return "Low";
  const emergencyNoHighTags = [
    "pitcher_er_under_no_high_emergency",
    "pitcher_k_under_no_high_emergency",
    "pitcher_outs_under_no_high_emergency",
    "pitcher_prop_no_high_without_elite_alignment",
    "plus_money_121_160_no_high_without_overwhelming_edge",
    "hitter_high_requires_confirmed_lineup_v124",
    "hitter_market_not_safe_for_high_v124",
    "longshot_hitter_market_no_high_v124",
    "hitter_longshot_price_no_high_v124",
    "hitter_too_expensive_no_high_v124",
    "hitter_stretch_price_needs_elite_context_v124",
    "hitter_over_high_requires_top5_lineup_v124"
  ];
  if (safeArray(c.riskTags).includes("invalid_pick") || safeArray(c.riskTags).includes("odds_missing_or_invalid")) return "Low";
  if (safeArray(c.riskTags).some(t => emergencyNoHighTags.includes(t))) return Number(c.finalScore || 0) >= candidateThresholds(c).medium ? "Medium" : "Low";
  if (c.trustFadePassDecision === "pass" && Number(c.finalScore || 0) < 3.35) return "Low";

  const t = candidateThresholds(c);
  const score = Number(c.finalScore || 0);
  const edge = Number(c.edgePct || 0);
  const completeness = Number(c.dataCompleteness || 0);

  if (score >= t.high && edge >= t.minEdgeHigh && completeness >= t.minCompletenessHigh && c.professionalConfidenceCap !== "Medium" && !safeArray(c.riskTags).length) return "High";
  if (score >= t.medium && edge >= t.minEdgeMedium) return "Medium";
  return "Low";
}

function confidenceCalibrateCandidates(ranked, ctx) {
  const prime = safeArray(ranked).map(c => {
    const thresholds = candidateThresholds(c);
    const assigned = assignBalancedConfidence(c);
    const reason = assigned === "High"
      ? `V12.4 professional-context calibration: value, baseball context, market-specific rules, no-bad-context gates, and same-game script cleared High threshold ${thresholds.high}.`
      : assigned === "Medium"
        ? `V12.4 professional-context calibration: candidate cleared Medium threshold ${thresholds.medium} but did not clear every High gate.`
        : `V12.4 professional-context calibration: candidate was capped or failed professional baseball, market-specific, invalid-pick, context, or historical gates.`;

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

  const hybrid = applyHybridTrustFadePassLayer(prime, ctx);

  return hybrid.map(c => {
    const thresholds = candidateThresholds(c);
    const assigned = assignBalancedConfidence(c);
    const mode = c.decisionMode || "Trust Model";
    const reason = assigned === "High"
      ? `V12.4 ${mode}: professional baseball context, playable price, no-bad-context review, and historical trust/fade review cleared High.`
      : assigned === "Medium"
        ? `V12.4 ${mode}: usable candidate, but one or more professional-context, risk, market-specific, or historical gates kept it below High.`
        : `V12.4 ${mode}: candidate remained Low after professional-context, market-value, risk, and trust/fade/pass review.`;
    return setConfidence({
      ...c,
      highThreshold: thresholds.high,
      mediumThreshold: thresholds.medium,
      minEdgeHigh: thresholds.minEdgeHigh,
      minEdgeMedium: thresholds.minEdgeMedium,
      minCompletenessHigh: thresholds.minCompletenessHigh,
      missedHighReasons: buildMissedHighReasons(c, thresholds)
    }, assigned, reason);
  }).map(addConfidenceFields).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
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
  if (ml.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.awayPrice, bookKey: ml.bookKey, fairProb: Number(model.awayWinProb || 50) / 100, reasons: ["Away moneyline evaluated against market price, pitcher form, recent team form, travel/rest, and environment."] });
  if (ml.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.homePrice, bookKey: ml.bookKey, fairProb: Number(model.homeWinProb || 50) / 100, reasons: ["Home moneyline evaluated against market price, pitcher form, recent team form, travel/rest, and environment."] });
  if (rl.awayPoint != null && rl.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ${formatPoint(rl.awayPoint)}`, bestBetType: "Run Line", oddsPrice: rl.awayPrice, bookKey: rl.bookKey, fairProb: clamp(Number(model.awayWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Away run line evaluated from side strength and price."] });
  if (rl.homePoint != null && rl.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ${formatPoint(rl.homePoint)}`, bestBetType: "Run Line", oddsPrice: rl.homePrice, bookKey: rl.bookKey, fairProb: clamp(Number(model.homeWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Home run line evaluated from side strength and price."] });
  if (total.line != null && total.overPrice != null && model.overConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "over", bestBet: `Over ${total.line}`, bestBetType: "Total", oddsPrice: total.overPrice, bookKey: total.bookKey, fairProb: Number(model.overConfidence || 50) / 100, reasons: ["Over evaluated against park, weather, recent offense/prevention, starters, and market total."] });
  if (total.line != null && total.underPrice != null && model.underConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "under", bestBet: `Under ${total.line}`, bestBetType: "Total", oddsPrice: total.underPrice, bookKey: total.bookKey, fairProb: Number(model.underConfidence || 50) / 100, reasons: ["Under evaluated against park, weather, recent offense/prevention, starters, and market total."] });
  return out;
}

function generateF5Candidates(ctx) {
  const out = [];
  const ml = ctx.f5MoneylineData, rl = ctx.f5RunLineData, total = ctx.f5TotalData, model = ctx.modelOutputs;
  const sideScore = Number(ctx.componentScores.side.startingPitcher || 0) + Number(ctx.componentScores.side.lineup || 0);
  const homeProb = clamp(0.5 + sideScore * 0.16, 0.34, 0.66);
  const awayProb = clamp(1 - homeProb, 0.34, 0.66);
  if (ml.awayPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_moneyline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} F5 ML`, bestBetType: "F5 Moneyline", oddsPrice: ml.awayPrice, bookKey: ml.bookKey, fairProb: awayProb, reasons: ["Away F5 moneyline emphasizes starter and lineup edge."] });
  if (ml.homePrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_moneyline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} F5 ML`, bestBetType: "F5 Moneyline", oddsPrice: ml.homePrice, bookKey: ml.bookKey, fairProb: homeProb, reasons: ["Home F5 moneyline emphasizes starter and lineup edge."] });
  if (rl.awayPoint != null && rl.awayPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_runline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} F5 ${formatPoint(rl.awayPoint)}`, bestBetType: "F5 Run Line", oddsPrice: rl.awayPrice, bookKey: rl.bookKey, fairProb: clamp(awayProb + 0.025, 0.05, 0.95), reasons: ["Away F5 run line uses starter-weighted side strength."] });
  if (rl.homePoint != null && rl.homePrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_runline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} F5 ${formatPoint(rl.homePoint)}`, bestBetType: "F5 Run Line", oddsPrice: rl.homePrice, bookKey: rl.bookKey, fairProb: clamp(homeProb + 0.025, 0.05, 0.95), reasons: ["Home F5 run line uses starter-weighted side strength."] });
  if (total.line != null && total.overPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_total", side: "over", bestBet: `F5 Over ${total.line}`, bestBetType: "F5 Total", oddsPrice: total.overPrice, bookKey: total.bookKey, fairProb: Number(model.overConfidence || 50) / 100, reasons: ["F5 over uses early-game environment and starter context."] });
  if (total.line != null && total.underPrice != null) pushCandidate(out, { marketFamily: "f5", market: "f5_total", side: "under", bestBet: `F5 Under ${total.line}`, bestBetType: "F5 Total", oddsPrice: total.underPrice, bookKey: total.bookKey, fairProb: Number(model.underConfidence || 50) / 100, reasons: ["F5 under uses early-game environment and starter context."] });
  return out;
}

function propLabel(key) {
  return {
    batter_hits: "Hits", batter_total_bases: "Total Bases", batter_home_runs: "Home Runs", batter_rbis: "RBIs",
    batter_runs_scored: "Runs Scored", batter_hits_runs_rbis: "Hits + Runs + RBIs", batter_stolen_bases: "Stolen Bases",
    batter_walks: "Walks", batter_singles: "Singles", batter_doubles: "Doubles", batter_triples: "Triples",
    pitcher_strikeouts: "Pitcher Strikeouts", pitcher_outs: "Pitcher Outs", pitcher_earned_runs: "Pitcher Earned Runs"
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

function propTilt(marketKey, side, ctx, player) {
  const env = Number(ctx.componentScores.market.runEnvironmentScore || 0);
  const high = env > 0 ? env : 0;
  const low = env < 0 ? Math.abs(env) : 0;
  const awayPitcherName = normalizeName(ctx.probablePitchers.away);
  const homePitcherName = normalizeName(ctx.probablePitchers.home);
  const playerName = normalizeName(player);
  const pitcherTeam = playerName && playerName === awayPitcherName ? "away" : playerName && playerName === homePitcherName ? "home" : null;
  const pitcherSummary = pitcherTeam ? ctx.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
  const oppTeam = pitcherTeam === "away" ? "home" : pitcherTeam === "home" ? "away" : null;
  const oppRecent = oppTeam ? Number(ctx.realWorld?.teams?.[oppTeam]?.recentOffenseScore || 0) : 0;
  const ownBullpenFresh = pitcherTeam ? Number(ctx.realWorld?.teams?.[pitcherTeam]?.bullpenFreshnessScore || 0) : 0;
  const weatherScore = Number(ctx.realWorld?.weather?.weatherScore || 0);
  if (marketKey.startsWith("pitcher_")) {
    const recent = pitcherSummary?.recent || pitcherSummary?.season || null;
    const quality = pitcherQualityScore(pitcherSummary);
    let tilt = quality * 0.55 - oppRecent * 0.35 - weatherScore * 0.25 + ownBullpenFresh * 0.18;
    if (marketKey === "pitcher_strikeouts") {
      if (recent?.k9 != null) tilt += clamp((recent.k9 - 8.6) * 0.05, -0.18, 0.22);
      tilt += low * 0.12 - high * 0.06;
      return round2(side === "over" ? tilt : -tilt);
    }
    if (marketKey === "pitcher_outs") {
      if (recent?.avgOuts != null) tilt += clamp((recent.avgOuts - 15.8) * 0.04, -0.18, 0.22);
      tilt += ownBullpenFresh * 0.25;
      return round2(side === "over" ? tilt : -tilt);
    }
    if (marketKey === "pitcher_earned_runs") {
      let erTilt = (-quality * 0.65) + oppRecent * 0.40 + weatherScore * 0.30;
      if (recent?.era != null) erTilt += clamp((recent.era - 4.0) * 0.07, -0.2, 0.25);
      return round2(side === "over" ? erTilt : -erTilt);
    }
  }
  const base = marketKey === "batter_total_bases" ? 0.14 : marketKey === "batter_home_runs" ? 0.09 : marketKey === "batter_hits_runs_rbis" ? 0.13 : 0.09;
  const homePitcherScore = Number(ctx.realWorld?.pitchers?.home?.qualityScore || 0);
  const awayPitcherScore = Number(ctx.realWorld?.pitchers?.away?.qualityScore || 0);
  const weakerPitcherBoost = round2((-1 * ((homePitcherScore + awayPitcherScore) / 2)) * 0.15);
  const hitterTilt = base + weakerPitcherBoost + weatherScore * 0.20;
  return round2(side === "over" ? hitterTilt + high * 0.16 - low * 0.05 : (hitterTilt * -0.7) + low * 0.16 - high * 0.04);
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
      const tilt = propTilt(row.marketKey, side, ctx, row.player);
      const tiltProb = clamp(0.5 + tilt * 0.18, 0.08, 0.92);
      const modelProb = propModelProbability(row.marketKey, side, row.point, ctx, row.player);
      const realWorldProb = modelProb != null ? clamp(modelProb * 0.72 + tiltProb * 0.28, 0.05, 0.95) : tiltProb;
      // V12: odds should not create prop confidence by themselves. Baseball/model probability carries most weight.
      const fairProb = clamp(realWorldProb * 0.90 + implied * 0.10, 0.05, 0.95);
      out.push({
        marketFamily: "prop", propSubType, market: row.marketKey, player: row.player, side, bookKey, point: row.point,
        bestBet: `${row.player} ${label} ${side === "over" ? "Over" : "Under"} ${row.point}`,
        bestBetType: "Prop", oddsPrice: price, fairProb: round2(fairProb), contextTilt: tilt,
        modelProb: round2(realWorldProb), reasons: [`${label} ${side} evaluated with real-world weighting before price weighting.`, `Model probability ${round2(realWorldProb * 100)}%, market implied ${round2(implied * 100)}%.`, `Pitcher/team/environment model tilt: ${round2(tilt)}`]
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

function chooseBest(filtered) {
  const high = safeArray(filtered).filter(c => c.confidence === "High").sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));
  if (high.length) return high[0];
  return safeArray(filtered).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))[0] || null;
}

function topProp(ranked) {
  const p = safeArray(ranked).find(c => c.marketFamily === "prop");
  if (!p) return null;
  return { player: p.player, market: p.market, price: p.oddsPrice, modelProb: round2(Number(p.modelProb || p.fairProb || 0.5) * 100), reasons: safeArray(p.reasons) };
}

function buildAnalysisSummary(best, ctx) {
  if (!best) return [`No playable ${ctx?.viewMode || "view"} candidate was available for this game.`];

  const lines = [];
  const scenario = ctx?.sameGameScenario || {};
  const rw = ctx?.realWorld || {};
  const priceText = `Price ${formatPrice(best.oddsPrice)} at ${best.bookSource || "playable book"} still cleared the model's value gate.`;

  if (best.decisionMode === "Fade Model") lines.push(`Hybrid decision: fade candidate against old-model anti-signal${best.fadeCandidateFor ? ` (${best.fadeCandidateFor})` : ""}.`);
  else if (best.decisionMode === "Pass") lines.push("Hybrid decision: original lean matched a historical weak pattern and was downgraded.");
  else lines.push("Hybrid decision: trust model after professional-context review.");

  if (safeArray(best.professionalNotes).length) lines.push(safeArray(best.professionalNotes)[0]);
  if (safeArray(best.historicalTrendNotes).length) lines.push(safeArray(best.historicalTrendNotes)[0]);

  if (best.marketFamily === "full" || best.marketFamily === "f5") {
    const isSide = ["moneyline", "runline", "f5_moneyline", "f5_runline"].includes(best.market);
    const isTotal = ["total", "f5_total"].includes(best.market);

    if (isSide && best.teamSide) {
      const chosenTeam = best.teamSide === "away" ? ctx.awayTeam : ctx.homeTeam;
      const otherTeam = best.teamSide === "away" ? ctx.homeTeam : ctx.awayTeam;
      const ownPitcher = best.teamSide === "away" ? ctx.probablePitchers.away : ctx.probablePitchers.home;
      const oppPitcher = best.teamSide === "away" ? ctx.probablePitchers.home : ctx.probablePitchers.away;
      const ownPitcherScore = Number(rw?.pitchers?.[best.teamSide]?.qualityScore || 0);
      const oppPitcherScore = Number(rw?.pitchers?.[best.teamSide === "away" ? "home" : "away"]?.qualityScore || 0);
      const ownRecent = Number(rw?.teams?.[best.teamSide]?.recentOffenseScore || 0) + Number(rw?.teams?.[best.teamSide]?.bullpenFreshnessScore || 0);
      const oppTravelMiles = Number(rw?.travel?.[best.teamSide === "away" ? "home" : "away"]?.travelMiles || 0);

      if (Math.abs(ownPitcherScore - oppPitcherScore) >= 0.08 && ownPitcher && oppPitcher) lines.push(`${chosenTeam} gets the stronger starter setup (${ownPitcher} vs ${oppPitcher}).`);
      else lines.push(`${chosenTeam} grades as the stronger side than ${otherTeam} in the current game model.`);

      if (ownRecent >= 0.14) lines.push(`${chosenTeam}'s recent form and bullpen context support the side.`);
      else if (oppTravelMiles >= 800) lines.push(`${otherTeam} is in a tougher travel/rest spot for this game.`);

      if (String(best.market).indexOf("runline") >= 0) lines.push(`The run-line price ${formatPrice(best.oddsPrice)} graded better than the moneyline.`);
      else lines.push(priceText);
    }

    if (isTotal) {
      const marketLine = best.market === "f5_total" ? ctx?.f5TotalData?.line : ctx?.totalData?.line;
      const fairTotal = ctx?.modelOutputs?.fairTotal;
      if (hasValue(fairTotal) && hasValue(marketLine)) lines.push(`Model total ${fairTotal} vs market ${marketLine} points ${best.side}.`);
      const env = String(ctx?.componentScores?.market?.runEnvironment || "neutral").replace(/_/g, " ");
      lines.push(`${env.charAt(0).toUpperCase() + env.slice(1)} game environment supports the ${best.side}.`);
      const weatherScore = Number(rw?.weather?.weatherScore || 0);
      if (Math.abs(weatherScore) >= 0.08) lines.push(`Weather and park context nudge this game ${best.side}.`);
      else lines.push(priceText);
    }
  }

  if (best.marketFamily === "prop") {
    if (best.propSubType === "pitcher") {
      const playerNorm = normalizeName(best.player);
      const pitcherTeam = playerNorm === normalizeName(ctx?.probablePitchers?.away) ? "away" : playerNorm === normalizeName(ctx?.probablePitchers?.home) ? "home" : null;
      const summary = pitcherTeam ? rw?.pitchers?.[pitcherTeam]?.summary : null;
      const recent = summary?.recent || summary?.season || null;

      if (best.market === "pitcher_strikeouts") {
        if (recent?.k9 != null) lines.push(`${best.player}'s recent strikeout profile points ${best.side} ${best.point}.`);
        else lines.push(`${best.player}'s workload and matchup context point ${best.side} on strikeouts.`);
      } else if (best.market === "pitcher_outs") {
        if (recent?.avgOuts != null) lines.push(`${best.player}'s recent workload points ${best.side} ${best.point} outs.`);
        else lines.push(`${best.player}'s leash/workload profile points ${best.side} on outs.`);
      } else if (best.market === "pitcher_earned_runs") {
        if (recent?.era != null) lines.push(`${best.player}'s run-prevention form points ${best.side} ${best.point} earned runs.`);
        else lines.push(`${best.player}'s matchup and environment point ${best.side} earned runs.`);
      }

      if (scenario.runLean && scenario.runLean !== "neutral") lines.push(`Same-game script leans ${scenario.runLean}, which supports this prop.`);
      lines.push(priceText);
    } else {
      const label = propLabel(best.market).toLowerCase();
      lines.push(`${best.player}'s matchup and team scoring setup support ${best.side} ${best.point} ${label}.`);
      if (scenario.runLean && scenario.runLean !== "neutral") lines.push(`Same-game script leans ${scenario.runLean}, which supports this prop.`);
      if (Number(best.implausibilityPenalty || 0) > 0) lines.push(`The model cleared this line despite Phase 1 context/alt-line penalties.`);
      else lines.push(priceText);
    }
  }

  const unique = [];
  for (const line of lines) if (line && !unique.includes(line)) unique.push(line);
  return unique.slice(0, 3);
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

function buildTrendTags(best, ctx) {
  if (!best) return [];
  const tags = [];
  tags.push(`view:${ctx.viewMode || best.marketFamily || "unknown"}`);
  tags.push(`market:${best.market || "unknown"}`);
  tags.push(`side:${best.side || "unknown"}`);
  if (best.marketFamily) tags.push(`family:${best.marketFamily}`);
  if (best.propSubType) tags.push(`prop:${best.propSubType}`);
  if (best.player) tags.push(`player:${best.player}`);
  if (ctx.sameGameScenario?.runLean) tags.push(`run_script:${ctx.sameGameScenario.runLean}`);
  if (ctx.sameGameScenario?.sideLean) tags.push(`side_script:${ctx.sameGameScenario.sideLean}`);
  if (Number(best.implausibilityPenalty || 0) > 0) tags.push("phase1_penalty");
  if (best.bookSource) tags.push(`book:${best.bookSource}`);
  if (best.decisionMode) tags.push(`decision:${String(best.decisionMode).toLowerCase().replace(/\s+/g, "_")}`);
  if (best.trustFadePassDecision) tags.push(`trust_fade_pass:${best.trustFadePassDecision}`);
  if (best.historicalAntiSignalActive) tags.push("historical_anti_signal");
  for (const rt of safeArray(best.riskTags)) tags.push(`risk:${rt}`);
  if (Number(best.hitterQualityScore || 0) !== 0 && best.hitterQualityScore != null) tags.push(`hitter_quality:${best.hitterQualityScore}`);
  if (Number(best.opponentOffenseDifficultyScore || 0) !== 0 && best.opponentOffenseDifficultyScore != null) tags.push(`opp_offense_difficulty:${best.opponentOffenseDifficultyScore}`);
  if (best.confidence === "High") tags.push("archivable_high");
  tags.push(`revision:${DASHBOARD_MODEL_REVISION.id}`);
  return tags;
}

function buildModelSnapshot(best, ctx) {
  if (!best) return null;
  return {
    dashboardRevision: DASHBOARD_MODEL_REVISION,
    best: {
      marketFamily: best.marketFamily,
      market: best.market,
      side: best.side,
      player: best.player || null,
      point: best.point || null,
      oddsPrice: best.oddsPrice,
      fairProb: best.fairProb,
      modelProb: best.modelProb,
      impliedProb: best.impliedProb,
      edgePct: best.edgePct,
      valueScore: best.valueScore,
      contextScore: best.contextScore,
      implausibilityPenalty: best.implausibilityPenalty,
      implausibilityNotes: best.implausibilityNotes,
      professionalScore: best.professionalScore,
      professionalRawScore: best.professionalRawScore,
      professionalContext: best.professionalContext,
      professionalNotes: best.professionalNotes,
      professionalGateFailures: best.professionalGateFailures,
      professionalConfidenceCap: best.professionalConfidenceCap,
      hitterQualityScore: best.hitterQualityScore,
      pitcherQualityScore: best.pitcherQualityScore,
      opponentOffenseDifficultyScore: best.opponentOffenseDifficultyScore,
      opponentPitcherQuality: best.opponentPitcherQuality,
      lineupSpot: best.lineupSpot,
      bookSource: best.bookSource,
      riskTags: best.riskTags,
      contextSupportCount: best.contextSupportCount,
      scoreBeforePenalties: best.scoreBeforePenalties,
      scoreAfterPenalties: best.scoreAfterPenalties,
      normalizedMarket: best.normalizedMarket,
      direction: best.direction,
      hitterContactScore: best.hitterContactScore,
      hitterPowerScore: best.hitterPowerScore,
      historicalTrendAdjustment: best.historicalTrendAdjustment,
      historicalTrendNotes: best.historicalTrendNotes,
      historicalAntiSignalActive: best.historicalAntiSignalActive,
      decisionMode: best.decisionMode,
      trustFadePassDecision: best.trustFadePassDecision,
      fadeCandidateFor: best.fadeCandidateFor,
      hybridNotes: best.hybridNotes,
      finalScore: best.finalScore,
      confidence: best.confidence,
      highThreshold: best.highThreshold,
      mediumThreshold: best.mediumThreshold,
      missedHighReasons: best.missedHighReasons
    },
    game: {
      away: ctx.awayTeam,
      home: ctx.homeTeam,
      probablePitchers: ctx.probablePitchers,
      componentScores: ctx.componentScores,
      modelOutputs: ctx.modelOutputs,
      sameGameScenario: ctx.sameGameScenario,
      marketAvailability: ctx.marketAvailability,
      realWorld: ctx.realWorld
    }
  };
}

function buildGameResponse(event, ctx, ranked, filtered, viewMode) {
  ctx.viewMode = viewMode;
  const best = chooseBest(filtered);
  const full = ranked.filter(c => c.marketFamily === "full");
  const f5 = ranked.filter(c => c.marketFamily === "f5");
  const prop = topProp(ranked);
  const away = event.away_team;
  const home = event.home_team;
  const id = event.id || `${normalizeName(away)}-at-${normalizeName(home)}`;
  const analysisSummary = buildAnalysisSummary(best, { ...ctx, viewMode });
  const analysisSummaryText = analysisSummary.join(" • ");
  const trendTags = buildTrendTags(best, { ...ctx, viewMode });
  const modelSnapshot = buildModelSnapshot(best, { ...ctx, viewMode });

  const game = {
    id, eventId: id, rawCommenceTime: event.commence_time || null, time: formatEtDateTime(event.commence_time), away, home, viewMode,
    dashboardRevision: DASHBOARD_MODEL_REVISION,
    dashboardRevisionId: DASHBOARD_MODEL_REVISION.id,
    dashboardRevisionDate: DASHBOARD_MODEL_REVISION.date,
    dashboardRevisionLabel: DASHBOARD_MODEL_REVISION.label,
    probablePitchers: ctx.probablePitchers,
    lineupMode: ctx.realWorld?.hitters?.lineupStatus || "projected",
    lineupSource: ctx.realWorld?.hitters?.lineupStatus ? "MLB live feed lineup/player context when available" : "Probable pitchers + static team context",

    moneyline: ctx.moneylineData.awayPrice != null || ctx.moneylineData.homePrice != null ? `${away} ${formatPrice(ctx.moneylineData.awayPrice)} | ${home} ${formatPrice(ctx.moneylineData.homePrice)}` : "N/A",
    runLine: ctx.spreadData.awayPoint != null || ctx.spreadData.homePoint != null ? `${away} ${formatPoint(ctx.spreadData.awayPoint)} (${formatPrice(ctx.spreadData.awayPrice)}) | ${home} ${formatPoint(ctx.spreadData.homePoint)} (${formatPrice(ctx.spreadData.homePrice)})` : "N/A",
    total: ctx.totalData.line != null ? `Over ${ctx.totalData.line} ${formatPrice(ctx.totalData.overPrice)} | Under ${ctx.totalData.line} ${formatPrice(ctx.totalData.underPrice)}` : "N/A",
    firstFiveMoneyline: ctx.f5MoneylineData.awayPrice != null || ctx.f5MoneylineData.homePrice != null ? `${away} ${formatPrice(ctx.f5MoneylineData.awayPrice)} | ${home} ${formatPrice(ctx.f5MoneylineData.homePrice)}` : "N/A",
    firstFiveRunLine: ctx.f5RunLineData.awayPoint != null || ctx.f5RunLineData.homePoint != null ? `${away} F5 ${formatPoint(ctx.f5RunLineData.awayPoint)} (${formatPrice(ctx.f5RunLineData.awayPrice)}) | ${home} F5 ${formatPoint(ctx.f5RunLineData.homePoint)} (${formatPrice(ctx.f5RunLineData.homePrice)})` : "N/A",
    firstFiveTotal: ctx.f5TotalData.line != null ? `Over ${ctx.f5TotalData.line} ${formatPrice(ctx.f5TotalData.overPrice)} | Under ${ctx.f5TotalData.line} ${formatPrice(ctx.f5TotalData.underPrice)}` : "N/A",

    bestBet: best ? best.bestBet : "Pass",
    bestBetType: best ? best.bestBetType : "Pass",
    bestBetOdds: best ? best.oddsPrice : null,
    bestBetBook: best ? best.bookSource || null : null,
    bookSource: best ? best.bookSource || null : null,
    decisionMode: best ? best.decisionMode || "Trust Model" : "Pass",
    trustFadePassDecision: best ? best.trustFadePassDecision || "trust" : "pass",
    fadeCandidateFor: best ? best.fadeCandidateFor || null : null,
    professionalScore: best ? best.professionalScore || 0 : 0,
    professionalRawScore: best ? best.professionalRawScore || 0 : 0,
    professionalNotes: best ? safeArray(best.professionalNotes) : [],
    professionalGateFailures: best ? safeArray(best.professionalGateFailures) : [],
    professionalContext: best ? best.professionalContext || null : null,
    historicalTrendNotes: best ? safeArray(best.historicalTrendNotes) : [],
    hybridNotes: best ? safeArray(best.hybridNotes) : [],
    confidence: best ? best.confidence : "Low",
    confidenceScore: best ? best.confidenceScore : 0,
    pickScore: best ? Number(best.confidenceScore || 0) : 0,
    modelScore: best ? Number(best.finalScore || 0) : 0,
    recommendedTiming: best ? best.recommendedTiming : "Monitor market",
    recommendedStakeUnits: best ? best.recommendedStakeUnits : 0,
    reasons: best ? safeArray(best.reasons) : [`No valid ${viewMode} market candidate was available for this game.`],
    analysisSummary,
    analysisSummaryText,
    trendTags,
    modelSnapshot,

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
      ...(ctx.realWorld?.weather?.precipProb != null && ctx.realWorld.weather.precipProb >= 40 ? ["Weather risk is elevated."] : []),
      ...(ctx.realWorld?.travel?.away?.travelMiles != null && ctx.realWorld.travel.away.travelMiles >= 800 ? ["Away team travel load is elevated."] : []),
      "Lineups are projected, not confirmed."
    ],
    parkFactor: ctx.componentScores.market.parkFactor,
    marketAvailability: ctx.marketAvailability,
    debug: {
      confidenceGuarantee: "V12.4 does not blanket-promote every playable row. High requires emergency-recalibrated score/edge/completeness/script gates.",
      selectedBest: best ? {
        bestBet: best.bestBet, confidence: best.confidence, finalScore: best.finalScore, edgePct: best.edgePct,
        dataCompleteness: best.dataCompleteness, conflictPenalty: best.conflictPenalty, conflictReason: best.conflictReason,
        implausibilityPenalty: best.implausibilityPenalty, implausibilityNotes: best.implausibilityNotes,
        missedHighReasons: best.missedHighReasons,
        pickScore: best.confidenceScore, modelScore: best.finalScore
      } : null,
      propDiagnostics: ctx.propDiagnostics,
      sameGameScenario: ctx.sameGameScenario || null,
      realWorld: ctx.realWorld || null,
      topCandidates: ranked.slice(0, 14).map(c => ({
        bestBet: c.bestBet, bestBetType: c.bestBetType, marketFamily: c.marketFamily, propSubType: c.propSubType || null,
        oddsPrice: c.oddsPrice, edgePct: c.edgePct, finalScore: c.finalScore, confidence: c.confidence,
        conflictPenalty: c.conflictPenalty, conflictReason: c.conflictReason, implausibilityPenalty: c.implausibilityPenalty,
        implausibilityNotes: c.implausibilityNotes, slateRank: c.slateRank
      }))
    }
  };

  return addConfidenceFields(game);
}

function promoteHitterPropsOnePerGame(g, viewMode) {
  // V12.4: restore controlled hitter-prop coverage without blindly forcing every game to High.
  // One hitter candidate is still displayed; it can be promoted only if confirmed context, lineup spot, price, edge, and player-quality gates clear.
  if (!g || viewMode !== "hitter_props") return addConfidenceFields(g);

  const playable = g.bestBet && g.bestBet !== "Pass" && hasValue(g.bestBetOdds);
  const existingHigh = g.confidence === "High";
  const eligibleRestore = playable && !existingHigh && v123HitterQualityGate(g);
  const base = {
    ...g,
    trendTags: Array.from(new Set(safeArray(g.trendTags).concat(playable ? ["v12_4_hitter_best_candidate_displayed"] : ["v12_4_no_playable_hitter_prop"]))),
    confidenceForceDebug: {
      forceRan: !!eligibleRestore,
      calibrationMode: "v12_4_controlled_hitter_restoration",
      viewMode,
      reason: eligibleRestore
        ? "V12.4 restored this hitter prop to High only after lineup, edge, player-quality, and risk gates cleared."
        : playable
          ? "One hitter-prop candidate is displayed for the game, but V12.4 only promotes it when controlled quality gates clear."
          : "No hitter-prop candidate was playable for this game."
    }
  };

  if (eligibleRestore) {
    return setConfidence({
      ...base,
      finalScore: Math.max(Number(base.finalScore || 0), 3.12),
      confidenceScore: Math.max(Number(base.confidenceScore || 0), 72),
      recommendedStakeUnits: 1,
      decisionMode: "V12.4 Controlled Hitter Restore",
      trustFadePassDecision: "trust",
      reasons: safeArray(base.reasons).concat(["V12.4 controlled hitter-prop restoration: confirmed/top-order hitter context and playable edge restored this candidate to High."])
    }, "High", "V12.4 controlled hitter-prop restoration cleared High gates.");
  }

  return addConfidenceFields(base);
}

function selectOnePerGameView(games, viewMode) {
  return safeArray(games).map(g => {
    if (viewMode === "hitter_props") return promoteHitterPropsOnePerGame(g, viewMode);
    return addConfidenceFields({
      ...g,
      confidenceForceDebug: {
        forceRan: false,
        calibrationMode: "v12_4_true_confidence_all_views",
        viewMode,
        reason: "V12.4 uses true confidence after professional-context, market-specific, and no-bad-context gates. No view is forcibly promoted to High."
      }
    });
  });
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

async function buildGameContext(event, apiKey, scheduleGames, viewMode, oddsDiagnostics, enrichments) {
  const detailed = await fetchEventMarkets(event.id, apiKey, ALL_MARKETS, oddsDiagnostics, "event_all_markets");
  const merged = mergeEvents(event, detailed);
  const scheduleMatch = findScheduleMatch(event, scheduleGames);
  const away = event.away_team;
  const home = event.home_team;

  const season = seasonYearFromIso(event.commence_time);
  const pitcherCache = enrichments?.pitcherCache || new Map();
  const weatherCache = enrichments?.weatherCache || new Map();
  const lineupCache = enrichments?.lineupCache || new Map();
  const recentLeagueContext = enrichments?.recentLeagueContext || {};

  const awayPitcherSummaryPromise = fetchPitcherRecentSummary(scheduleMatch?.awayProbablePitcherId || null, season, pitcherCache);
  const homePitcherSummaryPromise = fetchPitcherRecentSummary(scheduleMatch?.homeProbablePitcherId || null, season, pitcherCache);
  const weatherPromise = fetchWeatherContext(home, event.commence_time, weatherCache);
  const hitterLineupPromise = fetchGameLineupContext(scheduleMatch?.gamePk || null, season, lineupCache);

  const [awayPitcherSummary, homePitcherSummary, weather, hitterLineups] = await Promise.all([
    awayPitcherSummaryPromise,
    homePitcherSummaryPromise,
    weatherPromise,
    hitterLineupPromise
  ]);

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
    realWorld: {
      pitchers: {
        away: { summary: awayPitcherSummary, qualityScore: pitcherQualityScore(awayPitcherSummary) },
        home: { summary: homePitcherSummary, qualityScore: pitcherQualityScore(homePitcherSummary) }
      },
      teams: {
        away: recentLeagueContext[normalizeTeamName(away)] || { recentOffenseScore: 0, recentPreventionScore: 0, bullpenFreshnessScore: 0 },
        home: recentLeagueContext[normalizeTeamName(home)] || { recentOffenseScore: 0, recentPreventionScore: 0, bullpenFreshnessScore: 0 }
      },
      hitters: hitterLineups,
      travel: {
        away: buildTravelRestContext(away, home, event.commence_time, recentLeagueContext),
        home: buildTravelRestContext(home, home, event.commence_time, recentLeagueContext)
      },
      weather
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
    const [oddsBundle, scheduleGames, recentLeagueGames] = await Promise.all([
      fetchFeaturedOddsBundle(apiKey).catch(err => ({
        events: [],
        diagnostics: {
          mode: "v8_odds_ingestion_diagnostics",
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
      fetchScheduleWindow().catch(() => []),
      fetchRecentLeagueScheduleWindow().catch(() => [])
    ]);

    const oddsEvents = safeArray(oddsBundle.events);
    const oddsDiagnostics = oddsBundle.diagnostics || { mode: "v8_odds_ingestion_diagnostics", oddsRequests: [], oddsApiErrors: [] };
    oddsDiagnostics.scheduleGameCount = safeArray(scheduleGames).length;
    const recentLeagueContext = buildRecentLeagueContext(recentLeagueGames);
    const enrichments = { recentLeagueContext, pitcherCache: new Map(), weatherCache: new Map(), lineupCache: new Map() };

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
        const built = await buildGameContext(event, apiKey, scheduleGames, viewMode, oddsDiagnostics, enrichments);
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
          dashboardRevision: DASHBOARD_MODEL_REVISION,
          dashboardRevisionId: DASHBOARD_MODEL_REVISION.id,
          dashboardRevisionDate: DASHBOARD_MODEL_REVISION.date,
          dashboardRevisionLabel: DASHBOARD_MODEL_REVISION.label,
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
          debug: { error: err.message, dashboardRevision: DASHBOARD_MODEL_REVISION }
        }));
      }
    }

    const calibratedGames = selectOnePerGameView(games, viewMode);
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
      calibrationMode: "v12_4_professional_context_recalibration",
      dashboardRevision: DASHBOARD_MODEL_REVISION,
      oddsDiagnostics
    });
  } catch (err) {
    return res.status(500).json({ games: [], error: "Dashboard build failed", details: err.message, mode: viewMode, dashboardRevision: DASHBOARD_MODEL_REVISION });
  }
};