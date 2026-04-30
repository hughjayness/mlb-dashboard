module.exports = async function handler(req, res) {
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
      url + "/rest/v1/archive_picks?select=*&order=raw_commence_time.asc",
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
      return res.status(response.status).json({
        ok: false,
        error: text
      });
    }

    let rows = [];
    try {
      rows = JSON.parse(text);
    } catch (e) {
      rows = [];
    }

    return res.status(200).json({
      ok: true,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      rows: Array.isArray(rows) ? rows : []
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};