<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bobby's Pick Tracker</title>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <style>
    :root{
      --bg:#14061f;--bg2:#071a26;--text:#f8f7ff;--muted:#c8b9dc;
      --good:#44f0a1;--warn:#ffd166;--bad:#ff6b8a;
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
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px;align-items:end}
    .btn,.unit-input{
      background:#10273a;color:#f8f7ff;border:1px solid rgba(255,79,216,.35);
      border-radius:12px;padding:10px 12px;font-weight:700;
    }
    .btn{cursor:pointer}
    .unit-wrap{display:flex;flex-direction:column;gap:6px}
    .unit-wrap label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#ffd8f6}
    .unit-input{width:130px}
    .cards{display:grid;grid-template-columns:repeat(6,minmax(140px,1fr));gap:14px;margin:18px 0}
    .card,.panel{
      background:linear-gradient(180deg,rgba(27,16,48,.98),rgba(16,39,58,.96));
      border:1px solid rgba(255,79,216,.35);border-radius:18px;padding:16px
    }
    .panel{padding:0}
    .label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#ffd8f6}
    .value{font-size:28px;font-weight:800;margin-top:10px}
    .small,.muted{font-size:13px;color:var(--muted);margin-top:8px}
    .panel-header{padding:16px 18px;border-bottom:1px solid rgba(57,215,255,.28);font-weight:800;display:flex;justify-content:space-between;align-items:center}
    .panel-body{padding:18px}
    .table-wrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse;min-width:1500px}
    th,td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:14px;vertical-align:top}
    th{color:#ffd9f5;font-size:12px;text-transform:uppercase;letter-spacing:.08em;background:rgba(255,79,216,.05)}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800}
    .good{background:rgba(68,240,161,.14);color:var(--good)}
    .warn{background:rgba(255,209,102,.14);color:var(--warn)}
    .bad{background:rgba(255,107,138,.14);color:var(--bad)}
    .flash{font-size:12px;color:var(--good);margin-left:6px}
    @media (max-width:1100px){.cards{grid-template-columns:repeat(3,minmax(140px,1fr))}}
    @media (max-width:800px){.cards{grid-template-columns:repeat(2,minmax(140px,1fr))}}
    @media (max-width:700px){.cards{grid-template-columns:1fr}.wrap{padding:12px}h1{font-size:26px}}
  </style>
</head>
<body>
<div class="wrap">
  <h1>Bobby's Pick Tracker</h1>
  <div class="toolbar">
    <div class="unit-wrap">
      <label for="unitSize">Unit Size ($)</label>
      <input id="unitSize" class="unit-input" type="number" min="1" step="1" value="10" />
    </div>
    <button class="btn" id="importBtn">Import Archive (Excel)</button>
    <input type="file" id="importInput" accept=".xlsx,.xls" style="display:none;">
    <button class="btn" id="refreshBtn">Refresh Grades</button>
    <button class="btn" id="exportBtn">Export Tracker (Excel)</button>
    <button class="btn" id="clearBtn">Clear Tracker</button>
    <button class="btn" id="backBtn">Back to Dashboard</button>
    <span id="flash" class="flash"></span>
  </div>

  <div class="cards">
    <div class="card"><div class="label">Tracked Picks</div><div class="value" id="cardCount">0</div><div class="small">Imported + stored archive rows</div></div>
    <div class="card"><div class="label">Graded Picks</div><div class="value" id="cardGraded">0</div><div class="small">Win / Loss / Push</div></div>
    <div class="card"><div class="label">Win Rate</div><div class="value" id="cardWinRate">—</div><div class="small">Excludes pushes and pending</div></div>
    <div class="card"><div class="label">Net Units</div><div class="value" id="cardNetUnits">—</div><div class="small">1 unit risked per bet</div></div>
    <div class="card"><div class="label">Net Profit ($)</div><div class="value" id="cardNetDollars">—</div><div class="small">Based on unit size</div></div>
    <div class="card"><div class="label">ROI %</div><div class="value" id="cardRoi">—</div><div class="small">Net units / units risked</div></div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <span>Tracked Archive</span>
      <span class="muted">Confidence, grading, ROI, and result detail</span>
    </div>
    <div class="panel-body table-wrap">
      <table>
        <thead>
          <tr>
            <th>Saved</th>
            <th>Matchup</th>
            <th>Best Bet</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Grade</th>
            <th>Odds</th>
            <th>Units</th>
            <th>Profit ($)</th>
            <th>Result Detail</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody id="trackerBody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
var STORAGE_KEY = "bobby_mlb_tracker_archive_v2";
var UNIT_SIZE_KEY = "bobby_mlb_unit_size_v1";

function flash(text){
  var el = document.getElementById("flash");
  el.textContent = text;
  setTimeout(function(){ el.textContent = ""; }, 3000);
}
function pillClass(label){
  if (label === "High") return "pill good";
  if (label === "Medium") return "pill warn";
  return "pill bad";
}
function getTrackedPicks(){
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch(e) { return []; }
}
function setTrackedPicks(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

function getUnitSize(){
  var stored = localStorage.getItem(UNIT_SIZE_KEY);
  var n = Number(stored || document.getElementById("unitSize").value || 10);
  return isFinite(n) && n > 0 ? n : 10;
}
function setUnitSize(n){
  localStorage.setItem(UNIT_SIZE_KEY, String(n));
}

function normalizeName(name){
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
function normalizeTeam(name){
  return String(name || "").replace(/\s+/g," ").trim()
    .replace(/^Chi White Sox$/i, "Chicago White Sox")
    .replace(/^Chi Cubs$/i, "Chicago Cubs")
    .replace(/^NY Yankees$/i, "New York Yankees")
    .replace(/^NY Mets$/i, "New York Mets")
    .replace(/^LA Angels$/i, "Los Angeles Angels")
    .replace(/^LA Dodgers$/i, "Los Angeles Dodgers");
}
function americanToProfitPerUnit(price){
  if (price === null || price === undefined || price === "") return null;
  var n = Number(price);
  if (!isFinite(n)) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}
function parseBetOddsFromText(text){
  var m = String(text || "").match(/([+-]\d{3,4})/);
  return m ? Number(m[1]) : null;
}
function inferPriceFromPick(pick){
  if (/ ML$/i.test(pick.bestBet || "")) {
    if ((pick.bestBet || "").indexOf(pick.away + " ML") === 0) {
      var m1 = String(pick.moneyline || "").match(new RegExp(pick.away.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s+([+-]\\d+)"));
      return m1 ? Number(m1[1]) : null;
    }
    if ((pick.bestBet || "").indexOf(pick.home + " ML") === 0) {
      var m2 = String(pick.moneyline || "").match(new RegExp(pick.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s+([+-]\\d+)"));
      return m2 ? Number(m2[1]) : null;
    }
  }
  if (/^Over /i.test(pick.bestBet || "") || /^Under /i.test(pick.bestBet || "")) return parseBetOddsFromText(pick.total);
  if ((pick.bestBet || "").indexOf(pick.away) === 0 || (pick.bestBet || "").indexOf(pick.home) === 0) return parseBetOddsFromText(pick.runLine);
  return null;
}
function calcNetUnits(pick){
  if (pick.grade === "Win") {
    var price = inferPriceFromPick(pick);
    var profitPerUnit = americanToProfitPerUnit(price);
    return profitPerUnit != null ? Number(profitPerUnit.toFixed(2)) : 1.00;
  }
  if (pick.grade === "Loss") return -1.00;
  if (pick.grade === "Push") return 0.00;
  return null;
}
function calcProfitDollars(units){
  if (units === null || units === undefined || !isFinite(units)) return null;
  return Number((units * getUnitSize()).toFixed(2));
}
function getGameDateEt(rawIso){
  try { return new Date(rawIso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); }
  catch(e) { return null; }
}
async function fetchScheduleForDate(dateEt){
  var url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=" + encodeURIComponent(dateEt);
  var res = await fetch(url);
  if (!res.ok) throw new Error("Schedule fetch failed");
  return res.json();
}
async function fetchBoxscore(gamePk){
  var url = "https://statsapi.mlb.com/api/v1/game/" + gamePk + "/boxscore";
  var res = await fetch(url);
  if (!res.ok) throw new Error("Boxscore fetch failed");
  return res.json();
}
function findMatchingGame(scheduleJson, pick){
  var dates = Array.isArray(scheduleJson.dates) ? scheduleJson.dates : [];
  for (var i=0;i<dates.length;i++){
    var games = Array.isArray(dates[i].games) ? dates[i].games : [];
    for (var j=0;j<games.length;j++){
      var g = games[j];
      var away = normalizeTeam(g.teams?.away?.team?.name);
      var home = normalizeTeam(g.teams?.home?.team?.name);
      if (away === normalizeTeam(pick.away) && home === normalizeTeam(pick.home)) return g;
    }
  }
  return null;
}
function parseProp(pick){
  var text = String(pick.bestBet || "");
  var m = text.match(/^(.*?)\s+(Pitcher Strikeouts|Pitcher Outs|Hits|Total Bases|Home Runs)\s+(Over|Under)\s+(\d+(\.\d+)?)$/i);
  if (!m) return null;
  return { player:m[1].trim(), market:m[2].trim().toLowerCase(), side:m[3].trim().toLowerCase(), line:Number(m[4]) };
}
function inningsToOuts(ip){
  if (ip == null) return null;
  var s = String(ip), parts = s.split(".");
  return Number(parts[0] || 0) * 3 + Number(parts[1] || 0);
}
function totalBasesFromBatting(stats){
  var hits = Number(stats.hits || 0), doubles = Number(stats.doubles || 0), triples = Number(stats.triples || 0), hr = Number(stats.homeRuns || 0);
  return hits + doubles + (2 * triples) + (3 * hr);
}
function findPlayerStatsInBoxscore(boxscore, playerName){
  var target = normalizeName(playerName);
  var teams = [boxscore.teams?.away, boxscore.teams?.home];
  for (var t=0;t<teams.length;t++){
    var players = teams[t]?.players || {};
    for (var key in players){
      var p = players[key];
      var full = normalizeName(p.person?.fullName);
      if (full && (full === target || full.includes(target) || target.includes(full))) return p;
    }
  }
  return null;
}
function gradePropFromBoxscore(pick, boxscore){
  var parsed = parseProp(pick);
  if (!parsed) { pick.resultStatus = "Pending Prop Grading"; pick.resultDetail = "Unsupported prop parser"; return pick; }
  var player = findPlayerStatsInBoxscore(boxscore, parsed.player);
  if (!player) { pick.resultStatus = "Pending Prop Grading"; pick.resultDetail = "Player not found in boxscore"; return pick; }

  var batting = player.stats?.batting || {}, pitching = player.stats?.pitching || {};
  var actual = null;

  if (parsed.market === "pitcher strikeouts") actual = Number(pitching.strikeOuts || 0);
  else if (parsed.market === "pitcher outs") actual = inningsToOuts(pitching.inningsPitched);
  else if (parsed.market === "hits") actual = Number(batting.hits || 0);
  else if (parsed.market === "total bases") actual = totalBasesFromBatting(batting);
  else if (parsed.market === "home runs") actual = Number(batting.homeRuns || 0);

  if (actual == null || !isFinite(actual)) { pick.resultStatus = "Pending Prop Grading"; pick.resultDetail = "Relevant stat unavailable"; return pick; }

  pick.resultStatus = "Final";
  pick.grade = parsed.side === "over"
    ? (actual > parsed.line ? "Win" : (actual === parsed.line ? "Push" : "Loss"))
    : (actual < parsed.line ? "Win" : (actual === parsed.line ? "Push" : "Loss"));
  pick.resultDetail = parsed.player + " " + parsed.market + " = " + actual;
  pick.netUnits = calcNetUnits(pick);
  pick.profitDollars = calcProfitDollars(pick.netUnits);
  pick.oddsPrice = inferPriceFromPick(pick);
  return pick;
}
function gradePickFromGame(pick, game, boxscore){
  var status = game.status?.detailedState || "Unknown";
  var isFinal = /final/i.test(status);
  if (!isFinal) {
    pick.resultStatus = status;
    pick.grade = "";
    pick.resultDetail = "";
    pick.netUnits = null;
    pick.profitDollars = null;
    return pick;
  }

  if ((pick.bestBetType || "") === "Prop") return gradePropFromBoxscore(pick, boxscore);

  var away = Number(game.teams.away.score || 0), home = Number(game.teams.home.score || 0), totalRuns = away + home;
  var bestBet = String(pick.bestBet || ""), detail = away + "-" + home;
  pick.resultStatus = "Final";

  if (/ ML$/i.test(bestBet)) {
    var win = (bestBet.indexOf(pick.away + " ML") === 0 && away > home) || (bestBet.indexOf(pick.home + " ML") === 0 && home > away);
    pick.grade = win ? "Win" : "Loss";
    pick.resultDetail = detail;
  } else if (/^Over /i.test(bestBet) || /^Under /i.test(bestBet)) {
    var line = Number((bestBet.match(/(\d+(\.\d+)?)/) || [])[1]);
    if (!isFinite(line)) { pick.grade = ""; pick.resultDetail = detail; }
    else {
      pick.grade = /^Over /i.test(bestBet)
        ? (totalRuns > line ? "Win" : (totalRuns === line ? "Push" : "Loss"))
        : (totalRuns < line ? "Win" : (totalRuns === line ? "Push" : "Loss"));
      pick.resultDetail = detail + " total=" + totalRuns;
    }
  } else if ((bestBet.indexOf(pick.away) === 0 || bestBet.indexOf(pick.home) === 0) && pick.runLine) {
    var isAway = bestBet.indexOf(pick.away) === 0;
    var teamName = isAway ? pick.away : pick.home;
    var m = String(pick.runLine).match(new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s+([+-]\\d+(?:\\.\\d+)?)"));
    var rl = m ? Number(m[1]) : null;
    if (rl == null) { pick.grade = ""; pick.resultDetail = detail; }
    else {
      var margin = isAway ? (away - home + rl) : (home - away + rl);
      pick.grade = margin > 0 ? "Win" : (margin === 0 ? "Push" : "Loss");
      pick.resultDetail = detail;
    }
  } else {
    pick.resultStatus = "Pending";
    pick.grade = "";
    pick.resultDetail = "Unsupported bet type";
    pick.netUnits = null;
    pick.profitDollars = null;
    return pick;
  }

  pick.oddsPrice = inferPriceFromPick(pick);
  pick.netUnits = calcNetUnits(pick);
  pick.profitDollars = calcProfitDollars(pick.netUnits);
  return pick;
}
async function refreshGrades(){
  var picks = getTrackedPicks();
  if (!picks.length) return render([]);

  var datesNeeded = {};
  picks.forEach(function(p){ if (p.rawCommenceTime) { var d = getGameDateEt(p.rawCommenceTime); if (d) datesNeeded[d] = true; } });

  var scheduleCache = {}, boxscoreCache = {}, dateKeys = Object.keys(datesNeeded);
  for (var i=0;i<dateKeys.length;i++){ try { scheduleCache[dateKeys[i]] = await fetchScheduleForDate(dateKeys[i]); } catch(e) {} }

  var updated = [];
  for (var k=0;k<picks.length;k++){
    var out = Object.assign({}, picks[k]);
    var dateKey = out.rawCommenceTime ? getGameDateEt(out.rawCommenceTime) : null;
    var schedule = dateKey ? scheduleCache[dateKey] : null;
    var game = schedule ? findMatchingGame(schedule, out) : null;

    if (game) {
      var gamePk = game.gamePk;
      if (!boxscoreCache[gamePk]) {
        try { boxscoreCache[gamePk] = await fetchBoxscore(gamePk); } catch(e) { boxscoreCache[gamePk] = null; }
      }
      updated.push(gradePickFromGame(out, game, boxscoreCache[gamePk] || {}));
    } else updated.push(out);
  }

  setTrackedPicks(updated);
  render(updated);
  flash("Grades refreshed");
}
function dedupeMerge(existing, imported){
  var map = {};
  existing.concat(imported).forEach(function(p){
    var key = p.archiveId || [p.eventId, p.rawCommenceTime, p.bestBet, p.bestBetType].join("|");
    map[key] = Object.assign({}, map[key] || {}, p);
  });
  return Object.keys(map).map(function(k){ return map[k]; });
}
function normalizeImportedRow(r){
  return {
    archiveId: r.archiveId || [r.eventId || "", r.rawCommenceTime || "", r.bestBet || "", r.bestBetType || ""].join("|"),
    archivedAt: r.archivedAt || r.savedAt || new Date().toISOString(),
    source: r.source || "Imported archive",
    eventId: r.eventId || "",
    rawCommenceTime: r.rawCommenceTime || "",
    away: r.away || "",
    home: r.home || "",
    matchup: r.matchup || ((r.away || "") + " @ " + (r.home || "")),
    bestBet: r.bestBet || "",
    bestBetType: r.bestBetType || "",
    confidence: r.confidence || "Low",
    moneyline: r.moneyline || "",
    total: r.total || "",
    runLine: r.runLine || "",
    resultStatus: r.resultStatus || "Pending",
    resultDetail: r.resultDetail || "",
    grade: r.grade || "",
    oddsPrice: r.oddsPrice || null,
    netUnits: r.netUnits || null,
    profitDollars: r.profitDollars || null
  };
}
function importWorkbook(file){
  var reader = new FileReader();
  reader.onload = function(e){
    var data = new Uint8Array(e.target.result);
    var wb = XLSX.read(data, {type:"array"});
    var rows = [];
    wb.SheetNames.forEach(function(name){
      rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:""}));
    });
    var imported = rows.map(normalizeImportedRow).filter(function(r){ return r.bestBet; });
    var merged = dedupeMerge(getTrackedPicks(), imported);
    setTrackedPicks(merged);
    render(merged);
    flash("Archive imported");
  };
  reader.readAsArrayBuffer(file);
}
function render(picks){
  var body = document.getElementById("trackerBody");
  body.innerHTML = "";
  if (!picks.length) {
    body.innerHTML = '<tr><td colspan="12" class="muted">No tracked picks yet.</td></tr>';
    return updateCards([]);
  }
  picks.forEach(function(p){
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + (p.archivedAt ? new Date(p.archivedAt).toLocaleString() : "—") + "</td>" +
      "<td>" + (p.matchup || "—") + "</td>" +
      "<td>" + (p.bestBet || "—") + "</td>" +
      "<td>" + (p.bestBetType || "—") + "</td>" +
      "<td><span class='" + pillClass(p.confidence || "Low") + "'>" + (p.confidence || "Low") + "</span></td>" +
      "<td>" + (p.resultStatus || "Pending") + "</td>" +
      "<td>" + (p.grade || "—") + "</td>" +
      "<td>" + (p.oddsPrice != null ? (p.oddsPrice > 0 ? "+" + p.oddsPrice : p.oddsPrice) : "—") + "</td>" +
      "<td>" + (p.netUnits != null ? Number(p.netUnits).toFixed(2) : "—") + "</td>" +
      "<td>" + (p.profitDollars != null ? "$" + Number(p.profitDollars).toFixed(2) : "—") + "</td>" +
      "<td>" + (p.resultDetail || "—") + "</td>" +
      "<td>" + (p.source || "Archive") + "</td>";
    body.appendChild(tr);
  });
  updateCards(picks);
}
function updateCards(picks){
  document.getElementById("cardCount").textContent = picks.length;

  var graded = picks.filter(function(p){ return p.grade === "Win" || p.grade === "Loss" || p.grade === "Push"; });
  document.getElementById("cardGraded").textContent = graded.length;

  var wins = graded.filter(function(p){ return p.grade === "Win"; }).length;
  var losses = graded.filter(function(p){ return p.grade === "Loss"; }).length;
  var denom = wins + losses;
  document.getElementById("cardWinRate").textContent = denom ? ((wins / denom) * 100).toFixed(1) + "%" : "—";

  var netUnits = 0;
  graded.forEach(function(p){
    var n = Number(p.netUnits);
    if (isFinite(n)) netUnits += n;
  });
  document.getElementById("cardNetUnits").textContent = graded.length ? netUnits.toFixed(2) : "—";

  var netDollars = netUnits * getUnitSize();
  document.getElementById("cardNetDollars").textContent = graded.length ? "$" + netDollars.toFixed(2) : "—";

  var totalUnitsRisked = graded.filter(function(p){ return p.grade === "Win" || p.grade === "Loss"; }).length;
  var roi = totalUnitsRisked ? (netUnits / totalUnitsRisked) * 100 : null;
  document.getElementById("cardRoi").textContent = roi != null ? roi.toFixed(1) + "%" : "—";
}

document.getElementById("importBtn").addEventListener("click", function(){ document.getElementById("importInput").click(); });
document.getElementById("importInput").addEventListener("change", function(e){
  var file = e.target.files && e.target.files[0];
  if (file) importWorkbook(file);
  e.target.value = "";
});
document.getElementById("refreshBtn").addEventListener("click", refreshGrades);
document.getElementById("exportBtn").addEventListener("click", function(){
  var picks = getTrackedPicks();
  if (!picks.length) return;
  var ws = XLSX.utils.json_to_sheet(picks);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tracker");
  XLSX.writeFile(wb, "bobbys_mlb_pick_tracker.xlsx");
});
document.getElementById("clearBtn").addEventListener("click", function(){
  if (confirm("Clear tracker archive?")) { setTrackedPicks([]); render([]); }
});
document.getElementById("backBtn").addEventListener("click", function(){ window.location.href = "index.html"; });
document.getElementById("unitSize").addEventListener("input", function(){
  var n = Number(this.value || 10);
  if (isFinite(n) && n > 0) {
    setUnitSize(n);
    render(getTrackedPicks());
  }
});

document.getElementById("unitSize").value = getUnitSize();
render(getTrackedPicks());
</script>
</body>
</html>
module.exports = async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const baseUrl =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&bookmakers=betmgm` +
    `&oddsFormat=american` +
    `&commenceTimeFrom=${nowIso}`;

  try {
    const [oddsResponse, mlbLineups] = await Promise.all([
      fetch(baseUrl),
      fetchOfficialLineupsFromMLB()
    ]);

    if (!oddsResponse.ok) {
      return res.status(oddsResponse.status).json({
        error: "Odds API request failed",
        details: await oddsResponse.text(),
        debugUrl: baseUrl
      });
    }

    const data = await oddsResponse.json();

    const upcomingGames = (Array.isArray(data) ? data : []).filter(game => {
      if (!game || !game.commence_time) return false;
      return new Date(game.commence_time).getTime() > Date.now();
    });

    const limitedGames = upcomingGames.slice(0, 10);

    const games = await Promise.all(
      limitedGames.map(async (game, index) => {
        const bookmaker = Array.isArray(game.bookmakers) ? game.bookmakers[0] : null;
        const markets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

        const h2hMarket = markets.find(m => m.key === "h2h");
        const spreadMarket = markets.find(m => m.key === "spreads");
        const totalMarket = markets.find(m => m.key === "totals");

        const homeTeam = game.home_team || "Home";
        const awayTeam = game.away_team || "Away";

        const moneylineData = parseMoneyline(h2hMarket, homeTeam, awayTeam);
        const spreadData = parseSpreads(spreadMarket, homeTeam, awayTeam);
        const totalData = parseTotals(totalMarket);

        const lineupContext = buildLineupContext({
          homeTeam,
          awayTeam,
          mlbLineups
        });

        const propResult = await fetchTopPropForEvent(game.id, apiKey, lineupContext);

        const componentScores = buildComponentScores({
          moneylineData,
          totalData,
          lineupContext
        });

        const modelOutputs = buildModelOutputs({
          componentScores,
          moneylineData,
          totalData,
          lineupContext,
          propResult
        });

        const recommendation = buildRecommendation({
          homeTeam,
          awayTeam,
          moneylineData,
          totalData,
          modelOutputs,
          componentScores,
          propResult
        });

        return {
          id: String(index + 1),
          eventId: game.id,
          rawCommenceTime: game.commence_time || null,
          time: game.commence_time
            ? (() => {
                const t = new Date(game.commence_time).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York"
                });
                return t + " ET";
              })()
            : "TBD",
          away: awayTeam,
          home: homeTeam,

          moneyline: moneylineData.display,
          runLine: spreadData.display,
          total: totalData.display,

          fairMlAway: modelOutputs.fairMlAway,
          fairMlHome: modelOutputs.fairMlHome,
          fairTotal: modelOutputs.fairTotal,

          awayWinProb: modelOutputs.awayWinProb,
          homeWinProb: modelOutputs.homeWinProb,

          awayEdgePct: modelOutputs.awayEdgePct,
          homeEdgePct: modelOutputs.homeEdgePct,
          overEdgePct: modelOutputs.overEdgePct,
          underEdgePct: modelOutputs.underEdgePct,

          moneylineConfidence: {
            away: modelOutputs.awayWinProb,
            home: modelOutputs.homeWinProb
          },
          totalConfidence: {
            over: modelOutputs.overConfidence,
            under: modelOutputs.underConfidence
          },
          runLineConfidence: {
            away: modelOutputs.awayRunLineConfidence,
            home: modelOutputs.homeRunLineConfidence
          },

          lineupMode: lineupContext.lineupMode,
          lineupSource: lineupContext.lineupSource,
          officialLineupAvailable: lineupContext.officialLineupAvailable,
          projectedLineupUsed: lineupContext.projectedLineupUsed,
          projectedLineups: lineupContext.projectedLineups,
          officialLineups: lineupContext.officialLineups,

          bestBet: recommendation.bestBet,
          bestBetType: recommendation.bestBetType,
          bestBetOdds: deriveBestBetOdds({
            recommendation,
            moneylineData,
            spreadData,
            totalData,
            propResult,
            homeTeam,
            awayTeam
          }),
          confidence: recommendation.confidence,
          confidenceScore: recommendation.confidenceScore,
          recommendedTiming: recommendation.recommendedTiming,
          recommendedStakeUnits: recommendation.recommendedStakeUnits,
          reasons: recommendation.reasons,

          topPropOverall: propResult.topProp,
          topPropOverallReason: propResult.topProp
            ? buildTopPropOverallReason(propResult.topProp, lineupContext)
            : propResult.status,
          propStatus: propResult.status,

          componentScores,
          riskWarnings: recommendation.riskWarnings
        };
      })
    );

    return res.status(200).json({
      lastUpdated: new Date().toISOString(),
      notes: [
        "Official lineups are checked from MLB starting-lineups page first.",
        "Props are now optional challengers and must clearly beat game markets.",
        "Best-bet odds are returned so props and game bets can be archived for ROI tracking."
      ],
      games
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not load odds data",
      details: error && error.message ? error.message : String(error)
    });
  }
};

async function fetchOfficialLineupsFromMLB() {
  const url = "https://www.mlb.com/starting-lineups";

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" }
    });

    if (!response.ok) return {};

    const html = await response.text();
    return parseMLBStartingLineups(html);
  } catch (error) {
    return {};
  }
}

function parseMLBStartingLineups(html) {
  const map = {};

  const cleaned = html
    .replace(/\r/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n");

  const lines = cleaned
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "@") continue;

    if (i + 2 < lines.length && lines[i + 1] === "@") {
      const away = normalizeTeamName(lines[i]);
      const home = normalizeTeamName(lines[i + 2]);

      const key = matchupKey(away, home);
      const block = lines.slice(i, Math.min(i + 220, lines.length));

      const lineupGroups = extractTeamLineupGroups(block, away, home);
      const awayPlayers = firstValidLineup(lineupGroups.away);
      const homePlayers = firstValidLineup(lineupGroups.home);

      map[key] = {
        awayTeam: away,
        homeTeam: home,
        awayPlayers,
        homePlayers
      };
    }
  }

  return map;
}

function extractTeamLineupGroups(block, awayTeam, homeTeam) {
  const result = { away: [], home: [] };

  for (let i = 0; i < block.length; i++) {
    const line = block[i];

    if (line === `${teamAbbrevHint(awayTeam)} Lineup` || line === `${awayTeam} Lineup`) {
      result.away.push(extractOneLineup(block, i + 1));
    }

    if (line === `${teamAbbrevHint(homeTeam)} Lineup` || line === `${homeTeam} Lineup`) {
      result.home.push(extractOneLineup(block, i + 1));
    }
  }

  return result;
}

function extractOneLineup(block, startIndex) {
  const players = [];

  for (let i = startIndex; i < block.length; i++) {
    const line = block[i];

    if (/Lineup$/.test(line) && players.length > 0) break;
    if (/^Gameday/.test(line) && players.length > 0) break;
    if (/^\d+\.\s+TBD$/i.test(line)) return [];

    const fullNameMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]+$/);
    if (fullNameMatch) {
      players.push(fullNameMatch[1].trim());
      continue;
    }

    const shortNameMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z]{1,3}$/);
    if (shortNameMatch) {
      players.push(shortNameMatch[1].trim());
      continue;
    }

    const noPosMatch = line.match(/^\d+\.\s+(.+?)\s+\(([LRS])\)$/);
    if (noPosMatch) {
      players.push(noPosMatch[1].trim());
      continue;
    }

    if (players.length >= 9) break;
  }

  return players;
}

function firstValidLineup(groups) {
  if (!Array.isArray(groups)) return [];
  for (const g of groups) {
    if (Array.isArray(g) && g.length === 9) return g;
  }
  return [];
}

function buildLineupContext({ homeTeam, awayTeam, mlbLineups }) {
  const key = matchupKey(awayTeam, homeTeam);
  const official = mlbLineups[key];

  const hasOfficial =
    official &&
    Array.isArray(official.awayPlayers) &&
    official.awayPlayers.length === 9 &&
    Array.isArray(official.homePlayers) &&
    official.homePlayers.length === 9;

  const projectedLineups = {
    away: buildProjectedLineupShell(awayTeam),
    home: buildProjectedLineupShell(homeTeam)
  };

  const officialLineups = hasOfficial
    ? {
        away: {
          team: awayTeam,
          status: "official",
          players: official.awayPlayers.map(name => ({ name }))
        },
        home: {
          team: homeTeam,
          status: "official",
          players: official.homePlayers.map(name => ({ name }))
        }
      }
    : { away: null, home: null };

  return {
    lineupMode: hasOfficial ? "official" : "projected",
    lineupSource: hasOfficial ? "MLB Starting Lineups" : "Projected lineup feed",
    officialLineupAvailable: hasOfficial,
    projectedLineupUsed: !hasOfficial,
    projectedLineups,
    officialLineups
  };
}

function buildProjectedLineupShell(teamName) {
  return {
    team: teamName,
    status: "projected",
    players: [],
    note: "Projected lineup placeholder."
  };
}

function buildComponentScores({ moneylineData, totalData, lineupContext }) {
  const homeMarketLean =
    moneylineData.homeProb !== null && moneylineData.awayProb !== null
      ? clamp((moneylineData.homeProb - moneylineData.awayProb) * 4, -2, 2)
      : 0;

  const totalMarketLean =
    totalData.overProb !== null && totalData.underProb !== null
      ? clamp((totalData.overProb - totalData.underProb) * 4, -2, 2)
      : 0;

  const lineupScore = lineupContext.officialLineupAvailable ? 0.25 : 0.0;

  return {
    side: {
      startingPitcher: 0,
      bullpen: 0,
      lineup: lineupScore,
      offenseVsHand: 0,
      defense: 0,
      parkWeather: 0,
      scheduleTravel: 0,
      marketContext: round2(homeMarketLean)
    },
    total: {
      starterRunSuppression: 0,
      bullpenRunSuppression: 0,
      offenseQuality: 0,
      lineups: lineupScore,
      parkFactor: 0,
      weather: 0,
      catcherDefense: 0,
      marketContext: round2(totalMarketLean)
    },
    liveFeedStatus: {
      startingPitcher: "placeholder",
      bullpen: "placeholder",
      lineup: lineupContext.officialLineupAvailable ? "official" : "projected",
      offenseVsHand: "placeholder",
      defense: "placeholder",
      parkWeather: "placeholder",
      scheduleTravel: "placeholder",
      marketContext: "live"
    }
  };
}

function buildModelOutputs({ componentScores, moneylineData, totalData, lineupContext, propResult }) {
  const sideComposite =
    (0.30 * componentScores.side.startingPitcher) +
    (0.20 * componentScores.side.bullpen) +
    (0.15 * componentScores.side.lineup) +
    (0.15 * componentScores.side.offenseVsHand) +
    (0.05 * componentScores.side.defense) +
    (0.05 * componentScores.side.parkWeather) +
    (0.05 * componentScores.side.scheduleTravel) +
    (0.05 * componentScores.side.marketContext);

  const totalComposite =
    (0.25 * componentScores.total.starterRunSuppression) +
    (0.20 * componentScores.total.bullpenRunSuppression) +
    (0.20 * componentScores.total.offenseQuality) +
    (0.10 * componentScores.total.lineups) +
    (0.10 * componentScores.total.parkFactor) +
    (0.10 * componentScores.total.weather) +
    (0.05 * componentScores.total.catcherDefense);

  const marketHomeProb = moneylineData.homeProb ?? 0.50;
  const marketAwayProb = moneylineData.awayProb ?? 0.50;

  const homeWinProb = clamp(marketHomeProb + (sideComposite * 0.04), 0.15, 0.85);
  const awayWinProb = clamp(1 - homeWinProb, 0.15, 0.85);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketTotalLine = totalData.point ?? null;
  const marketOverProb = totalData.overProb ?? 0.50;

  let fairTotal = null;
  if (marketTotalLine !== null) {
    fairTotal = round1(marketTotalLine + (totalComposite * 0.45));
  }

  const fairOverProb = clamp(marketOverProb + (totalComposite * 0.05), 0.15, 0.85);
  const fairUnderProb = clamp(1 - fairOverProb, 0.15, 0.85);

  const marketSpreadFav = deriveSpreadFavorite(moneylineData);
  const homeRunLineConfidence = clamp(homeWinProb + (marketSpreadFav === "home" ? 0.06 : -0.02), 0.10, 0.90);
  const awayRunLineConfidence = clamp(awayWinProb + (marketSpreadFav === "away" ? 0.06 : -0.02), 0.10, 0.90);

  const propConfidenceCap = lineupContext.officialLineupAvailable ? 100 : 69;
  if (propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
    propResult.topProp.modelProb = Math.min(propResult.topProp.modelProb, propConfidenceCap);
    propResult.topProp.confidence = propResult.topProp.modelProb >= 60 ? "Medium" : "Low";
    if (lineupContext.officialLineupAvailable && propResult.topProp.modelProb >= 70) {
      propResult.topProp.confidence = "High";
    }
  }

  return {
    sideComposite: round2(sideComposite),
    totalComposite: round2(totalComposite),

    fairMlAway,
    fairMlHome,
    fairTotal,

    awayWinProb: toPctNumber(awayWinProb),
    homeWinProb: toPctNumber(homeWinProb),

    awayEdgePct: toEdgePct(awayWinProb, marketAwayProb),
    homeEdgePct: toEdgePct(homeWinProb, marketHomeProb),
    overEdgePct: toEdgePct(fairOverProb, marketOverProb),
    underEdgePct: toEdgePct(fairUnderProb, 1 - marketOverProb),

    overConfidence: toPctNumber(fairOverProb),
    underConfidence: toPctNumber(fairUnderProb),
    awayRunLineConfidence: toPctNumber(awayRunLineConfidence),
    homeRunLineConfidence: toPctNumber(homeRunLineConfidence)
  };
}

function deriveSpreadFavorite(moneylineData) {
  if (moneylineData.homeProb === null || moneylineData.awayProb === null) return null;
  if (moneylineData.homeProb > moneylineData.awayProb) return "home";
  if (moneylineData.awayProb > moneylineData.homeProb) return "away";
  return null;
}

function buildRecommendation({
  homeTeam,
  awayTeam,
  moneylineData,
  totalData,
  modelOutputs,
  componentScores,
  propResult
}) {
  const gameCandidates = [];

  if (typeof modelOutputs.homeEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${homeTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.homeEdgePct,
      reasons: buildSideReasons(homeTeam, "home", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.homeEdgePct)
    });
  }

  if (typeof modelOutputs.awayEdgePct === "number") {
    gameCandidates.push({
      bestBet: `${awayTeam} ML`,
      bestBetType: "Side",
      edge: modelOutputs.awayEdgePct,
      reasons: buildSideReasons(awayTeam, "away", modelOutputs, componentScores, moneylineData),
      scoreForConfidence: Math.abs(modelOutputs.awayEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.overEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Over ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.overEdgePct,
      reasons: buildTotalReasons("Over", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.overEdgePct)
    });
  }

  if (totalData.point !== null && typeof modelOutputs.underEdgePct === "number") {
    gameCandidates.push({
      bestBet: `Under ${totalData.point}`,
      bestBetType: "Total",
      edge: modelOutputs.underEdgePct,
      reasons: buildTotalReasons("Under", totalData.point, modelOutputs, componentScores),
      scoreForConfidence: Math.abs(modelOutputs.underEdgePct)
    });
  }

  const positiveGames = gameCandidates.filter(c => typeof c.edge === "number" && c.edge > 0);
  const bestGame = positiveGames.sort((a, b) => b.edge - a.edge)[0] || null;

  let best = bestGame;

  if (propResult && propResult.topProp && typeof propResult.topProp.modelProb === "number") {
    const propEdge = Math.abs(propResult.topProp.modelProb - 50);
    const propCandidate = {
      bestBet: `${propResult.topProp.player} ${propResult.topProp.market}`,
      bestBetType: "Prop",
      edge: propEdge,
      reasons: [
        `Lineup mode used: ${propResult.lineupMode}.`,
        `Lineup source used: ${propResult.lineupSource}.`,
        `Implied market-based prop probability is ${propResult.topProp.modelProb}%.`,
        propResult.lineupMode === "projected"
          ? "Projected-lineup props are intentionally capped until official lineups are connected."
          : "Official lineup mode is active for this prop."
      ],
      scoreForConfidence: propEdge
    };

    const propMustBeatBy = 0.8;
    if (!bestGame || propCandidate.edge >= bestGame.edge + propMustBeatBy) {
      best = propCandidate;
    }
  }

  if (!best) {
    return {
      bestBet: "Pass",
      bestBetType: "Pass",
      confidence: "Low",
      confidenceScore: 0,
      recommendedTiming: "Pass",
      recommendedStakeUnits: 0,
      reasons: [
        "No positive edge was created by the current model.",
        "No bet is better than a bad bet."
      ],
      riskWarnings: buildRiskWarnings(componentScores)
    };
  }

  const confidenceScore = round1(best.scoreForConfidence);
  const confidence = confidenceFromEdge(best.scoreForConfidence);

  return {
    bestBet: best.bestBet,
    bestBetType: best.bestBetType,
    confidence,
    confidenceScore,
    recommendedTiming: "—",
    recommendedStakeUnits: null,
    reasons: best.reasons,
    riskWarnings: buildRiskWarnings(componentScores)
  };
}