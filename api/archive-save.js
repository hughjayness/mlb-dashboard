// api/archive-save.js
// Stronger Option B save route.
// Canonical archive identity is now matchup/time/view, not event_id/time/view.
// This prevents duplicate rows when the same MLB game arrives with different event_id values.

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

function asText(v) {
  return hasValue(v) ? String(v) : "";
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  const away = asText(row.away);
  const home = asText(row.home);

  if (away && home) return { away, home };

  const matchup = asText(row.matchup);
  const parts = matchup.split("@");

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

function canonicalArchiveId(input) {
  const teams = parseMatchup(input);
  const rawTime = pick(input, "raw_commence_time", "rawCommenceTime");
  const viewMode = normalizeViewMode(input);

  const awayKey = norm(teams.away);
  const homeKey = norm(teams.home);
  const startKey = timeKey(rawTime);

  if (awayKey && homeKey && startKey && viewMode) {
    return ["gameview", awayKey, homeKey, startKey, viewMode].join("|");
  }

  const eventId = asText(pick(input, "event_id", "eventId"));
  if (eventId && startKey && viewMode) {
    return ["eventview", eventId, startKey, viewMode].join("|");
  }

  return asText(pick(input, "archive_id", "archiveId"));
}

function buildCoreRow(input) {
  const teams = parseMatchup(input);
  const viewMode = normalizeViewMode(input);

  return {
    archive_id: canonicalArchiveId(input),
    archived_at: pick(input, "archived_at", "archivedAt") || new Date().toISOString(),
    event_id: asText(pick(input, "event_id", "eventId")),
    raw_commence_time: pick(input, "raw_commence_time", "rawCommenceTime") || null,
    away: teams.away,
    home: teams.home,
    matchup: asText(input.matchup) || (teams.away && teams.home ? teams.away + " @ " + teams.home : ""),
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
    model_prob: asNumber(pick(input, "model_prob", "modelProb")),
    dashboard_revision_id: asText(pick(input, "dashboard_revision_id", "dashboardRevisionId")),
    dashboard_revision_label: asText(pick(input, "dashboard_revision_label", "dashboardRevisionLabel")),
    dashboard_revision_date: asText(pick(input, "dashboard_revision_date", "dashboardRevisionDate"))
  };
}

function removeEmpty(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

function optionalColumnLikelyMissing(text) {
  const s = String(text || "").toLowerCase();
  return (
    s.includes("could not find") ||
    s.includes("schema cache") ||
    s.includes("column") ||
    s.includes("pgrst204") ||
    s.includes("model_snapshot") ||
    s.includes("trend_tags") ||
    s.includes("dashboard_revision")
  );
}

async function supabaseUpsert(url, key, row) {
  const endpoint = url.replace(/\/$/, "") + "/rest/v1/archive_picks?on_conflict=archive_id";

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

    const optionalRow = removeEmpty(buildOptionalRow(input));
    const richRow = { ...coreRow, ...optionalRow };

    const first = await supabaseUpsert(url, key, richRow);

    if (first.ok) {
      return res.status(200).json({
        ok: true,
        mode: Object.keys(optionalRow).length ? "rich_context_saved_matchup_time_view" : "core_saved_matchup_time_view",
        archive_id: coreRow.archive_id,
        view_mode: coreRow.view_mode
      });
    }

    if (Object.keys(optionalRow).length && optionalColumnLikelyMissing(first.text)) {
      const retry = await supabaseUpsert(url, key, coreRow);

      if (retry.ok) {
        return res.status(200).json({
          ok: true,
          mode: "core_saved_optional_columns_missing_matchup_time_view",
          archive_id: coreRow.archive_id,
          view_mode: coreRow.view_mode,
          warning: "Optional Phase 1 columns were not found in Supabase, so only core archive fields were saved."
        });
      }

      return res.status(retry.status).json({
        ok: false,
        error: retry.text,
        first_error: first.text
      });
    }

    return res.status(first.status).json({ ok: false, error: first.text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};