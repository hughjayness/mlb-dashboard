// api/archive-prune-duplicates.js
// Strong duplicate cleanup route.
// Physically removes old duplicate rows from Supabase.
//
// Canonical identity:
// event_id + raw_commence_time + normalized_view_mode
//
// Old "props" rows are normalized to hitter_props or pitcher_props before grouping.

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

  return "";
}

function isGraded(row) {
  const grade = String(row.grade || "").trim();
  return grade === "Win" || grade === "Loss" || grade === "Push" || grade === "Tie";
}

function rowTimestamp(row) {
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

  return rowTimestamp(a) >= rowTimestamp(b) ? a : b;
}

function groupRows(rows) {
  const groups = new Map();
  const ungrouped = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = canonicalKeyForRow(row);

    if (!key) {
      ungrouped.push(row);
      continue;
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const keepers = [];
  const duplicates = [];
  const canonicalize = [];

  for (const [key, group] of groups.entries()) {
    let keeper = group[0];

    for (let i = 1; i < group.length; i++) {
      keeper = betterRow(keeper, group[i]);
    }

    const keeperArchiveId = pick(keeper, "archive_id", "archiveId");

    const canonicalKeeper = {
      ...keeper,
      archive_id: key,
      view_mode: normalizeViewMode(keeper)
    };

    keepers.push(canonicalKeeper);

    if (keeperArchiveId !== key) {
      canonicalize.push(canonicalKeeper);
    }

    for (const row of group) {
      const rowArchiveId = pick(row, "archive_id", "archiveId");

      if (row === keeper && rowArchiveId === key) continue;

      if (rowArchiveId) {
        duplicates.push(row);
      }
    }
  }

  return { keepers, duplicates, canonicalize, ungrouped };
}

async function fetchArchiveRows(url, key) {
  const response = await fetch(
    url.replace(/\/$/, "") +
      "/rest/v1/archive_picks?select=*&order=raw_commence_time.desc.nullslast,archived_at.desc.nullslast",
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
    throw new Error(text || "Failed to fetch archive rows");
  }

  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

async function upsertCanonicalRow(url, key, row) {
  const response = await fetch(
    url.replace(/\/$/, "") + "/rest/v1/archive_picks?on_conflict=archive_id",
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    }
  );

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text
  };
}

async function deleteArchiveRow(url, key, row) {
  const archiveId = pick(row, "archive_id", "archiveId") || "";

  if (!archiveId) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing archive_id"
    };
  }

  const response = await fetch(
    url.replace(/\/$/, "") +
      "/rest/v1/archive_picks?archive_id=eq." +
      encodeURIComponent(archiveId),
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Accept: "application/json",
        Prefer: "return=representation"
      }
    }
  );

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      archive_id: archiveId,
      error: text
    };
  }

  return {
    ok: true,
    archive_id: archiveId
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
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

    const rows = await fetchArchiveRows(url, key);
    const grouped = groupRows(rows);

    const canonicalizeResults = [];
    for (const row of grouped.canonicalize) {
      canonicalizeResults.push(await upsertCanonicalRow(url, key, row));
    }

    const deleteResults = [];
    for (const duplicate of grouped.duplicates) {
      deleteResults.push(await deleteArchiveRow(url, key, duplicate));
    }

    const deletedCount = deleteResults.filter(function (r) {
      return r && r.ok;
    }).length;

    const failedDeletes = deleteResults.filter(function (r) {
      return r && !r.ok && !r.skipped;
    });

    const failedCanonicalize = canonicalizeResults.filter(function (r) {
      return r && !r.ok;
    });

    const failed = failedDeletes.concat(failedCanonicalize);

    return res.status(failed.length ? 207 : 200).json({
      ok: failed.length === 0,
      mode: "strong_option_b_prune_duplicates_normalized_props",
      originalRowCount: rows.length,
      keptRowCount: grouped.keepers.length,
      duplicateRowCount: grouped.duplicates.length,
      canonicalizedRowCount: grouped.canonicalize.length,
      ungroupedRowCount: grouped.ungrouped.length,
      deletedCount,
      failedCount: failed.length,
      failed
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};