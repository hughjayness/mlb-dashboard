// api/dashboard.js
// Full replacement V9: rebalanced real-world weighting, alt-line plausibility filters, tighter prop selection, and same-game scenario arbitration.
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
const PITCHER_PROP_MARKETS = ["pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs"];
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
      lineup: "projected",
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

function getImplausibilityPenalty(c, ctx) {
  let penalty = 0;
  const notes = [];
  const point = Number(c?.point);

  if (c?.marketFamily === "prop" && c?.propSubType === "hitter") {
    if (c.market === "batter_total_bases" && c.side === "over") {
      if (point >= 4.5) { penalty += 2.45; notes.push("very aggressive total-bases alt line"); }
      else if (point >= 3.5) { penalty += 1.95; notes.push("aggressive total-bases alt line"); }
      else if (point >= 2.5) { penalty += 0.90; notes.push("elevated total-bases line"); }
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
    const pitcherTeam = normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.away) ? "away"
      : normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.home) ? "home" : null;
    const summary = pitcherTeam ? ctx?.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
    const expected = pitcherExpectedStrikeouts(summary);
    const recent = summary?.recent?.games ? summary.recent : summary?.season;
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
    const pitcherTeam = normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.away) ? "away"
      : normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.home) ? "home" : null;
    const summary = pitcherTeam ? ctx?.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
    const expected = pitcherExpectedOuts(summary);
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
    const pitcherTeam = normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.away) ? "away"
      : normalizeName(c.player) === normalizeName(ctx?.probablePitchers?.home) ? "home" : null;
    const summary = pitcherTeam ? ctx?.realWorld?.pitchers?.[pitcherTeam]?.summary : null;
    const expected = pitcherExpectedEarnedRuns(summary);
    if (expected != null) {
      if (c.side === "over" && point >= expected + 1.0) { penalty += 0.85; notes.push("earned-runs over above recent expectation"); }
      if (c.side === "under" && point <= expected - 1.0) { penalty += 0.65; notes.push("earned-runs under below recent expectation"); }
    }
  }

  return { penalty: round2(penalty), notes };
}

