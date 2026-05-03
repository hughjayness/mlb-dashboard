// api/archive-list.js
// Stronger archive list route.
// Dedupe identity is matchup + first-pitch minute + normalized view mode.

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function pick(row, snake, camel) {
  if (hasValue(row[snake])) return row[snake];
  if (camel && hasValue(row[camel])) return row[camel];
  return null;
}

function norm(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value) {
  return String(value == null ? "" : value).toLowerCase();
}

function timeKey(value) {
  if (!hasValue(value)) return "";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16);
  return String(value).slice(0, 16);
}

function parseMatchup(row) {
  const away = pick(row, "away") || "";
  const home = pick(row, "home") || "";

  if (away && home) return { away, home };

  const matchup = pick(row, "matchup") || "";
  const parts = String(matchup).split("@");

  if (parts.length === 2) {
    return {
      away: parts[0].trim(),
      home: parts[1].trim()
    };
  }

  return { away, home };
}

function joinedText(row) {
  return [
    pick(row, "view_mode", "viewMode"),
    pick(row, "best_bet", "bestBet"),
    pick(row, "best_bet_type", "bestBetType"),
    pick(row, "market_key", "marketKey"),
    pick(row, "prop_market", "propMarket"),
    pick(row, "prop_sub_type", "propSubType"),
    pick(row, "market_family", "marketFamily"),
    pick(row, "player_name", "playerName")
  ].map(lower).join(" | ");
}

function inferPropViewMode(row) {
  const text = joinedText(row);

  if (
    text.includes("pitcher") ||
    text.includes("strikeout") ||
    text.includes("strikeouts") ||
    text.includes("outs") ||
    text.includes("earned runs") ||
    text.includes("pitcher_")
  ) {
    return "pitcher_props";
  }

  return "hitter_props";
}

function normalizeViewMode(row) {
  const raw = lower(pick(row, "view_mode", "viewMode")).trim();
  const text = joinedText(row);

  if (raw === "pitcher_props") return "pitcher_props";
  if (raw === "hitter_props") return "hitter_props";
  if (raw === "props" || raw === "prop") return inferPropViewMode(row);

  if (
    text.includes("pitcher_") ||
    text.includes("pitcher strikeouts") ||
    text.includes("pitcher outs") ||
    text.includes("pitcher earned runs")
  ) {
    return "pitcher_props";
  }

  if (
    text.includes("batter_") ||
    text.includes("total bases") ||
    text.includes("stolen bases") ||
    text.includes("hits + runs + rbis") ||
    text.includes("home runs") ||
    text.includes("runs scored") ||
    text.includes("walks") ||
    text.includes("singles") ||
    text.includes("doubles") ||
    text.includes("triples")
  ) {
    return "hitter_props";
  }

  if (
    raw === "f5" ||
    text.includes(" f5 ") ||
    text.startsWith("f5 ") ||
    text.includes("f5 moneyline") ||
    text.includes("f5 run line") ||
    text.includes("f5 total")
  ) {
    return "f5";
  }

  return "full";
}

function canonicalKeyForRow(row) {
  const teams = parseMatchup(row);
  const awayKey = norm(teams.away);
  const homeKey = norm(teams.home);
  const startKey = timeKey(pick(row, "raw_commence_time", "rawCommenceTime"));
  const viewMode = normalizeViewMode(row);

  if (awayKey && homeKey && startKey && viewMode) {
    return ["gameview", awayKey, homeKey, startKey, viewMode].join("|");
  }

  const eventId = pick(row, "event_id", "eventId") || "";
  if (eventId && startKey && viewMode) {
    return ["eventview", eventId, startKey, viewMode].join("|");
  }

  return pick(row, "archive_id", "archiveId") || "";
}

function isGraded(row) {
  const grade = String(row.grade || "").trim();
  return grade === "Win" || grade === "Loss" || grade === "Push" || grade === "Tie";
}

function rowTime(row) {
  const archivedAt = new Date(pick(row, "archived_at", "archivedAt") || 0).getTime();
  if (Number.isFinite(archivedAt) && archivedAt > 0) return archivedAt;

  const raw = new Date(pick(row, "raw_commence_time", "rawCommenceTime") || 0).getTime();
  if (Number.isFinite(raw) && raw > 0) return raw;

  return 0;
}

function richnessScore(row) {
  let score = 0;

  if (hasValue(row.best_bet)) score += 1;
  if (hasValue(row.best_bet_type)) score += 1;
  if (hasValue(row.confidence)) score += 1;
  if (hasValue(row.score)) score += 1;
  if (hasValue(row.odds_price)) score += 1;
  if (hasValue(row.result_status)) score += 1;
  if (hasValue(row.result_detail)) score += 2;
  if (hasValue(row.net_units)) score += 1;
  if (hasValue(row.profit_dollars)) score += 1;
  if (hasValue(row.model_snapshot)) score += 3;
  if (hasValue(row.trend_tags)) score += 2;
  if (hasValue(row.player_name)) score += 1;
  if (hasValue(row.market_key)) score += 1;
  if (hasValue(row.bet_direction)) score += 1;
  if (hasValue(row.edge_pct)) score += 1;
  if (hasValue(row.final_score)) score += 1;
  if (hasValue(row.model_prob)) score += 1;

  return score;
}

function betterRow(a, b) {
  if (!a) return b;
  if (!b) return a;

  const aGraded = isGraded(a);
  const bGraded = isGraded(b);

  if (aGraded && !bGraded) return a;
  if (bGraded && !aGraded) return b;

  const aDetail = hasValue(a.result_detail);
  const bDetail = hasValue(b.result_detail);

  if (aDetail && !bDetail) return a;
  if (bDetail && !aDetail) return b;

  const aRich = richnessScore(a);
  const bRich = richnessScore(b);

  if (aRich > bRich) return a;
  if (bRich > aRich) return b;

  return rowTime(a) >= rowTime(b) ? a : b;
}

function normalizeReturnedRow(row) {
  const canonicalKey = canonicalKeyForRow(row);
  const viewMode = normalizeViewMode(row);

  return {
    ...row,
    archive_id: canonicalKey,
    view_mode: viewMode
  };
}

function dedupeRows(rows) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = canonicalKeyForRow(row);
    if (!key) continue;

    map.set(key, betterRow(map.get(key), row));
  }

  return Array.from(map.values())
    .map(normalizeReturnedRow)
    .sort(function(a, b) {
      return rowTime(b) - rowTime(a);
    });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      });
    }

    const response = await fetch(
      url.replace(/\/$/, "") + "/rest/v1/archive_picks?select=*&order=raw_commence_time.desc.nullslast,archived_at.desc.nullslast",
      {
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          Accept: "application/json"
        }
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: text });
    }

    let rows = [];
    try {
      rows = JSON.parse(text);
    } catch (_) {
      rows = [];
    }

    const dedupedRows = dedupeRows(rows);

    return res.status(200).json({
      ok: true,
      mode: "matchup_time_view_dedupe",
      rawRowCount: rows.length,
      rowCount: dedupedRows.length,
      removedDuplicateCount: Math.max(0, rows.length - dedupedRows.length),
      rows: dedupedRows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};