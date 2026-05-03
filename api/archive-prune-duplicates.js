// api/archive-prune-duplicates.js
// Removes duplicate archive rows from Supabase using Option B identity:
// event_id + raw_commence_time + view_mode
//
// Keeps the best row for each game/view:
// 1. Graded rows beat ungraded rows
// 2. Rows with result details beat blank rows
// 3. Newer archived_at rows beat older rows
// 4. Rows with richer model context beat thinner rows

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function normalizePart(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function canonicalGameViewKey(row) {
  const eventId = row.event_id || row.eventId || "";
  const rawCommenceTime = row.raw_commence_time || row.rawCommenceTime || "";
  const viewMode = row.view_mode || row.viewMode || "";

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
  const archivedAt = new Date(row.archived_at || row.archivedAt || 0).getTime();
  if (Number.isFinite(archivedAt) && archivedAt > 0) return archivedAt;

  const raw = new Date(row.raw_commence_time || row.rawCommenceTime || 0).getTime();
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

function compareRows(a, b) {
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

  const aTime = rowTimestamp(a);
  const bTime = rowTimestamp(b);

  if (aTime >= bTime) return a;
  return b;
}

function groupDuplicates(rows) {
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = canonicalGameViewKey(row);
    if (!key) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const keepers = [];
  const duplicates = [];

  for (const groupRows of groups.values()) {
    if (groupRows.length <= 1) {
      keepers.push(groupRows[0]);
      continue;
    }

    let keeper = groupRows[0];

    for (let i = 1; i < groupRows.length; i++) {
      keeper = compareRows(keeper, groupRows[i]);
    }

    keepers.push(keeper);

    for (const row of groupRows) {
      if (row !== keeper) duplicates.push(row);
    }
  }

  return { keepers, duplicates };
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
  } catch (e) {
    return [];
  }
}

async function deleteArchiveRow(url, key, row) {
  const archiveId = row.archive_id || row.archiveId || "";

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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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
    const grouped = groupDuplicates(rows);

    const deleteResults = [];

    for (const duplicate of grouped.duplicates) {
      const result = await deleteArchiveRow(url, key, duplicate);
      deleteResults.push(result);
    }

    const deletedCount = deleteResults.filter(function (r) {
      return r && r.ok;
    }).length;

    const failed = deleteResults.filter(function (r) {
      return r && !r.ok && !r.skipped;
    });

    return res.status(failed.length ? 207 : 200).json({
      ok: failed.length === 0,
      mode: "option_b_prune_duplicates",
      originalRowCount: rows.length,
      keptRowCount: grouped.keepers.length,
      duplicateRowCount: grouped.duplicates.length,
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