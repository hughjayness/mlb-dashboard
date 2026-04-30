// api/archive-delete.js
// Deletes postponed/canceled archive rows from Supabase so they do not reload later.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST or DELETE."
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

    const body = req.body || {};

    const archiveIds = Array.isArray(body.archive_ids)
      ? body.archive_ids
      : Array.isArray(body.archiveIds)
        ? body.archiveIds
        : body.archive_id
          ? [body.archive_id]
          : body.archiveId
            ? [body.archiveId]
            : [];

    const cleanedIds = archiveIds
      .map(function (id) {
        return String(id || "").trim();
      })
      .filter(Boolean);

    if (!cleanedIds.length) {
      return res.status(400).json({
        ok: false,
        error: "Missing archive_id"
      });
    }

    const deleted = [];
    const failed = [];

    for (const archiveId of cleanedIds) {
      const endpoint =
        url +
        "/rest/v1/archive_picks?archive_id=eq." +
        encodeURIComponent(archiveId);

      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          Accept: "application/json",
          Prefer: "return=representation"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        failed.push({
          archive_id: archiveId,
          status: response.status,
          error: text
        });
      } else {
        let rows = [];
        try {
          rows = text ? JSON.parse(text) : [];
        } catch (e) {
          rows = [];
        }

        deleted.push({
          archive_id: archiveId,
          deleted_count: Array.isArray(rows) ? rows.length : 0
        });
      }
    }

    if (failed.length) {
      return res.status(500).json({
        ok: false,
        deleted,
        failed
      });
    }

    return res.status(200).json({
      ok: true,
      deleted_count: deleted.reduce(function (sum, row) {
        return sum + Number(row.deleted_count || 0);
      }, 0),
      deleted
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};