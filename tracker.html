<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bobby's MLB Betting Dashboard</title>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <style>
    :root{
      --bg:#14061f;--bg2:#071a26;--panel:#1b1030;--text:#f8f7ff;--muted:#c8b9dc;
      --good:#44f0a1;--warn:#ffd166;--bad:#ff6b8a;--radius:18px;
    }
    *{box-sizing:border-box}
    body{
      margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);
      background:
        radial-gradient(circle at top left, rgba(255,79,216,.18), transparent 24%),
        radial-gradient(circle at top right, rgba(57,215,255,.14), transparent 24%),
        linear-gradient(180deg,var(--bg),var(--bg2));
    }
    .wrap{max-width:1600px;margin:0 auto;padding:20px}
    h1{margin:0 0 10px;font-size:34px}
    .topbar,.toolbar,.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
    .topbar{justify-content:space-between}
    .btn,.control select{
      background:#10273a;color:#f8f7ff;border:1px solid rgba(255,79,216,.35);
      border-radius:12px;padding:10px 12px
    }
    .btn{cursor:pointer;font-weight:700}
    .control{display:flex;flex-direction:column;gap:6px}
    .control label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#ffd8f6}
    .status,.card,.panel{
      border-radius:var(--radius);
      background:linear-gradient(180deg,rgba(27,16,48,.98),rgba(16,39,58,.96));
      border:1px solid rgba(255,79,216,.35)
    }
    .status{margin-top:10px;padding:12px 14px;color:var(--muted)}
    .cards{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:14px;margin:18px 0}
    .card{padding:16px}
    .label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#ffd8f6}
    .value{font-size:28px;font-weight:800;margin-top:10px;line-height:1.1}
    .small{font-size:13px;color:var(--muted);margin-top:8px}
    .panel-header{
      padding:16px 18px;border-bottom:1px solid rgba(57,215,255,.28);
      font-weight:800;display:flex;justify-content:space-between;align-items:center
    }
    .muted{color:var(--muted);font-size:13px}
    .detail{padding:18px}
    .detail h2{margin:0 0 6px;font-size:24px}
    .detail-sub{color:var(--muted);margin-bottom:14px}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px}
    .detail-col{display:grid;gap:10px}
    .box,.notes{
      border-radius:14px;background:linear-gradient(180deg,rgba(16,39,58,.92),rgba(36,20,63,.95));
      border:1px solid rgba(57,215,255,.24)
    }
    .box{padding:12px}
    .box .k{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#ffd4f2;margin-bottom:6px}
    .box .v{font-size:16px;font-weight:700;line-height:1.35}
    .notes{padding:14px;color:var(--muted);line-height:1.55}
    .reason-list{margin:8px 0 0;padding-left:18px}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800}
    .good{background:rgba(68,240,161,.14);color:var(--good)}
    .warn{background:rgba(255,209,102,.14);color:var(--warn)}
    .bad{background:rgba(255,107,138,.14);color:var(--bad)}
    .inline{display:flex;justify-content:space-between;gap:10px;align-items:center}
    .factor-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px}
    .table-wrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse;min-width:1200px}
    th,td{padding:13px 12px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:14px;vertical-align:top}
    th{color:#ffd9f5;font-size:12px;text-transform:uppercase;letter-spacing:.08em;background:rgba(255,79,216,.05)}
    tbody tr:hover{background:rgba(57,215,255,.08);cursor:pointer}
    .empty-row{color:var(--muted);text-align:center;padding:28px 12px}
    .flash{font-size:12px;color:var(--good)}
    @media (max-width:1100px){.cards{grid-template-columns:repeat(2,1fr)}.detail-grid,.factor-grid{grid-template-columns:1fr}}
    @media (max-width:700px){.cards{grid-template-columns:1fr}.wrap{padding:12px}h1{font-size:26px}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div>
      <h1>Bobby's MLB Betting Dashboard</h1>
      <div class="toolbar" style="margin-top:10px;">
        <button class="btn" id="savePickBtn">Save Selected Pick</button>
        <button class="btn" id="exportPicksBtn">Export Picks (Excel)</button>
        <button class="btn" id="openTrackerBtn">Open Pick Tracker</button>
        <span class="flash" id="saveFlash"></span>
      </div>
    </div>
    <div class="controls">
      <div class="control">
        <label for="confidenceFilter">Best Bet Confidence Filter</label>
        <select id="confidenceFilter">
          <option value="All">All Tiers</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>
    </div>
  </div>

  <div class="status" id="statusBox">Loading live data...</div>

  <div class="cards">
    <div class="card"><div class="label">Games</div><div class="value" id="gamesCount">0</div><div class="small">Upcoming only</div></div>
    <div class="card"><div class="label">Best Total</div><div class="value" id="bestTotal">—</div><div class="small">Best total angle by confidence</div></div>
    <div class="card"><div class="label">Best Side</div><div class="value" id="bestSide">—</div><div class="small">Best side angle by confidence</div></div>
    <div class="card"><div class="label">Top Prop Overall</div><div class="value" id="bestProp">—</div><div class="small" id="bestPropSub">Shown only when a live prop qualifies</div></div>
    <div class="card"><div class="label">Saved Picks</div><div class="value" id="savedCount">0</div><div class="small">Stored in this browser</div></div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <span>Today's Board</span>
      <span class="muted">Upcoming / bettable games only</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>First Pitch (ET)</th>
            <th>Matchup</th>
            <th>Moneyline</th>
            <th>Total</th>
            <th>Run Line</th>
            <th>Best Bet</th>
            <th>Type</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody id="gamesTable"></tbody>
      </table>
    </div>
  </div>

  <div class="panel" style="margin-top:16px;">
    <div class="panel-header">
      <span>Game Detail</span>
      <span class="muted">Click a row from Today’s Board</span>
    </div>
    <div class="detail" id="detailPanel">
      <h2>No live game selected</h2>
      <div class="detail-sub">When the backend returns games, click a row to inspect the reasoning.</div>
      <div class="notes">Confidence drivers, risk warnings, and prop detail will appear here.</div>
    </div>
  </div>
</div>

<script>
var currentGames = [];
var filteredGames = [];
var selectedGame = null;
var STORAGE_KEY = "bobby_mlb_saved_picks_v1";

function setStatus(text){ document.getElementById("statusBox").textContent = text; }
function flash(text){
  var el = document.getElementById("saveFlash");
  el.textContent = text;
  setTimeout(function(){ el.textContent = ""; }, 2500);
}
function formatTimeStamp(value){
  if (!value) return "—";
  var d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
function pillClass(label){
  if (label === "High") return "pill good";
  if (label === "Medium") return "pill warn";
  return "pill bad";
}
function formatPct(v){ return v === null || v === undefined || v === "" ? "—" : String(v) + "%"; }
function shortSideConf(game){
  return game.away + " " + formatPct(game.moneylineConfidence?.away) + " / " +
         game.home + " " + formatPct(game.moneylineConfidence?.home);
}
function shortTotalConf(game){
  return "Over " + formatPct(game.totalConfidence?.over) + " / Under " + formatPct(game.totalConfidence?.under);
}
function shortRunLineConf(game){
  return game.away + " " + formatPct(game.runLineConfidence?.away) + " / " +
         game.home + " " + formatPct(game.runLineConfidence?.home);
}
function factorValue(obj, path, fallback) {
  try {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) cur = cur[parts[i]];
    return cur === null || cur === undefined || cur === "" ? fallback : cur;
  } catch (e) { return fallback; }
}
function extractTotalLine(totalText){
  var m = String(totalText || "").match(/O\/U\s+([0-9.]+)/i);
  return m ? m[1] : "";
}
function getSavedPicks(){
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch(e) { return []; }
}
function setSavedPicks(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  updateSavedCount();
}
function updateSavedCount(){ document.getElementById("savedCount").textContent = getSavedPicks().length; }
function buildPickRecord(game){
  return {
    archiveId: [game.eventId || "", game.rawCommenceTime || "", game.bestBet || "", game.bestBetType || ""].join("|"),
    archivedAt: new Date().toISOString(),
    source: "Dashboard",
    eventId: game.eventId || "",
    rawCommenceTime: game.rawCommenceTime || "",
    firstPitchEt: game.time || "",
    away: game.away || "",
    home: game.home || "",
    matchup: (game.away || "Away") + " @ " + (game.home || "Home"),
    bestBet: game.bestBet || "",
    bestBetType: game.bestBetType || "",
    confidence: game.confidence || "",
    moneyline: game.moneyline || "",
    total: game.total || "",
    runLine: game.runLine || "",
    moneylineConfidenceAway: game.moneylineConfidence?.away || "",
    moneylineConfidenceHome: game.moneylineConfidence?.home || "",
    totalConfidenceOver: game.totalConfidence?.over || "",
    totalConfidenceUnder: game.totalConfidence?.under || "",
    runLineConfidenceAway: game.runLineConfidence?.away || "",
    runLineConfidenceHome: game.runLineConfidence?.home || "",
    lineupMode: game.lineupMode || "",
    lineupSource: game.lineupSource || "",
    topPropOverall: game.topPropOverall && game.topPropOverall.player ? (game.topPropOverall.player + " " + (game.topPropOverall.market || "")) : "",
    topPropOverallReason: game.topPropOverallReason || "",
    reasons: Array.isArray(game.reasons) ? game.reasons.join(" | ") : "",
    resultStatus: "Pending",
    resultDetail: "",
    grade: "",
    roiUnits: ""
  };
}
function saveSelectedPick(){
  if (!selectedGame) return flash("Select a game first");
  var picks = getSavedPicks();
  picks.push(buildPickRecord(selectedGame));
  setSavedPicks(picks);
  flash("Pick saved");
}
function exportPicksExcel(){
  var picks = getSavedPicks();
  if (!picks.length) return flash("No saved picks yet");
  var ws = XLSX.utils.json_to_sheet(picks);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Picks");
  XLSX.writeFile(wb, "bobbys_mlb_picks.xlsx");
}
function applyConfidenceFilter() {
  var selected = document.getElementById("confidenceFilter").value;
  filteredGames = selected === "All" ? currentGames.slice() : currentGames.filter(function(g){ return (g.confidence || "Low") === selected; });
  renderCards(filteredGames, window._lastUpdated || null);
  renderTable(filteredGames);
}
function renderCards(games, lastUpdated){
  document.getElementById("gamesCount").textContent = games.length;

  var bestSide = "—", bestTotal = "—", bestProp = "—", bestPropSub = "Shown only when a live prop qualifies";
  var bestSideScore = -Infinity, bestTotalScore = -Infinity;

  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (g.moneylineConfidence) {
      var awaySide = Number(g.moneylineConfidence.away || 0);
      var homeSide = Number(g.moneylineConfidence.home || 0);
      if (awaySide > bestSideScore) { bestSideScore = awaySide; bestSide = g.away + " ML"; }
      if (homeSide > bestSideScore) { bestSideScore = homeSide; bestSide = g.home + " ML"; }
    }
    if (g.totalConfidence && g.total && g.total !== "N/A") {
      var overScore = Number(g.totalConfidence.over || 0);
      var underScore = Number(g.totalConfidence.under || 0);
      var totalLine = extractTotalLine(g.total);
      if (overScore > bestTotalScore) { bestTotalScore = overScore; bestTotal = "Over " + totalLine; }
      if (underScore > bestTotalScore) { bestTotalScore = underScore; bestTotal = "Under " + totalLine; }
    }
    if (g.topPropOverall && g.topPropOverall.player && bestProp === "—") {
      bestProp = g.topPropOverall.player + " " + (g.topPropOverall.market || "");
      bestPropSub = g.topPropOverallReason || "Top overall supported prop";
    }
  }

  document.getElementById("bestSide").textContent = bestSide;
  document.getElementById("bestTotal").textContent = bestTotal;
  document.getElementById("bestProp").textContent = bestProp;
  document.getElementById("bestPropSub").textContent = bestPropSub;
}
function renderDetail(game){
  selectedGame = game || null;
  if (!game) {
    document.getElementById("detailPanel").innerHTML =
      '<h2>No live game selected</h2><div class="detail-sub">When the backend returns games, click a row to inspect the reasoning.</div><div class="notes">Confidence drivers, risk warnings, and prop detail will appear here.</div>';
    return;
  }

  var reasonsHtml = '<div class="notes">No reasoning returned yet from the backend.</div>';
  if (game.reasons && game.reasons.length) {
    reasonsHtml = '<div class="notes"><strong>Why this bet:</strong><ul class="reason-list">' +
      game.reasons.map(function(r){ return '<li>' + r + '</li>'; }).join('') + '</ul></div>';
  }

  var propHtml = '<div class="notes"><strong>Top Prop Overall:</strong> ' + (game.propStatus || 'No supported prop returned for this game.') + '</div>';
  if (game.topPropOverall && game.topPropOverall.player) {
    var propReasons = game.topPropOverall.reasons && game.topPropOverall.reasons.length
      ? '<ul class="reason-list">' + game.topPropOverall.reasons.map(function(r){ return '<li>' + r + '</li>'; }).join('') + '</ul>' : '';
    propHtml =
      '<div class="notes"><strong>Top Prop Overall:</strong> ' + game.topPropOverall.player + ' — ' + (game.topPropOverall.market || '—') +
      '<br><strong>Why it is top overall:</strong> ' + (game.topPropOverallReason || 'No explanation returned.') +
      '<br><strong>Model %:</strong> ' + (game.topPropOverall.modelProb != null ? game.topPropOverall.modelProb + '%' : '—') +
      propReasons + '</div>';
  }

  var factorGrid =
    '<div class="factor-grid">' +
      '<div class="box"><div class="k">Starting Pitcher Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.startingPitcher", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
      '<div class="box"><div class="k">Bullpen Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.bullpen", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
      '<div class="box"><div class="k">Lineup Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.lineup", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
      '<div class="box"><div class="k">Weather / Park Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.parkWeather", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
      '<div class="box"><div class="k">Defense / Catching Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.defense", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
      '<div class="box"><div class="k">Travel / Schedule Driver</div><div class="v inline"><span>' + factorValue(game, "componentScores.side.scheduleTravel", "Awaiting live feed") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
    '</div>';

  var riskWarnings = '<div class="notes"><strong>Risk Warnings:</strong> None returned.</div>';
  if (game.riskWarnings && game.riskWarnings.length) {
    riskWarnings = '<div class="notes"><strong>Risk Warnings:</strong><ul class="reason-list">' +
      game.riskWarnings.map(function(r){ return '<li>' + r + '</li>'; }).join('') + '</ul></div>';
  }

  document.getElementById("detailPanel").innerHTML =
    '<h2>' + (game.away || "Away") + ' @ ' + (game.home || "Home") + '</h2>' +
    '<div class="detail-sub">' + (game.time || "—") + '</div>' +
    '<div class="detail-grid">' +
      '<div class="detail-col">' +
        '<div class="box"><div class="k">Best Bet</div><div class="v inline"><span>' + (game.bestBet || "—") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.confidence || "Low") + '</span></div></div>' +
        '<div class="box"><div class="k">Moneyline</div><div class="v inline"><span>' + (game.moneyline || "N/A") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + shortSideConf(game) + '</span></div></div>' +
        '<div class="box"><div class="k">Run Line</div><div class="v inline"><span>' + (game.runLine || "N/A") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + shortRunLineConf(game) + '</span></div></div>' +
      '</div>' +
      '<div class="detail-col">' +
        '<div class="box"><div class="k">Total</div><div class="v inline"><span>' + (game.total || "N/A") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + shortTotalConf(game) + '</span></div></div>' +
        '<div class="box"><div class="k">Timing / Stake</div><div class="v inline"><span>' + (game.recommendedTiming || "—") + ' / ' + (game.recommendedStakeUnits != null ? game.recommendedStakeUnits + "u" : "—") + '</span><span class="' + pillClass(game.confidence || "Low") + '">' + (game.bestBetType || "—") + '</span></div></div>' +
        '<div class="box"><div class="k">Fair Prices</div><div class="v">Away ' + (game.fairMlAway || "—") + ' / Home ' + (game.fairMlHome || "—") + '<br>Fair Total ' + (game.fairTotal || "—") + '</div></div>' +
      '</div>' +
      '<div class="detail-col">' + propHtml + '</div>' +
    '</div>' +
    '<div class="notes"><strong>Confidence Drivers:</strong> The model can improve confidence further with live pitcher shape, bullpen fatigue, confirmed lineups, offense splits, defense/catcher impact, weather/park effects, and travel context.</div>' +
    factorGrid + '<div style="height:12px"></div>' + reasonsHtml + '<div style="height:12px"></div>' + riskWarnings;
}
function renderTable(games){
  var tbody = document.getElementById("gamesTable");
  tbody.innerHTML = "";
  if (!games.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No upcoming live data available for the selected confidence tier.</td></tr>';
    renderDetail(null);
    return;
  }
  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    var whyShort = game.reasons && game.reasons.length ? game.reasons.slice(0, 2).join(" • ") : "No reasoning returned";
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + (game.time || "—") + "</td>" +
      "<td>" + (game.away || "Away") + " @ " + (game.home || "Home") + "</td>" +
      "<td>" + (game.moneyline || "N/A") + "</td>" +
      "<td>" + (game.total || "N/A") + "</td>" +
      "<td>" + (game.runLine || "N/A") + "</td>" +
      "<td>" + (game.bestBet || "—") + "</td>" +
      "<td>" + (game.bestBetType || "—") + "</td>" +
      "<td>" + whyShort + "</td>";
    (function(g){ tr.addEventListener("click", function(){ renderDetail(g); }); })(game);
    tbody.appendChild(tr);
  }
  renderDetail(games[0]);
}
function normalizeLiveData(data){
  if (!data || !Array.isArray(data.games)) return [];
  return data.games.map(function(game) {
    var topPropOverall = null;
    if (game.topPropOverall && game.topPropOverall.player) {
      topPropOverall = {
        player: game.topPropOverall.player,
        market: game.topPropOverall.market || "",
        modelProb: game.topPropOverall.modelProb,
        reasons: Array.isArray(game.topPropOverall.reasons) ? game.topPropOverall.reasons : []
      };
    }
    return {
      id: game.id || "",
      eventId: game.eventId || "",
      rawCommenceTime: game.rawCommenceTime || "",
      time: game.time || "—",
      away: game.away || "Away",
      home: game.home || "Home",
      moneyline: game.moneyline || "N/A",
      runLine: game.runLine || "N/A",
      total: game.total || "N/A",
      bestBet: game.bestBet || "—",
      bestBetType: game.bestBetType || "—",
      confidence: game.confidence || "Low",
      reasons: Array.isArray(game.reasons) ? game.reasons : [],
      topPropOverall: topPropOverall,
      topPropOverallReason: game.topPropOverallReason || "",
      propStatus: game.propStatus || "No supported prop returned for this game.",
      moneylineConfidence: game.moneylineConfidence || null,
      totalConfidence: game.totalConfidence || null,
      runLineConfidence: game.runLineConfidence || null,
      fairMlAway: game.fairMlAway || null,
      fairMlHome: game.fairMlHome || null,
      fairTotal: game.fairTotal || null,
      recommendedTiming: game.recommendedTiming || null,
      recommendedStakeUnits: game.recommendedStakeUnits,
      componentScores: game.componentScores || null,
      riskWarnings: Array.isArray(game.riskWarnings) ? game.riskWarnings : [],
      lineupMode: game.lineupMode || "",
      lineupSource: game.lineupSource || ""
    };
  });
}
function loadDashboard(){
  fetch("/api/dashboard", { cache: "no-store" })
    .then(function(response){
      return response.text().then(function(text) {
        if (!response.ok) throw new Error("API returned " + response.status + ": " + text);
        try { return JSON.parse(text); }
        catch (e) { throw new Error("API did not return valid JSON: " + text); }
      });
    })
    .then(function(data){
      window._lastUpdated = data.lastUpdated || null;
      currentGames = normalizeLiveData(data);
      setStatus(currentGames.length ? "Live data loaded successfully." : "Live data responded, but no upcoming usable games were returned.");
      applyConfidenceFilter();
      updateSavedCount();
    })
    .catch(function(error){
      currentGames = [];
      filteredGames = [];
      setStatus("Live data unavailable. No picks shown. Check /api/dashboard. " + error.message);
      renderCards([], null);
      renderTable([]);
      updateSavedCount();
      console.error(error);
    });
}
document.getElementById("confidenceFilter").addEventListener("change", applyConfidenceFilter);
document.getElementById("savePickBtn").addEventListener("click", saveSelectedPick);
document.getElementById("exportPicksBtn").addEventListener("click", exportPicksExcel);
document.getElementById("openTrackerBtn").addEventListener("click", function(){ window.location.href = "tracker.html"; });
updateSavedCount();
loadDashboard();
</script>
</body>
</html>