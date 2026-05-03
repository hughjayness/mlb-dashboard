// api/archive-save.js
// Phase 1 shared archive save route with Option B game/view archive identity.
// Saves core tracker fields and, when Supabase columns exist, richer model/trend context.
// If optional Phase 1 columns do not exist yet, it retries with core columns so archiving does not break.

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asText(v) {
  return hasValue(v) ? String(v) : "";
}

function asJson(v) {
  if (!hasValue(v)) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch (_) {
    return { raw: String(v) };
  }
}

function pick(row, snake, camel) {
  if (hasValue(row[snake])) return row[snake];
  if (hasValue(row[camel])) return row[camel];
  return null;
}

function normalizeArchiveKeyPart(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
}

function canonicalArchiveId(incomingArchiveId, eventId, rawCommenceTime, viewMode) {
  if (hasValue(eventId) && hasValue(rawCommenceTime) && hasValue(viewMode)) {
    return [
      normalizeArchiveKeyPart(eventId),
      normalizeArchiveKeyPart(rawCommenceTime),
      normalizeArchiveKeyPart(viewMode)
    ].join("|");
  }

  return asText(incomingArchiveId);
}

function buildCoreRow(input) {
  const eventId = asText(pick(input, "event_id", "eventId"));
  const rawCommenceTime = pick(input, "raw_commence_time", "rawCommenceTime") || null;
  const viewMode = asText(pick(input, "view_mode", "viewMode"));
  const incomingArchiveId = asText(pick(input, "archive_id", "archiveId"));
  const archiveId = canonicalArchiveId(incomingArchiveId, eventId, rawCommenceTime, viewMode);

  return {
    archive_id: archiveId,
    archived_at: pick(input, "archived_at", "archivedAt") || new Date().toISOString(),
    event_id: eventId,
    raw_commence_time: rawCommenceTime,
    away: asText(input.away),
    home: asText(input.home),
    matchup: asText(input.matchup),
    best_bet: asText(pick(input, "best_bet", "bestBet")),
    best_bet_type: asText(pick(input, "best_bet_type", "bestBetType")),
    view_mode: viewMode,
    confidence: asText(input.confidence),
    score: asNumber(input.score),
    odds_price: asNumber(pick(input, "odds_price", "oddsPrice")),
    result_status: asText(pick(input, "result_status", "resultStatus")) || "Pending",
    grade: asText(input.grade),
    result_detail: asText(pick(input, "result_detail", "resultDetail")),
    net_units: asNumber(pick(input, "net_units", "netUnits")),
    profit_dollars: asNumber(pick(input, "profit_dollars", "profitDollars")),
    source: asText(input.source) || "Archive"
  };
}

function buildOptionalRow(input) {
  return {
    model_snapshot: asJson(pick(input, "model_snapshot", "modelSnapshot")),
    trend_tags: asJson(pick(input, "trend_tags", "trendTags")),
    analysis_notes: asText(pick(input, "analysis_notes", "analysisNotes")),
    selection_team: asText(pick(input, "selection_team", "selectionTeam")),
    opponent: asText(input.opponent),
    player_name: asText(pick(input, "player_name", "playerName")),
    market_key: asText(pick(input, "market_key", "marketKey")),
    prop_market: asText(pick(input, "prop_market", "propMarket")),
    bet_direction: asText(pick(input, "bet_direction", "betDirection")),
    line_value: asNumber(pick(input, "line_value", "lineValue")),
    home_away: asText(pick(input, "home_away", "homeAway")),
    odds_bucket: asText(pick(input, "odds_bucket", "oddsBucket")),
    score_bucket: asText(pick(input, "score_bucket", "scoreBucket")),
    edge_pct: asNumber(pick(input, "edge_pct", "edgePct")),
    model_score: asNumber(pick(input, "model_score", "modelScore")),
    final_score: asNumber(pick(input, "final_score", "finalScore")),
    implied_prob: asNumber(pick(input, "implied_prob", "impliedProb")),
    model_prob: asNumber(pick(input, "model_prob", "modelProb"))
  };
}

function removeNullOptional(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

async function supabaseUpsert(url, key, row) {
  const endpoint = url + "/rest/v1/archive_picks?on_conflict=archive_id";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(row)
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

function optionalColumnLikelyMissing(text) {
  const s = String(text || "").toLowerCase();
  return s.includes("could not find") ||
    s.includes("schema cache") ||
    s.includes("column") ||
    s.includes("pgrst204") ||
    s.includes("model_snapshot") ||
    s.includes("trend_tags");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") return res.status(200).end();

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

    const input = req.body || {};
    const coreRow = buildCoreRow(input);

    if (!coreRow.archive_id) {
      return res.status(400).json({ ok: false, error: "Missing archive_id" });
    }

    const optionalRow = removeNullOptional(buildOptionalRow(input));
    const richRow = { ...coreRow, ...optionalRow };
    const hasOptional = Object.keys(optionalRow).length > 0;

    const first = await supabaseUpsert(url, key, richRow);
    if (first.ok) {
      return res.status(200).json({
        ok: true,
        mode: hasOptional ? "rich_context_saved" : "core_saved",
        row: first.text ? JSON.parse(first.text)[0] || null : null
      });
    }

    if (hasOptional && optionalColumnLikelyMissing(first.text)) {
      const retry = await supabaseUpsert(url, key, coreRow);
      if (retry.ok) {
        return res.status(200).json({
          ok: true,
          mode: "core_saved_optional_columns_missing",
          warning: "Optional Phase 1 model/trend columns were not found in Supabase, so only core archive fields were saved. Run the Phase 1 SQL upgrade to store richer trend context."
        });
      }

      return res.status(retry.status).json({ ok: false, error: retry.text, first_error: first.text });
    }

    return res.status(first.status).json({ ok: false, error: first.text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};