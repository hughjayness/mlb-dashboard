module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
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

    const row = req.body || {};

    if (!row.archive_id) {
      return res.status(400).json({
        ok: false,
        error: "Missing archive_id"
      });
    }

    const response = await fetch(
      url + "/rest/v1/archive_picks",
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(row)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: text
      });
    }

    return res.status(200).json({
      ok: true
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
