// api/archive-list.js
// Option B shared archive list route.
// Returns at most one row per MLB event + first pitch + view mode, so old duplicate pick rows do not inflate tracker/data trends.

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function normalizeArchiveKeyPart(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function canonicalKeyForRow(row) {
  const eventId = row.event_id || row.eventId || "";
  const rawCommenceTime = row.raw_commence_time || row.rawCommenceTime || "";
  const viewMode = row.view_mode || row.viewMode || "";

  if (hasValue(eventId) && hasValue(rawCommenceTime) && hasValue(viewMode)) {
    return [
      normalizeArchiveKeyPart(eventId),
      normalizeArchiveKeyPart(rawCommenceTime),
      normalizeArchiveKeyPart(viewMode)
    ].join("|");
  }

  return row.archive_id || row.archiveId || [
    eventId,
    rawCommenceTime,
    row.best_bet || row.bestBet || "",
    row.best_bet_type || row.bestBetType || ""
  ].join("|");
}

function rowTime(row) {
  const archivedAt = new Date(row.archived_at || row.archivedAt || 0).getTime();
  if (Number.isFinite(archivedAt) && archivedAt > 0) return archivedAt;

  const raw = new Date(row.raw_commence_time || row.rawCommenceTime || 0).getTime();
  if (Number.isFinite(raw) && raw > 0) return raw;

  return 0;
}

function dedupeRowsByGameView(rows) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = canonicalKeyForRow(row);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }

    if (rowTime(row) >= rowTime(existing)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values()).sort(function(a, b) {
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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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
    } catch (e) {
      rows = [];
    }

    const dedupedRows = dedupeRowsByGameView(Array.isArray(rows) ? rows : []);

    return res.status(200).json({
      ok: true,
      mode: "option_b_one_row_per_event_view",
      rawRowCount: Array.isArray(rows) ? rows.length : 0,
      rowCount: dedupedRows.length,
      removedDuplicateCount: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - dedupedRows.length),
      rows: dedupedRows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};