function scoreCandidate(c, ctx) {
  const implied = americanToProb(c.oddsPrice);
  const edge = implied != null && c.fairProb != null ? round2((Number(c.fairProb) - implied) * 100) : Number(c.edgePct || 0);
  const marketValueScore = round2(edge * 0.14 + getPriceDisciplineScore(c));
  const baseballContextScore = round2(getMarketShapeScore(c, ctx) * 1.35);
  const completeness = getCompleteness(c, ctx);
  const impl = getImplausibilityPenalty(c, ctx);
  const finalScore = round2(marketValueScore + baseballContextScore + completeness / 140 - Number(impl.penalty || 0));
  return addConfidenceFields({
    ...c,
    impliedProb: implied,
    edgePct: edge,
    valueScore: marketValueScore,
    contextScore: baseballContextScore,
    implausibilityPenalty: round2(impl.penalty || 0),
    implausibilityNotes: impl.notes,
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
  if (isF5 && c.market === "f5_total") { high = 3.00; medium = 2.10; minEdgeHigh = 1.40; }
  if (isHitter) { high = 3.35; medium = 2.35; minEdgeHigh = 1.55; minEdgeMedium = 0.20; minCompletenessHigh = 72; }
  if (isPitcher) { high = 3.20; medium = 2.25; minEdgeHigh = 1.45; minEdgeMedium = 0.15; minCompletenessHigh = 72; }

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
  // V10: same-game logic remains active, but High confidence is only allowed after rebalanced real-world-over-odds scoring.
  // Candidates must clear score, edge, completeness, and script-alignment gates.
  const arr = safeArray(ranked).map(c => {
    const thresholds = candidateThresholds(c);
    const assigned = assignBalancedConfidence(c);
    const reason = assigned === "High"
      ? `V10 balanced calibration: candidate cleared High threshold ${thresholds.high}, edge minimum ${thresholds.minEdgeHigh}, and same-game script review.`
      : assigned === "Medium"
        ? `V10 balanced calibration: candidate cleared Medium threshold ${thresholds.medium} but did not clear all High gates.`
        : `V10 balanced calibration: candidate did not clear High/Medium gates or was capped by same-game script review.`;

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
  if (ml.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.awayPrice, fairProb: Number(model.awayWinProb || 50) / 100, reasons: ["Away moneyline evaluated against market price, pitcher form, recent team form, travel/rest, and environment."] });
  if (ml.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "moneyline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ML`, bestBetType: "Moneyline", oddsPrice: ml.homePrice, fairProb: Number(model.homeWinProb || 50) / 100, reasons: ["Home moneyline evaluated against market price, pitcher form, recent team form, travel/rest, and environment."] });
  if (rl.awayPoint != null && rl.awayPrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "away", teamSide: "away", bestBet: `${ctx.awayTeam} ${formatPoint(rl.awayPoint)}`, bestBetType: "Run Line", oddsPrice: rl.awayPrice, fairProb: clamp(Number(model.awayWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Away run line evaluated from side strength and price."] });
  if (rl.homePoint != null && rl.homePrice != null) pushCandidate(out, { marketFamily: "full", market: "runline", side: "home", teamSide: "home", bestBet: `${ctx.homeTeam} ${formatPoint(rl.homePoint)}`, bestBetType: "Run Line", oddsPrice: rl.homePrice, fairProb: clamp(Number(model.homeWinProb || 50) / 100 + 0.035, 0.05, 0.95), reasons: ["Home run line evaluated from side strength and price."] });
  if (total.line != null && total.overPrice != null && model.overConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "over", bestBet: `Over ${total.line}`, bestBetType: "Total", oddsPrice: total.overPrice, fairProb: Number(model.overConfidence || 50) / 100, reasons: ["Over evaluated against park, weather, recent offense/prevention, starters, and market total."] });
  if (total.line != null && total.underPrice != null && model.underConfidence != null) pushCandidate(out, { marketFamily: "full", market: "total", side: "under", bestBet: `Under ${total.line}`, bestBetType: "Total", oddsPrice: total.underPrice, fairProb: Number(model.underConfidence || 50) / 100, reasons: ["Under evaluated against park, weather, recent offense/prevention, starters, and market total."] });
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
      const fairProb = clamp(realWorldProb * 0.72 + implied * 0.28, 0.05, 0.95);
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

function chooseBest(filtered) { return safeArray(filtered).sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0))[0] || null; }

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
  const priceText = `Price ${formatPrice(best.oddsPrice)} still cleared the model's value gate.`;

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

      if (Math.abs(ownPitcherScore - oppPitcherScore) >= 0.08 && ownPitcher && oppPitcher) {
        lines.push(`${chosenTeam} gets the stronger starter setup (${ownPitcher} vs ${oppPitcher}).`);
      } else {
        lines.push(`${chosenTeam} grades as the stronger side than ${otherTeam} in the current game model.`);
      }

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
      if (Number(best.implausibilityPenalty || 0) > 0) lines.push(`The model still cleared this line despite a tougher alt-line penalty.`);
      else lines.push(priceText);
    }
  }

  const unique = [];
  for (const line of lines) {
    if (line && !unique.includes(line)) unique.push(line);
  }
  return unique.slice(0, 3);
}

function buildAnalysisSummaryText(best, ctx) {
  return buildAnalysisSummary(best, ctx).join(" • ");
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
  const analysisSummary = buildAnalysisSummary(best, { ...ctx, viewMode });
  const analysisSummaryText = analysisSummary.join(" • ");

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
    pickScore: best ? Number(best.confidenceScore || 0) : 0,
    modelScore: best ? Number(best.finalScore || 0) : 0,
    recommendedTiming: best ? best.recommendedTiming : "Monitor market",
    recommendedStakeUnits: best ? best.recommendedStakeUnits : 0,
    reasons: best ? safeArray(best.reasons) : [`No valid ${viewMode} market candidate was available for this game.`],
    analysisSummary,
    analysisSummaryText,

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
      confidenceGuarantee: "Backend assigns High/Medium from ranked valid candidates after fake-zero guards. High is no longer purely threshold-based.",
      selectedBest: best ? {
        bestBet: best.bestBet, confidence: best.confidence, finalScore: best.finalScore, edgePct: best.edgePct,
        dataCompleteness: best.dataCompleteness, conflictPenalty: best.conflictPenalty, conflictReason: best.conflictReason,
        pickScore: best.confidenceScore, modelScore: best.finalScore
      } : null,
      propDiagnostics: ctx.propDiagnostics,
      sameGameScenario: ctx.sameGameScenario || null,
      realWorld: ctx.realWorld || null,
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
  // V10 final lock: do not force High confidence. Keep backend calibration, but expose every game's best playable pick with score + concise reasons.
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
        calibrationMode: "v10_game_pick_scores_and_reason_summary",
        viewMode,
        playableRows: 0,
        reason: "No non-Pass bestBet rows existed for this view. This is candidate/prop parsing, not confidence gating."
      }
    }));
  }

  for (const g of playable) {
    if (g.debug?.selectedBest?.scriptHardConflict || g.debug?.selectedBest?.scriptConfidenceCap === "Low") {
      Object.assign(g, setConfidence(g, "Low", "V9 final check: hard same-game conflict remains capped at Low."));
    }
  }

  const highRows = playable
    .filter(g => g.confidence === "High")
    .sort((a, b) => Number(b.debug?.selectedBest?.finalScore ?? b.confidenceScore ?? 0) - Number(a.debug?.selectedBest?.finalScore ?? a.confidenceScore ?? 0));

  const maxHigh = Math.max(1, Math.floor(playable.length * 0.20));
  const demotedHigh = [];
  if (highRows.length > maxHigh) {
    for (const g of highRows.slice(maxHigh)) {
      demotedHigh.push(g.bestBet);
      Object.assign(g, setConfidence(
        g,
        "Medium",
        `V9 final check: demoted from High to Medium to prevent slate-level High overload. Max High for ${viewMode}: ${maxHigh}.`
      ));
    }
  }

  return arr.map(g => addConfidenceFields({
    ...g,
    confidenceForceDebug: {
      forceRan: true,
      calibrationMode: "v10_game_pick_scores_and_reason_summary",
      viewMode,
      playableRows: playable.length,
      highRowsBeforeSlateCap: highRows.length,
      maxHighRowsAllowed: maxHigh,
      demotedHighBets: demotedHigh,
      reason: "V9 trusts candidate-level thresholds after real-world-over-odds reweighting and same-game arbitration. It does not force a High row when no candidate earns one.",
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

async function buildGameContext(event, apiKey, scheduleGames, viewMode, oddsDiagnostics, enrichments) {
  const detailed = await fetchEventMarkets(event.id, apiKey, ALL_MARKETS, oddsDiagnostics, "event_all_markets");
  const merged = mergeEvents(event, detailed);
  const scheduleMatch = findScheduleMatch(event, scheduleGames);
  const away = event.away_team;
  const home = event.home_team;

  const season = seasonYearFromIso(event.commence_time);
  const pitcherCache = enrichments?.pitcherCache || new Map();
  const weatherCache = enrichments?.weatherCache || new Map();
  const recentLeagueContext = enrichments?.recentLeagueContext || {};

  const awayPitcherSummaryPromise = fetchPitcherRecentSummary(scheduleMatch?.awayProbablePitcherId || null, season, pitcherCache);
  const homePitcherSummaryPromise = fetchPitcherRecentSummary(scheduleMatch?.homeProbablePitcherId || null, season, pitcherCache);
  const weatherPromise = fetchWeatherContext(home, event.commence_time, weatherCache);

  const [awayPitcherSummary, homePitcherSummary, weather] = await Promise.all([
    awayPitcherSummaryPromise,
    homePitcherSummaryPromise,
    weatherPromise
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
    const enrichments = { recentLeagueContext, pitcherCache: new Map(), weatherCache: new Map() };

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
      calibrationMode: "v10_game_pick_scores_and_reason_summary",
      oddsDiagnostics
    });
  } catch (err) {
    return res.status(500).json({ games: [], error: "Dashboard build failed", details: err.message, mode: viewMode });
  }
};
