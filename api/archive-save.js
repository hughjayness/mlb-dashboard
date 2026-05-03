// api/archive-list.js
// Strong Option B archive list route.
// Returns one row per event + first pitch + normalized view group.
// Old "props" rows are normalized into hitter_props or pitcher_props before dedupe.

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function normalizePart(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function lowerText(value) {
  return String(value == null ? "" : value).toLowerCase();
}

function pick(row, snake, camel) {
  if (hasValue(row[snake])) return row[snake];
  if (camel && hasValue(row[camel])) return row[camel];
  return null;
}

function joinedRowText(row) {
  return [
    pick(row, "view_mode", "viewMode"),
    pick(row, "best_bet", "bestBet"),
    pick(row, "best_bet_type", "bestBetType"),
    pick(row, "market_key", "marketKey"),
    pick(row, "prop_market", "propMarket"),
    pick(row, "prop_sub_type", "propSubType"),
    pick(row, "market_family", "marketFamily"),
    pick(row, "player_name", "playerName")
  ].map(lowerText).join(" | ");
}

function inferPropViewMode(row) {
  const text = joinedRowText(row);

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

  if (
    text.includes("batter_") ||
    text.includes("total bases") ||
    text.includes("hits + runs + rbis") ||
    text.includes("hits+runs+rbis") ||
    text.includes("h+r+rbi") ||
    text.includes(" rbis") ||
    text.includes("runs scored") ||
    text.includes("stolen bases") ||
    text.includes("walks") ||
    text.includes("singles") ||
    text.includes("doubles") ||
    text.includes("triples") ||
    text.includes("home runs") ||
    text.includes(" hits") ||
    text.includes(" prop")
  ) {
    return "hitter_props";
  }

  return "hitter_props";
}

function normalizeViewMode(row) {
  const raw = lowerText(pick(row, "view_mode", "viewMode")).trim();
  const text = joinedRowText(row);

  if (raw === "pitcher_props") return "pitcher_props";
  if (raw === "hitter_props") return "hitter_props";

  if (raw === "props" || raw === "prop") {
    return inferPropViewMode(row);
  }

  if (text.includes("pitcher_") || text.includes("pitcher strikeouts") || text.includes("pitcher outs") || text.includes("pitcher earned runs")) {
    return "pitcher_props";
  }

  if (text.includes("batter_") || text.includes("total bases") || text.includes("stolen bases") || text.includes("hits + runs + rbis")) {
    return "hitter_props";
  }

  if (raw === "f5" || text.includes(" f5 ") || text.startsWith("f5 ") || text.includes("f5 moneyline") || text.includes("f5 run line") || text.includes("f5 total")) {
    return "f5";
  }

  return "full";
}

function canonicalKeyForRow(row) {
  const eventId = pick(row, "event_id", "eventId") || "";
  const rawCommenceTime = pick(row, "raw_commence_time", "rawCommenceTime") || "";
  const viewMode = normalizeViewMode(row);

  if (hasValue(eventId) && hasValue(rawCommenceTime) && hasValue(viewMode)) {
    return [
      normalizePart(eventId),
      normalizePart(rawCommenceTime),
      normalizePart(viewMode)
    ].join("|");
  }

  return pick(row, "archive_id", "archiveId") || [
    eventId,
    rawCommenceTime,
    pick(row, "best_bet", "bestBet") || "",
    pick(row, "best_bet_type", "bestBetType") || ""
  ].join("|");
}

function rowTime(row) {
  const archivedAt = new Date(pick(row, "archived_at", "archivedAt") || 0).getTime();
  if (Number.isFinite(archivedAt) && archivedAt > 0) return archivedAt;

  const raw = new Date(pick(row, "raw_commence_time", "rawCommenceTime") || 0).getTime();
  if (Number.isFinite(raw) && raw > 0) return raw;

  return 0;
}

function isGraded(row) {
  const grade = String(row.grade || "").trim();
  return grade === "Win" || grade === "Loss" || grade === "Push" || grade === "Tie";
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
  const viewMode = normalizeViewMode(row);
  const canonicalKey = canonicalKeyForRow(row);

  return {
    ...row,
    archive_id: canonicalKey,
    view_mode: viewMode
  };
}

function dedupeRowsByGameView(rows) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = canonicalKeyForRow(row);
    if (!key) continue;

    const existing = map.get(key);
    map.set(key, betterRow(existing, row));
  }

  return Array.from(map.values())
    .map(normalizeReturnedRow)
    .sort(function(a, b) {
      const bt = new Date(b.raw_commence_time || b.rawCommenceTime || b.archived_at || b.archivedAt || 0).getTime();
      const at = new Date(a.raw_commence_time || a.rawCommenceTime || a.archived_at || a.archivedAt || 0).getTime();
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
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

    const dedupedRows = dedupeRowsByGameView(Array.isArray(rows) ? rows : []);

    return res.status(200).json({
      ok: true,
      mode: "strong_option_b_one_row_per_event_normalized_view",
      rawRowCount: Array.isArray(rows) ? rows.length : 0,
      rowCount: dedupedRows.length,
      removedDuplicateCount: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - dedupedRows.length),
      rows: dedupedRows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};