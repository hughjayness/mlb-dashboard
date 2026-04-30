// api/archive-save.js
// Phase 1 archive save route.
// Saves normal archive fields plus richer model/trend context when Supabase columns exist.
// If optional Phase 1 columns do not exist yet, it automatically retries with the base archive fields only.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      });
    }

    const body = req.body || {};
    const fullRow = normalizeArchiveRow(body);
    const baseRow = buildBaseRow(fullRow);

    if (!baseRow.archive_id) {
      return res.status(400).json({
        ok: false,
        error: "Missing archive_id"
      });
    }

    const fullSave = await upsertArchiveRow({
      supabaseUrl,
      serviceRoleKey,
      row: fullRow
    });

    if (fullSave.ok) {
      return res.status(200).json({
        ok: true,
        mode: "phase1_full_context_save",
        rowCount: fullSave.rowCount
      });
    }

    const baseSave = await upsertArchiveRow({
      supabaseUrl,
      serviceRoleKey,
      row: baseRow
    });

    if (baseSave.ok) {
      return res.status(200).json({
        ok: true,
        mode: "base_archive_fallback_save",
        warning: "Saved base archive row only. Optional Phase 1 Supabase columns may not exist yet.",
        firstError: fullSave.error,
        rowCount: baseSave.rowCount
      });
    }

    return res.status(baseSave.status || 500).json({
      ok: false,
      error: "Supabase archive save failed",
      fullContextError: fullSave.error,
      baseFallbackError: baseSave.error
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};

async function upsertArchiveRow({ supabaseUrl, serviceRoleKey, row }) {
  const endpoint =
    supabaseUrl.replace(/\/$/, "") +
    "/rest/v1/archive_picks?on_conflict=archive_id";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: text
      };
    }

    let parsed = [];
    try {
      parsed = text ? JSON.parse(text) : [];
    } catch (e) {
      parsed = [];
    }

    return {
      ok: true,
      status: response.status,
      rowCount: Array.isArray(parsed) ? parsed.length : 1,
      rows: parsed
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err.message
    };
  }
}

function normalizeArchiveRow(input) {
  const row = input || {};

  const out = {
    archive_id: pick(row, "archive_id", "archiveId"),
    archived_at: pick(row, "archived_at", "archivedAt") || new Date().toISOString(),
    event_id: pick(row, "event_id", "eventId"),
    raw_commence_time: pick(row, "raw_commence_time", "rawCommenceTime"),
    away: pick(row, "away"),
    home: pick(row, "home"),
    matchup: pick(row, "matchup"),
    best_bet: pick(row, "best_bet", "bestBet"),
    best_bet_type: pick(row, "best_bet_type", "bestBetType"),
    view_mode: pick(row, "view_mode", "viewMode"),
    confidence: pick(row, "confidence"),
    score: toNumberOrNull(pick(row, "score")),
    odds_price: toNumberOrNull(pick(row, "odds_price", "oddsPrice")),
    result_status: pick(row, "result_status", "resultStatus") || "Pending",
    grade: pick(row, "grade"),
    result_detail: pick(row, "result_detail", "resultDetail"),
    net_units: toNumberOrNull(pick(row, "net_units", "netUnits")),
    profit_dollars: toNumberOrNull(pick(row, "profit_dollars", "profitDollars")),
    source: pick(row, "source") || "Archive",

    pick_side: pick(row, "pick_side", "pickSide"),
    market_family: pick(row, "market_family", "marketFamily"),
    market_key: pick(row, "market_key", "marketKey"),
    prop_sub_type: pick(row, "prop_sub_type", "propSubType"),
    player_name: pick(row, "player_name", "playerName"),
    team_side: pick(row, "team_side", "teamSide"),
    bet_direction: pick(row, "bet_direction", "betDirection"),
    home_or_away: pick(row, "home_or_away", "homeOrAway"),
    opponent: pick(row, "opponent"),
    odds_bucket: pick(row, "odds_bucket", "oddsBucket"),
    score_bucket: pick(row, "score_bucket", "scoreBucket"),

    edge_pct: toNumberOrNull(pick(row, "edge_pct", "edgePct")),
    implied_prob: toNumberOrNull(pick(row, "implied_prob", "impliedProb")),
    model_prob: toNumberOrNull(pick(row, "model_prob", "modelProb")),
    fair_prob: toNumberOrNull(pick(row, "fair_prob", "fairProb")),
    final_score: toNumberOrNull(pick(row, "final_score", "finalScore")),
    confidence_score: toNumberOrNull(pick(row, "confidence_score", "confidenceScore")),
    data_completeness: toNumberOrNull(pick(row, "data_completeness", "dataCompleteness")),
    implausibility_penalty: toNumberOrNull(pick(row, "implausibility_penalty", "implausibilityPenalty")),

    script_alignment_status: pick(row, "script_alignment_status", "scriptAlignmentStatus"),
    script_conflict_reason: pick(row, "script_conflict_reason", "scriptConflictReason"),
    run_environment: pick(row, "run_environment", "runEnvironment"),
    park_factor: toNumberOrNull(pick(row, "park_factor", "parkFactor")),
    weather_score: toNumberOrNull(pick(row, "weather_score", "weatherScore")),

    pitcher_quality_for: toNumberOrNull(pick(row, "pitcher_quality_for", "pitcherQualityFor")),
    pitcher_quality_against: toNumberOrNull(pick(row, "pitcher_quality_against", "pitcherQualityAgainst")),
    team_recent_offense_for: toNumberOrNull(pick(row, "team_recent_offense_for", "teamRecentOffenseFor")),
    team_recent_offense_against: toNumberOrNull(pick(row, "team_recent_offense_against", "teamRecentOffenseAgainst")),
    bullpen_freshness_for: toNumberOrNull(pick(row, "bullpen_freshness_for", "bullpenFreshnessFor")),
    bullpen_freshness_against: toNumberOrNull(pick(row, "bullpen_freshness_against", "bullpenFreshnessAgainst")),
    travel_miles: toNumberOrNull(pick(row, "travel_miles", "travelMiles")),
    rest_days: toNumberOrNull(pick(row, "rest_days", "restDays")),

    reason_text: pick(row, "reason_text", "reasonText"),
    model_snapshot: normalizeJsonValue(pick(row, "model_snapshot", "modelSnapshot")),
    trend_tags: normalizeJsonValue(pick(row, "trend_tags", "trendTags"))
  };

  return removeUndefinedAndEmptyOptional(out);
}

function buildBaseRow(fullRow) {
  const allowed = [
    "archive_id",
    "archived_at",
    "event_id",
    "raw_commence_time",
    "away",
    "home",
    "matchup",
    "best_bet",
    "best_bet_type",
    "view_mode",
    "confidence",
    "score",
    "odds_price",
    "result_status",
    "grade",
    "result_detail",
    "net_units",
    "profit_dollars",
    "source"
  ];

  const out = {};
  allowed.forEach(function (key) {
    if (fullRow[key] !== undefined) out[key] = fullRow[key];
  });

  return out;
}

function pick(obj) {
  for (let i = 1; i < arguments.length; i++) {
    const key = arguments[i];
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeJsonValue(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (e) {
    return value;
  }
}

function removeUndefinedAndEmptyOptional(row) {
  const out = {};

  Object.keys(row).forEach(function (key) {
    const value = row[key];

    if (value === undefined) return;

    if (
      value === null &&
      key !== "score" &&
      key !== "odds_price" &&
      key !== "net_units" &&
      key !== "profit_dollars"
    ) {
      return;
    }

    out[key] = value;
  });

  return out;
}