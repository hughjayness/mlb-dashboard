function buildComponentScores(args) {
  const lineupContext = args.lineupContext || {};
  const parkFactor = Number(args.parkFactor || 1.0);
  const probablePitchers = args.probablePitchers || {};

  const starterDelta =
    (probablePitchers.home !== "TBD" ? 0.35 : 0) -
    (probablePitchers.away !== "TBD" ? 0.35 : 0);

  const lineupTilt = getLineupStrengthTilt(lineupContext);
  const bullpenTilt = 0.12;
  const offenseTilt = lineupTilt * 0.75;

  const totalStarterImpact =
    probablePitchers.home !== "TBD" && probablePitchers.away !== "TBD"
      ? -0.18
      : 0.10;

  const totalLineupImpact = lineupContext.officialLineupAvailable ? 0.08 : -0.04;
  const totalParkImpact = round2((parkFactor - 1.0) * 3.5);
  const totalBullpenImpact = 0.06;

  return {
    side: {
      startingPitcher: round2(starterDelta),
      bullpen: round2(bullpenTilt),
      lineup: round2(lineupTilt),
      offenseVsHand: round2(offenseTilt)
    },
    total: {
      starters: round2(totalStarterImpact),
      lineup: round2(totalLineupImpact),
      parkFactor: round2(totalParkImpact),
      bullpen: round2(totalBullpenImpact)
    },
    liveFeedStatus: {
      bullpen: "placeholder",
      scheduleTravel: "placeholder",
      defense: "placeholder",
      marketContext: "placeholder"
    }
  };
}

function buildModelOutputs(args) {
  const componentScores = args.componentScores || {};
  const moneylineData = args.moneylineData || {};
  const totalData = args.totalData || {};
  const parkFactor = Number(args.parkFactor || 1.0);

  const sideComposite =
    Number(componentScores.side && componentScores.side.startingPitcher || 0) +
    Number(componentScores.side && componentScores.side.bullpen || 0) +
    Number(componentScores.side && componentScores.side.lineup || 0) +
    Number(componentScores.side && componentScores.side.offenseVsHand || 0);

  const totalComposite =
    Number(componentScores.total && componentScores.total.starters || 0) +
    Number(componentScores.total && componentScores.total.lineup || 0) +
    Number(componentScores.total && componentScores.total.parkFactor || 0) +
    Number(componentScores.total && componentScores.total.bullpen || 0);

  const homeWinProb = clamp(0.5 + (sideComposite * 0.08), 0.35, 0.65);
  const awayWinProb = round2(1 - homeWinProb);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketHomeProb = moneylineData.homePrice != null ? americanToImpliedProb(moneylineData.homePrice) : null;
  const marketAwayProb = moneylineData.awayPrice != null ? americanToImpliedProb(moneylineData.awayPrice) : null;

  const awayEdgePct = marketAwayProb != null ? round2((awayWinProb - marketAwayProb) * 100) : 0;
  const homeEdgePct = marketHomeProb != null ? round2((homeWinProb - marketHomeProb) * 100) : 0;

  const baseTotal = totalData.line != null ? Number(totalData.line) : 8.0;
  const fairTotal = round2(baseTotal + (totalComposite * 0.65) + ((parkFactor - 1.0) * 1.2));

  const overProb = clamp(0.5 + ((fairTotal - baseTotal) * 0.09), 0.32, 0.68);
  const underProb = round2(1 - overProb);

  const marketOverProb = totalData.overPrice != null ? americanToImpliedProb(totalData.overPrice) : null;
  const marketUnderProb = totalData.underPrice != null ? americanToImpliedProb(totalData.underPrice) : null;

  return {
    sideComposite: round2(sideComposite),
    totalComposite: round2(totalComposite),

    fairMlAway: fairMlAway,
    fairMlHome: fairMlHome,
    fairTotal: fairTotal,

    awayWinProb: round2(awayWinProb * 100),
    homeWinProb: round2(homeWinProb * 100),

    awayEdgePct: awayEdgePct,
    homeEdgePct: homeEdgePct,
    overEdgePct: marketOverProb != null ? round2((overProb - marketOverProb) * 100) : 0,
    underEdgePct: marketUnderProb != null ? round2((underProb - marketUnderProb) * 100) : 0,

    overConfidence: round2(overProb * 100),
    underConfidence: round2(underProb * 100),

    awayRunLineConfidence: round2(clamp(50 + (awayEdgePct * 1.1), 1, 99)),
    homeRunLineConfidence: round2(clamp(50 + (homeEdgePct * 1.1), 1, 99))
  };
}

function generateAllCandidates(context) {
  const out = [];
  out.push.apply(out, generateFullGameCandidates(context));
  out.push.apply(out, generateF5Candidates(context));
  out.push.apply(out, Array.isArray(context.propCandidates) ? context.propCandidates : []);
  return out;
}

function generateFullGameCandidates(context) {
  const out = [];
  const ml = context.moneylineData || {};
  const rl = context.spreadData || {};
  const total = context.totalData || {};
  const model = context.modelOutputs || {};

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "away",
      bestBet: context.awayTeam + " ML",
      bestBetType: "Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2((Number(model.awayWinProb || 50)) / 100),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: Number(model.awayEdgePct || 0),
      reasons: [
        "Away moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, lineup, and offense are included."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "home",
      bestBet: context.homeTeam + " ML",
      bestBetType: "Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2((Number(model.homeWinProb || 50)) / 100),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: Number(model.homeEdgePct || 0),
      reasons: [
        "Home moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, lineup, and offense are included."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "over",
      bestBet: "Over " + total.line,
      bestBetType: "Total",
      oddsPrice: total.overPrice,
      fairProb: round2((Number(model.overConfidence || 50)) / 100),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: Number(model.overEdgePct || 0),
      reasons: [
        "Game total is compared to model fair total.",
        "Park factor and lineup status are included."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "under",
      bestBet: "Under " + total.line,
      bestBetType: "Total",
      oddsPrice: total.underPrice,
      fairProb: round2((Number(model.underConfidence || 50)) / 100),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: Number(model.underEdgePct || 0),
      reasons: [
        "Game total is compared to model fair total.",
        "Park factor and lineup status are included."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(((Number(model.awayWinProb || 50) / 100) + 0.03), 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "away",
      bestBet: context.awayTeam + " " + formatSignedPoint(rl.awayPoint),
      bestBetType: "Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "Run line uses the side model as the anchor.",
        "Price discipline is included in confidence."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(((Number(model.homeWinProb || 50) / 100) + 0.03), 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "home",
      bestBet: context.homeTeam + " " + formatSignedPoint(rl.homePoint),
      bestBetType: "Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "Run line uses the side model as the anchor.",
        "Price discipline is included in confidence."
      ]
    });
  }

  return out;
}

function generateF5Candidates(context) {
  const out = [];
  const ml = context.f5MoneylineData || {};
  const rl = context.f5RunLineData || {};
  const total = context.f5TotalData || {};
  const componentScores = context.componentScores || {};
  const sideScore =
    Number(componentScores.side && componentScores.side.startingPitcher || 0) +
    Number(componentScores.side && componentScores.side.lineup || 0);

  const homeProb = clamp(0.5 + (sideScore * 0.09), 0.35, 0.65);
  const awayProb = round2(1 - homeProb);

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "away",
      bestBet: context.awayTeam + " F5 ML",
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(awayProb),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: round2((awayProb - (americanToImpliedProb(ml.awayPrice) || 0)) * 100),
      reasons: [
        "F5 moneyline is anchored to starting pitcher and opening lineup strength.",
        "Bullpen impact is intentionally reduced for first-five markets."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "home",
      bestBet: context.homeTeam + " F5 ML",
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(homeProb),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: round2((homeProb - (americanToImpliedProb(ml.homePrice) || 0)) * 100),
      reasons: [
        "F5 moneyline is anchored to starting pitcher and opening lineup strength.",
        "Bullpen impact is intentionally reduced for first-five markets."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    const overProb = clamp(0.5 + ((Number(componentScores.total && componentScores.total.parkFactor || 0) * 0.06)), 0.32, 0.68);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "over",
      bestBet: "F5 Over " + total.line,
      bestBetType: "F5 Total",
      oddsPrice: total.overPrice,
      fairProb: round2(overProb),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: round2((overProb - (americanToImpliedProb(total.overPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes park and starter context.",
        "Bullpen and late-game volatility are intentionally reduced."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    const underProb = clamp(0.5 - ((Number(componentScores.total && componentScores.total.parkFactor || 0) * 0.06)), 0.32, 0.68);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "under",
      bestBet: "F5 Under " + total.line,
      bestBetType: "F5 Total",
      oddsPrice: total.underPrice,
      fairProb: round2(underProb),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: round2((underProb - (americanToImpliedProb(total.underPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes park and starter context.",
        "Bullpen and late-game volatility are intentionally reduced."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(awayProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "away",
      bestBet: context.awayTeam + " F5 " + formatSignedPoint(rl.awayPoint),
      bestBetType: "F5 Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability and price discipline.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(homeProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "home",
      bestBet: context.homeTeam + " F5 " + formatSignedPoint(rl.homePoint),
      bestBetType: "F5 Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability and price discipline.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  return out;
}

function getSignedEdgePct(candidate) {
  const n = Number(candidate && candidate.edgePct);
  return isFinite(n) ? n : 0;
}

function getPositiveEdgePct(candidate) {
  return Math.max(0, getSignedEdgePct(candidate));
}

function isProjectedLineupContext(context) {
  return !(
    context &&
    context.lineupContext &&
    context.lineupContext.officialLineupAvailable
  );
}

function isHeavyJuice(price) {
  const p = Number(price);
  return isFinite(p) && p < -150;
}

function isVeryHeavyJuice(price) {
  const p = Number(price);
  return isFinite(p) && p < -175;
}

function getPriceDisciplineBonus(price) {
  const p = Number(price);
  if (!isFinite(p)) return 0;
  if (p >= -115 && p <= 130) return 1.1;
  if (p >= -130 && p <= 145) return 0.7;
  if (p >= -145 && p <= 165) return 0.2;
  if (p < -145 && p >= -170) return -0.55;
  if (p < -170) return -1.1;
  return 0.15;
}

function getCandidateBucket(candidate) {
  const marketFamily = String(candidate && candidate.marketFamily || "");
  const bestBetType = String(candidate && candidate.bestBetType || "");
  const bestBet = String(candidate && candidate.bestBet || "");

  if (marketFamily === "f5") {
    if (/total/i.test(bestBetType) || /^F5 Over /i.test(bestBet) || /^F5 Under /i.test(bestBet)) return "f5_total";
    if (/run line/i.test(bestBetType)) return "f5_runline";
    return "f5_side";
  }

  if (marketFamily === "prop") {
    if (/Pitcher Strikeouts/i.test(bestBet)) return "pitcher_k_prop";
    if (/Pitcher Outs/i.test(bestBet)) return "pitcher_outs_prop";
    if (/Home Runs/i.test(bestBet)) return "hitter_hr_prop";
    if (/Total Bases/i.test(bestBet)) return "hitter_tb_prop";
    if (/Hits/i.test(bestBet)) return "hitter_hits_prop";
    return "generic_prop";
  }

  if (/Run Line/i.test(bestBetType)) return "runline";
  if (/Total/i.test(bestBetType) || /^Over /i.test(bestBet) || /^Under /i.test(bestBet)) return "total";
  return "side";
}

function getNegativeEdgePenalty(candidate) {
  const edge = getSignedEdgePct(candidate);
  if (edge >= 0) return 0;
  return Math.abs(edge) * 1.35;
}

function getProjectedLineupPenalty(candidate, context) {
  if (!isProjectedLineupContext(context)) return 0;
  const bucket = getCandidateBucket(candidate);

  if (
    bucket === "hitter_hits_prop" ||
    bucket === "hitter_tb_prop" ||
    bucket === "hitter_hr_prop" ||
    bucket === "pitcher_k_prop" ||
    bucket === "pitcher_outs_prop" ||
    bucket === "f5_side" ||
    bucket === "f5_total" ||
    bucket === "f5_runline"
  ) {
    return 0.85;
  }

  return 0.25;
}

function getValueScore(candidate) {
  const positiveEdge = getPositiveEdgePct(candidate);
  const negativeEdgePenalty = getNegativeEdgePenalty(candidate);
  const juiceBonus = getPriceDisciplineBonus(candidate && candidate.oddsPrice);

  const fairProbBonus =
    candidate && candidate.fairProb != null && candidate.impliedProb != null
      ? Math.max(0, (Number(candidate.fairProb) - Number(candidate.impliedProb)) * 1.4)
      : 0;

  return round2((positiveEdge * 1.15) + juiceBonus + fairProbBonus - negativeEdgePenalty);
}

function getCandidateParkTilt(candidate, parkFactor) {
  const pf = Number(parkFactor || 1.0);
  if (candidate.marketFamily === "prop") {
    if (/Home Runs|Total Bases/i.test(candidate.bestBet)) return round2((pf - 1.0) * 2.2);
    if (/Hits/i.test(candidate.bestBet)) return round2((pf - 1.0) * 1.4);
    if (/Pitcher Strikeouts|Pitcher Outs/i.test(candidate.bestBet)) return round2((1.0 - pf) * 1.4);
  }
  if (/^Over /i.test(candidate.bestBet) || /^F5 Over /i.test(candidate.bestBet)) return round2((pf - 1.0) * 2.0);
  if (/^Under /i.test(candidate.bestBet) || /^F5 Under /i.test(candidate.bestBet)) return round2((1.0 - pf) * 2.0);
  return 0;
}

function getMissingDataPenalty(componentScores) {
  let penalty = 0;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.bullpen !== "live") penalty += 0.22;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.scheduleTravel !== "live") penalty += 0.16;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.defense === "placeholder") penalty += 0.08;
  return penalty;
}

function getMarketShapeBonus(candidate, context) {
  const bucket = getCandidateBucket(candidate);

  if (bucket === "side") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.10;
  }

  if (bucket === "total") {
    const underBonus =
      /^Under /i.test(String(candidate && candidate.bestBet || "")) &&
      context &&
      context.totalData &&
      context.totalData.line != null &&
      Number(context.totalData.line) <= 8
        ? 0.45
        : 0;
    return (Math.abs(Number(context && context.modelOutputs && context.modelOutputs.totalComposite || 0)) * 1.10) + underBonus;
  }

  if (bucket === "runline") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 0.85;
  }

  if (bucket === "f5_side") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.30;
  }

  if (bucket === "f5_total") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.totalComposite || 0)) * 1.20;
  }

  if (bucket === "f5_runline") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.00;
  }

  if (bucket === "pitcher_k_prop" || bucket === "pitcher_outs_prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.35;
  }

  if (bucket === "hitter_hits_prop" || bucket === "hitter_tb_prop" || bucket === "hitter_hr_prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.15;
  }

  if (String(candidate && candidate.marketFamily || "") === "prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.0;
  }

  return 0;
}

function getContextScore(candidate, context) {
  const lineupBonus = context && context.lineupContext && context.lineupContext.officialLineupAvailable ? 0.65 : -0.15;
  const parkTilt = getCandidateParkTilt(candidate, context && context.parkFactor || 1.0);
  const starterKnownBonus =
    context &&
    context.probablePitchers &&
    context.probablePitchers.away !== "TBD" &&
    context.probablePitchers.home !== "TBD"
      ? 0.40
      : 0;

  const marketShapeBonus = getMarketShapeBonus(candidate, context || {});
  const missingDataPenalty = getMissingDataPenalty(context && context.componentScores);
  const projectedLineupPenalty = getProjectedLineupPenalty(candidate, context);

  return round2(lineupBonus + parkTilt + starterKnownBonus + marketShapeBonus - missingDataPenalty - projectedLineupPenalty);
}

function getDataCompleteness(componentScores, lineupContext, candidate) {
  let score = 0;
  const bucket = getCandidateBucket(candidate);

  if (lineupContext && lineupContext.officialLineupAvailable) score += 24;
  if (componentScores && componentScores.side && Math.abs(Number(componentScores.side.startingPitcher || 0)) > 0.05) score += 18;
  if (componentScores && componentScores.side && Math.abs(Number(componentScores.side.lineup || 0)) > 0.05) score += 14;
  if (componentScores && componentScores.total && Math.abs(Number(componentScores.total.parkFactor || 0)) > 0.05) score += 12;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.marketContext === "live") score += 16;

  if (
    bucket === "pitcher_k_prop" ||
    bucket === "pitcher_outs_prop" ||
    bucket === "hitter_hits_prop" ||
    bucket === "hitter_tb_prop" ||
    bucket === "hitter_hr_prop" ||
    bucket === "f5_side" ||
    bucket === "f5_total" ||
    bucket === "f5_runline"
  ) {
    if (lineupContext && lineupContext.officialLineupAvailable) score += 10;
    else score -= 8;
  }

  return Math.max(0, Math.min(score, 100));
}

function getThresholdsForBetType(bestBetType, marketFamily, candidateType, candidate) {
  const bucket = getCandidateBucket(candidate || { bestBetType: bestBetType, marketFamily: marketFamily, bestBet: candidateType });

  switch (bucket) {
    case "side":
      return { high: 7.9, medium: 4.9, minEdgeHigh: 1.8, minEdgeMedium: 0.7, minCompletenessHigh: 40 };
    case "total":
      return { high: 7.7, medium: 4.8, minEdgeHigh: 1.7, minEdgeMedium: 0.7, minCompletenessHigh: 38 };
    case "runline":
      return { high: 8.4, medium: 5.1, minEdgeHigh: 2.1, minEdgeMedium: 0.9, minCompletenessHigh: 40 };
    case "f5_side":
      return { high: 8.8, medium: 5.2, minEdgeHigh: 2.2, minEdgeMedium: 1.0, minCompletenessHigh: 44 };
    case "f5_total":
      return { high: 8.5, medium: 5.1, minEdgeHigh: 2.0, minEdgeMedium: 0.9, minCompletenessHigh: 42 };
    case "f5_runline":
      return { high: 8.9, medium: 5.3, minEdgeHigh: 2.3, minEdgeMedium: 1.0, minCompletenessHigh: 44 };
    case "pitcher_k_prop":
      return { high: 8.3, medium: 5.0, minEdgeHigh: 1.9, minEdgeMedium: 0.8, minCompletenessHigh: 44 };
    case "pitcher_outs_prop":
      return { high: 8.2, medium: 4.9, minEdgeHigh: 1.8, minEdgeMedium: 0.8, minCompletenessHigh: 44 };
    case "hitter_hits_prop":
      return { high: 8.4, medium: 5.0, minEdgeHigh: 1.9, minEdgeMedium: 0.8, minCompletenessHigh: 46 };
    case "hitter_tb_prop":
      return { high: 8.7, medium: 5.1, minEdgeHigh: 2.1, minEdgeMedium: 0.9, minCompletenessHigh: 46 };
    case "hitter_hr_prop":
      return { high: 9.4, medium: 5.5, minEdgeHigh: 2.6, minEdgeMedium: 1.2, minCompletenessHigh: 48 };
    default:
      return { high: 8.2, medium: 5.0, minEdgeHigh: 1.9, minEdgeMedium: 0.8, minCompletenessHigh: 42 };
  }
}

function determineConfidenceTier(finalScore, thresholds, candidate, context) {
  const signedEdge = getSignedEdgePct(candidate);
  const positiveEdge = getPositiveEdgePct(candidate);
  const completeness = Number(candidate && candidate.dataCompleteness || 0);
  const bucket = getCandidateBucket(candidate);
  const officialLineups = !!(context && context.lineupContext && context.lineupContext.officialLineupAvailable);
  const expensiveFavorite = isHeavyJuice(candidate && candidate.oddsPrice);
  const veryHeavyFavorite = isVeryHeavyJuice(candidate && candidate.oddsPrice);

  if (signedEdge <= 0) return "Low";

  if (
    finalScore >= thresholds.high &&
    positiveEdge >= thresholds.minEdgeHigh &&
    completeness >= thresholds.minCompletenessHigh &&
    !(veryHeavyFavorite && positiveEdge < (thresholds.minEdgeHigh + 0.8)) &&
    !(
      (bucket === "f5_side" || bucket === "f5_total" || bucket === "f5_runline" ||
       bucket === "pitcher_k_prop" || bucket === "pitcher_outs_prop" ||
       bucket === "hitter_hits_prop" || bucket === "hitter_tb_prop" || bucket === "hitter_hr_prop")
      && !officialLineups
      && finalScore < (thresholds.high + 0.5)
    )
  ) {
    return "High";
  }

  if (
    finalScore >= thresholds.medium &&
    positiveEdge >= thresholds.minEdgeMedium &&
    !(expensiveFavorite && positiveEdge < thresholds.minEdgeHigh)
  ) {
    return "Medium";
  }

  return "Low";
}

function recommendStakeUnits(finalScore, confidence, candidate) {
  const bucket = getCandidateBucket(candidate);

  if (confidence === "High") {
    if (bucket === "f5_side" || bucket === "f5_total" || bucket === "f5_runline") {
      return finalScore >= 10.0 ? 1.0 : 0.75;
    }
    return finalScore >= 9.8 ? 1.25 : 1.0;
  }

  if (confidence === "Medium") return 0.5;
  return 0.25;
}

function scoreCandidates(context, candidates) {
  const arr = Array.isArray(candidates) ? candidates : [];

  return arr.map(function(candidate) {
    const valueScore = getValueScore(candidate);
    const contextScore = getContextScore(candidate, context);
    const dataCompleteness = getDataCompleteness(
      context && context.componentScores,
      context && context.lineupContext,
      candidate
    );

    const completenessScore = round2(dataCompleteness / 18);
    const negativeEdgePenalty = getSignedEdgePct(candidate) < 0 ? Math.abs(getSignedEdgePct(candidate)) * 1.2 : 0;

    const finalScore = round2(
      (valueScore * 0.60) +
      (contextScore * 0.28) +
      (completenessScore * 0.12) -
      negativeEdgePenalty
    );

    const thresholds = getThresholdsForBetType(
      candidate && candidate.bestBetType,
      candidate && candidate.marketFamily,
      candidate && candidate.bestBet,
      candidate
    );

    const enriched = Object.assign({}, candidate, {
      valueScore: round2(valueScore),
      contextScore: round2(contextScore),
      dataCompleteness: round2(dataCompleteness),
      completenessScore: round2(completenessScore),
      finalScore: round2(finalScore)
    });

    const confidence = determineConfidenceTier(finalScore, thresholds, enriched, context);
    const confidenceScore = round2(
      confidence === "High" ? Math.max(82, Math.min(98, 82 + (finalScore - thresholds.high) * 4.2)) :
      confidence === "Medium" ? Math.max(58, Math.min(81, 58 + (finalScore - thresholds.medium) * 5.0)) :
      Math.max(20, Math.min(57, 42 + finalScore * 2.2))
    );

    return Object.assign({}, enriched, {
      confidence: confidence,
      confidenceScore: confidenceScore,
      recommendedTiming: getRecommendedTiming(enriched, context),
      recommendedStakeUnits: recommendStakeUnits(finalScore, confidence, candidate)
    });
  });
}

function getRecommendedTiming(candidate, context) {
  if (candidate.marketFamily === "prop" && context.lineupContext && context.lineupContext.officialLineupAvailable) {
    return "After confirmed lineups";
  }
  if (candidate.marketFamily === "f5") return "Closer to first pitch";
  return "Monitor market";
}

function applyPerGameRanking(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice()
    .sort(function(a, b) {
      return Number(b.finalScore || 0) - Number(a.finalScore || 0);
    })
    .map(function(c, idx) {
      return Object.assign({}, c, { slateRank: idx + 1 });
    });
}

function filterCandidatesForView(candidates, viewMode) {
  const arr = Array.isArray(candidates) ? candidates : [];

  if (viewMode === "pitcher_props") {
    return arr.filter(function(c) { return c.marketFamily === "prop" && c.propSubType === "pitcher"; });
  }

  if (viewMode === "hitter_props") {
    return arr.filter(function(c) { return c.marketFamily === "prop" && c.propSubType === "hitter"; });
  }

  if (viewMode === "props") {
    return arr.filter(function(c) { return c.marketFamily === "prop"; });
  }

  if (viewMode === "f5") {
    return arr.filter(function(c) { return c.marketFamily === "f5"; });
  }

  return arr.filter(function(c) { return c.marketFamily === "full"; });
}

function chooseBestCandidate(filteredCandidates, rankedCandidates, viewMode) {
  const arr = Array.isArray(filteredCandidates) ? filteredCandidates : [];
  if (arr.length) return arr[0];

  return {
    marketFamily: viewMode === "f5" ? "f5" : (viewMode === "full" ? "full" : "prop"),
    bestBet: "Pass",
    bestBetType: "Pass",
    oddsPrice: null,
    confidence: "Low",
    confidenceScore: 0,
    finalScore: 0,
    reasons: ["No qualifying candidate was generated for this view."],
    recommendedTiming: "Monitor market",
    recommendedStakeUnits: 0.0
  };
}

function chooseTopPropCandidate(rankedCandidates) {
  const top = (Array.isArray(rankedCandidates) ? rankedCandidates : []).find(function(c) {
    return c.marketFamily === "prop";
  });

  if (!top) return null;

  return {
    player: top.player,
    market: top.market,
    price: top.oddsPrice,
    modelProb: round2((Number(top.modelProb || top.fairProb || 0.5)) * 100),
    reasons: Array.isArray(top.reasons) ? top.reasons : []
  };
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported prop returned.";
  const reasonBits = [];
  if (topProp.market) reasonBits.push(topProp.market + " ranked highest among prop candidates.");
  if (lineupContext && lineupContext.officialLineupAvailable) reasonBits.push("Confirmed lineups improved confidence.");
  if (Array.isArray(topProp.reasons) && topProp.reasons.length) reasonBits.push(topProp.reasons[0]);
  return reasonBits.join(" ");
}

function buildRiskWarnings(componentScores, bestCandidate, rankedCandidates, viewMode) {
  const warnings = [];
  if (!bestCandidate || bestCandidate.bestBet === "Pass") warnings.push("No market cleared the current scoring thresholds.");
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.bullpen !== "live") {
    warnings.push("Bullpen inputs are still using placeholder context.");
  }
  if (viewMode === "props" || viewMode === "pitcher_props" || viewMode === "hitter_props") {
    const hasOfficial = rankedCandidates.some(function(c) { return c.marketFamily === "prop"; });
    if (!hasOfficial) warnings.push("No qualifying BetMGM prop was returned for this matchup.");
  }
  return warnings;
}

function buildGamePayload(args) {
  const originalGame = args.originalGame || {};
  const best = args.bestCandidate || {};
  const topProp = args.topPropCandidate || null;
  const moneylineData = args.moneylineData || emptyMoneylineDisplay("N/A");
  const spreadData = args.spreadData || emptySpreadDisplay("N/A");
  const totalData = args.totalData || emptyTotalDisplay("N/A");
  const f5MoneylineData = args.f5MoneylineData || emptyMoneylineDisplay("N/A");
  const f5RunLineData = args.f5RunLineData || emptySpreadDisplay("N/A");
  const f5TotalData = args.f5TotalData || emptyTotalDisplay("N/A");
  const lineupContext = args.lineupContext || {};
  const modelOutputs = args.modelOutputs || {};
  const componentScores = args.componentScores || {};
  const scoredCandidates = Array.isArray(args.scoredCandidates) ? args.scoredCandidates : [];
  const propStatus = args.propStatus || "No supported prop returned.";

  return {
    id: originalGame.id || "",
    eventId: originalGame.id || "",
    rawCommenceTime: originalGame.commence_time || "",
    time: formatBoardDateTime(originalGame.commence_time || ""),
    away: args.awayTeam,
    home: args.homeTeam,
    probablePitchers: args.probablePitchers || null,
    viewMode: args.viewMode,

    moneyline: moneylineData.display,
    runLine: spreadData.display,
    total: totalData.display,
    firstFiveMoneyline: f5MoneylineData.display,
    firstFiveRunLine: f5RunLineData.display,
    firstFiveTotal: f5TotalData.display,

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
    firstFiveMoneylineConfidence: deriveF5ConfidenceMap(scoredCandidates, "f5_moneyline"),
    firstFiveTotalConfidence: deriveF5TotalConfidenceMap(scoredCandidates),
    firstFiveRunLineConfidence: deriveF5RunLineConfidenceMap(scoredCandidates),

    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource,
    officialLineupAvailable: lineupContext.officialLineupAvailable,
    projectedLineupUsed: lineupContext.projectedLineupUsed,
    projectedLineups: lineupContext.projectedLineups,
    officialLineups: lineupContext.officialLineups,

    bestBet: best.bestBet || "Pass",
    bestBetType: best.bestBetType || "Pass",
    bestBetOdds: best.oddsPrice != null ? best.oddsPrice : null,
    confidence: best.confidence || "Low",
    confidenceScore: best.confidenceScore != null ? best.confidenceScore : 0,
    recommendedTiming: best.recommendedTiming || "Monitor market",
    recommendedStakeUnits: best.recommendedStakeUnits != null ? best.recommendedStakeUnits : 0,
    reasons: Array.isArray(best.reasons) ? best.reasons : [],

    topPropOverall: topProp,
    topPropOverallReason: topProp ? buildTopPropOverallReason(topProp, lineupContext) : propStatus,
    propStatus: propStatus,

    componentScores: componentScores,
    riskWarnings: Array.isArray(args.riskWarnings) ? args.riskWarnings : [],
    parkFactor: args.parkFactor,
    debug: {
      topCandidates: scoredCandidates.slice(0, 7).map(function(c) {
        return {
          bestBet: c.bestBet,
          bestBetType: c.bestBetType,
          marketFamily: c.marketFamily,
          propSubType: c.propSubType || null,
          edgePct: c.edgePct,
          valueScore: c.valueScore,
          contextScore: c.contextScore,
          dataCompleteness: c.dataCompleteness,
          finalScore: c.finalScore,
          confidence: c.confidence,
          slateRank: c.slateRank
        };
      }),
      lineupDiagnostics: lineupContext.lineupDebug,
      dataAvailability: {
        officialLineupAvailable: lineupContext.officialLineupAvailable,
        hitterPropGenerated: scoredCandidates.some(function(c) {
          return c.marketFamily === "prop" && c.propSubType === "hitter";
        }),
        underGenerated: scoredCandidates.some(function(c) {
          return c.bestBetType === "Total" && /^Under /i.test(c.bestBet);
        })
      }
    }
  };
}

function deriveF5ConfidenceMap(candidates, market) {
  const away = (candidates || []).find(function(c) { return c.market === market && c.side === "away"; });
  const home = (candidates || []).find(function(c) { return c.market === market && c.side === "home"; });

  return {
    away: away ? sigmoidScoreToPct(away.finalScore) : null,
    home: home ? sigmoidScoreToPct(home.finalScore) : null
  };
}

function deriveF5TotalConfidenceMap(candidates) {
  const over = (candidates || []).find(function(c) { return c.market === "f5_total" && c.side === "over"; });
  const under = (candidates || []).find(function(c) { return c.market === "f5_total" && c.side === "under"; });

  return {
    over: over ? sigmoidScoreToPct(over.finalScore) : null,
    under: under ? sigmoidScoreToPct(under.finalScore) : null
  };
}

function deriveF5RunLineConfidenceMap(candidates) {
  const away = (candidates || []).find(function(c) { return c.market === "f5_runline" && c.side === "away"; });
  const home = (candidates || []).find(function(c) { return c.market === "f5_runline" && c.side === "home"; });

  return {
    away: away ? sigmoidScoreToPct(away.finalScore) : null,
    home: home ? sigmoidScoreToPct(home.finalScore) : null
  };
}
async function fetchOfficialLineupsFromMLB() {
  const url = "https://www.mlb.com/starting-lineups";
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) return {};
    const html = await response.text();
    return parseMLBStartingLineups(html);
  } catch (error) {
    return {};
  }
}

function parseMLBStartingLineups(html) {
  const cleaned = String(html || "")
    .replace(/\r/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");

  const rawLines = cleaned
    .split("\n")
    .map(normalizeText)
    .filter(Boolean);

  const blocks = splitIntoGameBlocks(rawLines);
  const map = {};

  blocks.forEach(function(block) {
    const awayTeam = normalizeTeamName(block.awayTeam);
    const homeTeam = normalizeTeamName(block.homeTeam);

    const awayGroups = [];
    const homeGroups = [];

    for (let i = 0; i < block.lines.length; i++) {
      const side = detectLineupLabelTeam(block.lines[i], awayTeam, homeTeam);
      if (side === "away") awayGroups.push(extractOneLineup(block.lines, i + 1));
      if (side === "home") homeGroups.push(extractOneLineup(block.lines, i + 1));
    }

    const awayPlayers = firstValidLineup(awayGroups);
    const homePlayers = firstValidLineup(homeGroups);

    map[matchupKey(awayTeam, homeTeam)] = {
      awayTeam: awayTeam,
      homeTeam: homeTeam,
      awayPlayers: awayPlayers,
      homePlayers: homePlayers,
      awayCount: awayPlayers.length,
      homeCount: homePlayers.length
    };
  });

  return map;
}

function splitIntoGameBlocks(lines) {
  const blocks = [];
  let current = null;

  (Array.isArray(lines) ? lines : []).forEach(function(line) {
    const compact = normalizeText(line);
    if (!compact) return;

    if (isMatchupHeaderLine(compact)) {
      if (current && current.lines.length) blocks.push(current);
      const parts = compact.split(/\s@\s/);
      current = {
        awayTeam: normalizeTeamName(parts[0]),
        homeTeam: normalizeTeamName(parts[1]),
        lines: [compact]
      };
      return;
    }

    if (current) current.lines.push(compact);
  });

  if (current && current.lines.length) blocks.push(current);
  return blocks;
}

function isMatchupHeaderLine(line) {
  if (!line || !/\s@\s/.test(line)) return false;
  const parts = line.split(/\s@\s/);
  if (parts.length !== 2) return false;

  const awayKey = normalizeText(parts[0]).toLowerCase().replace(/\./g, "");
  const homeKey = normalizeText(parts[1]).toLowerCase().replace(/\./g, "");

  return !!TEAM_CANONICAL[awayKey] && !!TEAM_CANONICAL[homeKey];
}

function detectLineupLabelTeam(line, awayTeam, homeTeam) {
  const match = String(line || "").match(/^(.+?)\s+Lineup$/i);
  if (!match) return null;

  const rawLabel = normalizeText(match[1]);
  const upperRaw = rawLabel.toUpperCase();

  const awayCanon = normalizeTeamName(awayTeam);
  const homeCanon = normalizeTeamName(homeTeam);
  const awayAbbr = teamAbbrevHint(awayCanon);
  const homeAbbr = teamAbbrevHint(homeCanon);

  if (normalizeTeamName(rawLabel) === awayCanon || upperRaw === awayAbbr) return "away";
  if (normalizeTeamName(rawLabel) === homeCanon || upperRaw === homeAbbr) return "home";
  return null;
}

function extractOneLineup(blockLines, startIndex) {
  const players = [];

  for (let i = startIndex; i < blockLines.length; i++) {
    const line = normalizeText(blockLines[i]);
    if (!line) continue;

    if (/^.+?\s+Lineup$/i.test(line) && players.length > 0) break;
    if (/^(Gameday|Preview|Recap|Tickets|Watch)\b/i.test(line) && players.length > 0) break;
    if (/^\d+\.\s+TBD$/i.test(line)) return [];

    const match =
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\s+[A-Z0-9]{1,3}$/i) ||
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)$/i) ||
      line.match(/^(\d+)\.\s+(.+?)\s+\(([LRS])\)\b/i);

    if (match) {
      players.push({
        lineupIndex: Number(match[1]),
        name: sanitizePlayerName(match[2]),
        bats: String(match[3] || "").toUpperCase()
      });
      if (players.length >= 9) break;
    }
  }

  return dedupeAndSortLineup(players);
}

function sanitizePlayerName(name) {
  return normalizeText(name).replace(/\s+\-$/, "").trim();
}

function dedupeAndSortLineup(players) {
  const seen = new Map();

  (Array.isArray(players) ? players : []).forEach(function(p) {
    const slot = Number(p && p.lineupIndex || 0);
    const nm = normalizeName(p && p.name || "");
    if (!slot || !nm) return;
    const key = slot + "|" + nm;
    if (!seen.has(key)) {
      seen.set(key, {
        lineupIndex: slot,
        name: sanitizePlayerName(p.name),
        bats: p.bats || null
      });
    }
  });

  return Array.from(seen.values())
    .sort(function(a, b) { return a.lineupIndex - b.lineupIndex; })
    .slice(0, 9);
}

function firstValidLineup(groups) {
  if (!Array.isArray(groups)) return [];
  for (let i = 0; i < groups.length; i++) {
    if (Array.isArray(groups[i]) && groups[i].length === 9) return groups[i];
  }
  let best = [];
  groups.forEach(function(g) {
    if (Array.isArray(g) && g.length > best.length) best = g;
  });
  return best;
}

function buildProjectedLineupFromScheduleTeam(scheduleSide) {
  const batters = Array.isArray(scheduleSide && scheduleSide.batters) ? scheduleSide.batters : [];
  const players = batters.map(function(p, idx) {
    return {
      lineupIndex: idx + 1,
      name: sanitizePlayerName(p && (p.fullName || p.name || "")),
      bats: p && p.batSide ? p.batSide.code : null
    };
  });

  const clean = dedupeAndSortLineup(players);
  return { players: clean, count: clean.length };
}

function buildLineupContext(args) {
  const homeTeam = args.homeTeam;
  const awayTeam = args.awayTeam;
  const mlbLineups = args.mlbLineups || {};
  const probablePitchers = args.probablePitchers || {};
  const scheduleGame = args.scheduleGame || null;

  const key = matchupKey(awayTeam, homeTeam);
  const official = mlbLineups[key] || null;

  const officialAwayPlayers = Array.isArray(official && official.awayPlayers) ? official.awayPlayers : [];
  const officialHomePlayers = Array.isArray(official && official.homePlayers) ? official.homePlayers : [];

  const projectedAway = buildProjectedLineupFromScheduleTeam(scheduleGame && scheduleGame.teams && scheduleGame.teams.away);
  const projectedHome = buildProjectedLineupFromScheduleTeam(scheduleGame && scheduleGame.teams && scheduleGame.teams.home);

  const awayOfficial = officialAwayPlayers.length === 9;
  const homeOfficial = officialHomePlayers.length === 9;
  const anyOfficial = awayOfficial || homeOfficial;

  return {
    lineupMode: anyOfficial ? "official" : "projected",
    lineupSource: anyOfficial ? "mlb-starting-lineups" : "schedule-projected",
    officialLineupAvailable: anyOfficial,
    projectedLineupUsed: !anyOfficial,
    probablePitchers: probablePitchers,

    officialLineups: {
      away: {
        team: awayTeam,
        players: awayOfficial ? officialAwayPlayers : [],
        count: officialAwayPlayers.length,
        isOfficial: awayOfficial
      },
      home: {
        team: homeTeam,
        players: homeOfficial ? officialHomePlayers : [],
        count: officialHomePlayers.length,
        isOfficial: homeOfficial
      }
    },

    projectedLineups: {
      away: {
        team: awayTeam,
        players: projectedAway.players,
        count: projectedAway.count
      },
      home: {
        team: homeTeam,
        players: projectedHome.players,
        count: projectedHome.count
      }
    },

    lineupDebug: {
      requestedMatchupKey: key,
      foundOfficialMatchup: !!official,
      officialAwayCount: officialAwayPlayers.length,
      officialHomeCount: officialHomePlayers.length,
      awayOfficial: awayOfficial,
      homeOfficial: homeOfficial,
      finalLineupMode: anyOfficial ? "official" : "projected",
      finalLineupSource: anyOfficial ? "mlb-starting-lineups" : "schedule-projected"
    }
  };
}

function getActiveLineup(sideInfo, projectedSideInfo) {
  if (sideInfo && sideInfo.isOfficial && Array.isArray(sideInfo.players) && sideInfo.players.length) return sideInfo;
  return projectedSideInfo || { players: [], count: 0, isOfficial: false };
}

function getLineupSlotBonus(slot) {
  const s = Number(slot || 0);
  if (s >= 1 && s <= 2) return 0.22;
  if (s === 3) return 0.18;
  if (s === 4) return 0.16;
  if (s === 5) return 0.11;
  if (s === 6) return 0.08;
  if (s === 7) return 0.05;
  if (s === 8) return 0.03;
  if (s === 9) return 0.01;
  return 0;
}

function getLineupStrengthTilt(lineupContext) {
  const away = getActiveLineup(
    lineupContext && lineupContext.officialLineups && lineupContext.officialLineups.away,
    lineupContext && lineupContext.projectedLineups && lineupContext.projectedLineups.away
  );
  const home = getActiveLineup(
    lineupContext && lineupContext.officialLineups && lineupContext.officialLineups.home,
    lineupContext && lineupContext.projectedLineups && lineupContext.projectedLineups.home
  );

  if (!away.players.length || !home.players.length) return 0;

  const awayScore = away.players.reduce(function(sum, p) {
    return sum + getLineupSlotBonus(p.lineupIndex);
  }, 0);

  const homeScore = home.players.reduce(function(sum, p) {
    return sum + getLineupSlotBonus(p.lineupIndex);
  }, 0);

  return round2((homeScore - awayScore) / 6);
}

function getPitcherPropLineupAdjustment(marketKey, opposingLineup, pitcherHand) {
  const players = Array.isArray(opposingLineup && opposingLineup.players) ? opposingLineup.players : [];
  if (!players.length) return 0;

  let topOrderPenalty = 0;
  let platoonPressure = 0;
  let lineupDepth = 0;

  players.forEach(function(player) {
    const slot = Number(player.lineupIndex || 0);
    if (slot >= 1 && slot <= 3) topOrderPenalty += 0.12;
    else if (slot >= 4 && slot <= 6) topOrderPenalty += 0.08;
    else topOrderPenalty += 0.03;

    lineupDepth += 0.04;

    if (player.bats === "S") platoonPressure += 0.07;
    else if (pitcherHand && player.bats && player.bats !== pitcherHand) platoonPressure += 0.05;
  });

  let score = 0;
  if (marketKey === "pitcher_strikeouts") {
    score = -topOrderPenalty + platoonPressure - (lineupDepth * 0.35);
  } else if (marketKey === "pitcher_outs") {
    score = -(topOrderPenalty * 1.1) - (platoonPressure * 0.8) - (lineupDepth * 0.2);
  }

  return round2(score);
}

function findPlayerInLineup(playerName, players) {
  const target = normalizeName(playerName);
  const arr = Array.isArray(players) ? players : [];
  for (let i = 0; i < arr.length; i++) {
    const nm = normalizeName(arr[i].name);
    if (nm && (nm === target || nm.includes(target) || target.includes(nm))) {
      return arr[i];
    }
  }
  return null;
}

function resolvePlayerContext(playerName, lineupContext, probablePitchers) {
  const awayOfficial = getActiveLineup(
    lineupContext && lineupContext.officialLineups && lineupContext.officialLineups.away,
    lineupContext && lineupContext.projectedLineups && lineupContext.projectedLineups.away
  );
  const homeOfficial = getActiveLineup(
    lineupContext && lineupContext.officialLineups && lineupContext.officialLineups.home,
    lineupContext && lineupContext.projectedLineups && lineupContext.projectedLineups.home
  );

  const awayPlayer = findPlayerInLineup(playerName, awayOfficial.players);
  if (awayPlayer) {
    return {
      playerTeam: "away",
      lineupPlayer: awayPlayer,
      opposingPitcherHand: probablePitchers && probablePitchers.homeHand || null,
      ownPitcherHand: probablePitchers && probablePitchers.awayHand || null,
      opposingLineup: homeOfficial
    };
  }

  const homePlayer = findPlayerInLineup(playerName, homeOfficial.players);
  if (homePlayer) {
    return {
      playerTeam: "home",
      lineupPlayer: homePlayer,
      opposingPitcherHand: probablePitchers && probablePitchers.awayHand || null,
      ownPitcherHand: probablePitchers && probablePitchers.homeHand || null,
      opposingLineup: awayOfficial
    };
  }

  return {
    playerTeam: null,
    lineupPlayer: null,
    opposingPitcherHand: null,
    ownPitcherHand: null,
    opposingLineup: null
  };
}

async function fetchExtendedMarketsForEvent(args) {
  const eventId = args.eventId;
  const apiKey = args.apiKey;
  const homeTeam = args.homeTeam;
  const awayTeam = args.awayTeam;
  const lineupContext = args.lineupContext;
  const probablePitchers = args.probablePitchers;
  const parkFactor = args.parkFactor;
  const wantProps = !!args.wantProps;
  const wantF5 = !!args.wantF5;

  const cacheKey = [
    eventId,
    wantProps ? "props" : "nprops",
    wantF5 ? "f5" : "nf5",
    lineupContext && lineupContext.lineupMode || "unknown"
  ].join("|");

  const cached = PROP_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PROP_CACHE_TTL_MS) return cached.value;

  const markets = [];
  if (wantF5) markets.push.apply(markets, F5_MARKETS);
  if (wantProps) markets.push.apply(markets, PROP_MARKETS_HITTER.concat(PROP_MARKETS_PITCHER));

  if (!markets.length) {
    return {
      f5Moneyline: emptyMoneylineDisplay("N/A"),
      f5RunLine: emptySpreadDisplay("N/A"),
      f5Total: emptyTotalDisplay("N/A"),
      propCandidates: [],
      propStatus: "No extended markets requested."
    };
  }

  const url =
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/events/" + encodeURIComponent(eventId) + "/odds" +
    "?apiKey=" + encodeURIComponent(apiKey) +
    "&regions=us" +
    "&bookmakers=betmgm" +
    "&oddsFormat=american" +
    "&markets=" + encodeURIComponent(markets.join(","));

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const value = {
        f5Moneyline: emptyMoneylineDisplay("N/A"),
        f5RunLine: emptySpreadDisplay("N/A"),
        f5Total: emptyTotalDisplay("N/A"),
        propCandidates: [],
        propStatus: "Extended market request failed."
      };
      PROP_CACHE.set(cacheKey, { ts: Date.now(), value: value });
      return value;
    }

    const data = await res.json();
    const bookmaker = data && Array.isArray(data.bookmakers) ? data.bookmakers[0] : null;
    const bookMarkets = bookmaker && Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

    const f5Moneyline = parseMoneyline(
      bookMarkets.find(function(m) { return m && m.key === "h2h_1st_5_innings"; }),
      homeTeam,
      awayTeam
    );

    const f5RunLine = parseSpreads(
      bookMarkets.find(function(m) { return m && m.key === "spreads_1st_5_innings"; }),
      homeTeam,
      awayTeam
    );

    const f5Total = parseTotals(
      bookMarkets.find(function(m) { return m && m.key === "totals_1st_5_innings"; })
    );

    const propCandidates = wantProps
      ? buildPropCandidatesFromMarkets(bookMarkets, lineupContext, probablePitchers, parkFactor)
      : [];

    const value = {
      f5Moneyline: f5Moneyline.display === "N/A" ? emptyMoneylineDisplay("N/A") : f5Moneyline,
      f5RunLine: f5RunLine.display === "N/A" ? emptySpreadDisplay("N/A") : f5RunLine,
      f5Total: f5Total.display === "N/A" ? emptyTotalDisplay("N/A") : f5Total,
      propCandidates: propCandidates,
      propStatus: propCandidates.length ? "Live BetMGM props loaded." : "No supported BetMGM prop returned."
    };

    PROP_CACHE.set(cacheKey, { ts: Date.now(), value: value });
    return value;
  } catch (e) {
    const value = {
      f5Moneyline: emptyMoneylineDisplay("N/A"),
      f5RunLine: emptySpreadDisplay("N/A"),
      f5Total: emptyTotalDisplay("N/A"),
      propCandidates: [],
      propStatus: "Extended market request failed."
    };
    PROP_CACHE.set(cacheKey, { ts: Date.now(), value: value });
    return value;
  }
}

function buildPropCandidatesFromMarkets(bookMarkets, lineupContext, probablePitchers, parkFactor) {
  const props = [];
  const supported = (Array.isArray(bookMarkets) ? bookMarkets : []).filter(function(m) {
    return PROP_MARKETS_HITTER.concat(PROP_MARKETS_PITCHER).indexOf(m.key) >= 0;
  });

  supported.forEach(function(market) {
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
    const grouped = {};

    outcomes.forEach(function(outcome) {
      const player = sanitizePlayerName(outcome && (outcome.description || outcome.participant || ""));
      const line = outcome && outcome.point != null ? Number(outcome.point) : null;
      const side = String(outcome && outcome.name || "").toLowerCase();

      if (!player || line == null || !isFinite(line) || (side !== "over" && side !== "under")) return;

      const key = market.key + "|" + normalizeName(player) + "|" + line;
      if (!grouped[key]) {
        grouped[key] = {
          marketKey: market.key,
          player: player,
          line: line,
          over: null,
          under: null
        };
      }

      grouped[key][side] = {
        price: outcome.price != null ? Number(outcome.price) : null
      };
    });

    Object.keys(grouped).forEach(function(key) {
      const pair = grouped[key];
      if (!pair.over && !pair.under) return;

      const playerContext = resolvePlayerContext(pair.player, lineupContext, probablePitchers);
      const sideProbabilities = getPropModelProbabilities({
        marketKey: pair.marketKey,
        line: pair.line,
        player: pair.player,
        playerContext: playerContext,
        parkFactor: parkFactor
      });

      if (pair.over && pair.over.price != null) {
        props.push(buildOnePropCandidate({
          marketKey: pair.marketKey,
          player: pair.player,
          line: pair.line,
          side: "Over",
          price: Number(pair.over.price),
          modelProb: sideProbabilities.over,
          playerContext: playerContext
        }));
      }

      if (pair.under && pair.under.price != null) {
        props.push(buildOnePropCandidate({
          marketKey: pair.marketKey,
          player: pair.player,
          line: pair.line,
          side: "Under",
          price: Number(pair.under.price),
          modelProb: sideProbabilities.under,
          playerContext: playerContext
        }));
      }
    });
  });

  return props;
}

function getPropModelProbabilities(args) {
  const marketKey = args.marketKey;
  const playerContext = args.playerContext || {};
  const lineupPlayer = playerContext.lineupPlayer || null;
  const slot = lineupPlayer ? Number(lineupPlayer.lineupIndex || 0) : 0;
  const bats = lineupPlayer ? lineupPlayer.bats : null;
  const opposingPitcherHand = playerContext.opposingPitcherHand || null;
  const parkFactor = Number(args.parkFactor || 1.0);

  let score = 0;

  if (marketKey === "batter_hits") {
    score += getLineupSlotBonus(slot) * 1.2;
    if (parkFactor > 1.02) score += 0.16;
    if (parkFactor < 0.97) score -= 0.14;
    if (bats === "S") score += 0.08;
    else if (opposingPitcherHand && bats && opposingPitcherHand !== bats) score += 0.06;
  } else if (marketKey === "batter_total_bases") {
    score += getLineupSlotBonus(slot) * 1.35;
    if (parkFactor > 1.02) score += 0.24;
    if (parkFactor < 0.97) score -= 0.18;
    if (bats === "S") score += 0.09;
    else if (opposingPitcherHand && bats && opposingPitcherHand !== bats) score += 0.08;
  } else if (marketKey === "batter_home_runs") {
    score += getLineupSlotBonus(slot) * 0.9;
    if (parkFactor > 1.03) score += 0.22;
    if (parkFactor < 0.97) score -= 0.18;
    if (bats === "S") score += 0.05;
    else if (opposingPitcherHand && bats && opposingPitcherHand !== bats) score += 0.06;
    score -= 0.12;
  } else if (marketKey === "pitcher_strikeouts" || marketKey === "pitcher_outs") {
    const adjustment = getPitcherPropLineupAdjustment(
      marketKey,
      playerContext.opposingLineup,
      playerContext.ownPitcherHand
    );
    score += adjustment;
  }

  const over = clamp(0.50 + score, 0.25, 0.75);
  return { over: over, under: round2(1 - over) };
}

function buildOnePropCandidate(args) {
  const marketKey = args.marketKey;
  const player = args.player;
  const side = args.side;
  const line = args.line;
  const price = args.price;
  const modelProb = clamp(Number(args.modelProb || 0.5), 0.01, 0.99);
  const impliedProb = americanToImpliedProb(price);
  const edgePct = impliedProb != null ? round2((modelProb - impliedProb) * 100) : 0;

  const marketLabel = getPropMarketLabel(marketKey);
  const propSubType = marketKey.indexOf("pitcher_") === 0 ? "pitcher" : "hitter";

  const reasons = [];
  reasons.push(player + " " + marketLabel + " " + side + " " + line);
  if (args.playerContext && args.playerContext.lineupPlayer) {
    reasons.push("Lineup slot " + args.playerContext.lineupPlayer.lineupIndex + " is included in scoring.");
  } else {
    reasons.push("Player lineup slot could not be confirmed; model used a conservative baseline.");
  }

  if (args.playerContext && args.playerContext.opposingPitcherHand) {
    reasons.push("Opponent handedness was included in the prop context.");
  }

  return {
    marketFamily: "prop",
    propSubType: propSubType,
    marketKey: marketKey,
    market: marketLabel,
    player: player,
    side: side,
    line: line,
    bestBet: player + " " + marketLabel + " " + side + " " + line,
    bestBetType: "Prop",
    oddsPrice: isFinite(Number(price)) ? Number(price) : null,
    modelProb: round2(modelProb),
    impliedProb: impliedProb != null ? round2(impliedProb) : null,
    fairProb: round2(modelProb),
    edgePct: edgePct,
    contextTilt: round2(Math.abs(modelProb - 0.5) * 4),
    reasons: reasons
  };
}

function getPropMarketLabel(marketKey) {
  switch (marketKey) {
    case "batter_hits": return "Hits";
    case "batter_total_bases": return "Total Bases";
    case "batter_home_runs": return "Home Runs";
    case "pitcher_strikeouts": return "Pitcher Strikeouts";
    case "pitcher_outs": return "Pitcher Outs";
    default: return marketKey;
  }
}
function buildComponentScores(args) {
  const lineupContext = args.lineupContext || {};
  const parkFactor = Number(args.parkFactor || 1.0);
  const probablePitchers = args.probablePitchers || {};

  const starterDelta =
    (probablePitchers.home !== "TBD" ? 0.35 : 0) -
    (probablePitchers.away !== "TBD" ? 0.35 : 0);

  const lineupTilt = getLineupStrengthTilt(lineupContext);
  const bullpenTilt = 0.12;
  const offenseTilt = lineupTilt * 0.75;

  const totalStarterImpact =
    probablePitchers.home !== "TBD" && probablePitchers.away !== "TBD"
      ? -0.18
      : 0.10;

  const totalLineupImpact = lineupContext.officialLineupAvailable ? 0.08 : -0.04;
  const totalParkImpact = round2((parkFactor - 1.0) * 3.5);
  const totalBullpenImpact = 0.06;

  return {
    side: {
      startingPitcher: round2(starterDelta),
      bullpen: round2(bullpenTilt),
      lineup: round2(lineupTilt),
      offenseVsHand: round2(offenseTilt)
    },
    total: {
      starters: round2(totalStarterImpact),
      lineup: round2(totalLineupImpact),
      parkFactor: round2(totalParkImpact),
      bullpen: round2(totalBullpenImpact)
    },
    liveFeedStatus: {
      bullpen: "placeholder",
      scheduleTravel: "placeholder",
      defense: "placeholder"
    }
  };
}

function buildModelOutputs(args) {
  const componentScores = args.componentScores || {};
  const moneylineData = args.moneylineData || {};
  const totalData = args.totalData || {};
  const parkFactor = Number(args.parkFactor || 1.0);

  const sideComposite =
    Number(componentScores.side && componentScores.side.startingPitcher || 0) +
    Number(componentScores.side && componentScores.side.bullpen || 0) +
    Number(componentScores.side && componentScores.side.lineup || 0) +
    Number(componentScores.side && componentScores.side.offenseVsHand || 0);

  const totalComposite =
    Number(componentScores.total && componentScores.total.starters || 0) +
    Number(componentScores.total && componentScores.total.lineup || 0) +
    Number(componentScores.total && componentScores.total.parkFactor || 0) +
    Number(componentScores.total && componentScores.total.bullpen || 0);

  const homeWinProb = clamp(0.5 + (sideComposite * 0.08), 0.35, 0.65);
  const awayWinProb = round2(1 - homeWinProb);

  const fairMlHome = probToAmerican(homeWinProb);
  const fairMlAway = probToAmerican(awayWinProb);

  const marketHomeProb = moneylineData.homePrice != null ? americanToImpliedProb(moneylineData.homePrice) : null;
  const marketAwayProb = moneylineData.awayPrice != null ? americanToImpliedProb(moneylineData.awayPrice) : null;

  const awayEdgePct = marketAwayProb != null ? round2((awayWinProb - marketAwayProb) * 100) : 0;
  const homeEdgePct = marketHomeProb != null ? round2((homeWinProb - marketHomeProb) * 100) : 0;

  const baseTotal = totalData.line != null ? Number(totalData.line) : 8.0;
  const fairTotal = round2(baseTotal + (totalComposite * 0.65) + ((parkFactor - 1.0) * 1.2));

  const overProb = clamp(0.5 + ((fairTotal - baseTotal) * 0.09), 0.32, 0.68);
  const underProb = round2(1 - overProb);

  const marketOverProb = totalData.overPrice != null ? americanToImpliedProb(totalData.overPrice) : null;
  const marketUnderProb = totalData.underPrice != null ? americanToImpliedProb(totalData.underPrice) : null;

  return {
    sideComposite: round2(sideComposite),
    totalComposite: round2(totalComposite),

    fairMlAway: fairMlAway,
    fairMlHome: fairMlHome,
    fairTotal: fairTotal,

    awayWinProb: round2(awayWinProb * 100),
    homeWinProb: round2(homeWinProb * 100),

    awayEdgePct: awayEdgePct,
    homeEdgePct: homeEdgePct,
    overEdgePct: marketOverProb != null ? round2((overProb - marketOverProb) * 100) : 0,
    underEdgePct: marketUnderProb != null ? round2((underProb - marketUnderProb) * 100) : 0,

    overConfidence: round2(overProb * 100),
    underConfidence: round2(underProb * 100),

    awayRunLineConfidence: round2(clamp(50 + (awayEdgePct * 1.1), 1, 99)),
    homeRunLineConfidence: round2(clamp(50 + (homeEdgePct * 1.1), 1, 99))
  };
}

function generateAllCandidates(context) {
  const out = [];
  out.push.apply(out, generateFullGameCandidates(context));
  out.push.apply(out, generateF5Candidates(context));
  out.push.apply(out, Array.isArray(context.propCandidates) ? context.propCandidates : []);
  return out;
}

function generateFullGameCandidates(context) {
  const out = [];
  const ml = context.moneylineData || {};
  const rl = context.spreadData || {};
  const total = context.totalData || {};
  const model = context.modelOutputs || {};

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "away",
      bestBet: context.awayTeam + " ML",
      bestBetType: "Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2((Number(model.awayWinProb || 50)) / 100),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: Number(model.awayEdgePct || 0),
      reasons: [
        "Away moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, lineup, and offense are included."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "full",
      market: "moneyline",
      side: "home",
      bestBet: context.homeTeam + " ML",
      bestBetType: "Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2((Number(model.homeWinProb || 50)) / 100),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: Number(model.homeEdgePct || 0),
      reasons: [
        "Home moneyline is compared to model fair price.",
        "Starting pitcher, bullpen, lineup, and offense are included."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "over",
      bestBet: "Over " + total.line,
      bestBetType: "Total",
      oddsPrice: total.overPrice,
      fairProb: round2((Number(model.overConfidence || 50)) / 100),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: Number(model.overEdgePct || 0),
      reasons: [
        "Game total is compared to model fair total.",
        "Park factor and lineup status are included."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    out.push({
      marketFamily: "full",
      market: "total",
      side: "under",
      bestBet: "Under " + total.line,
      bestBetType: "Total",
      oddsPrice: total.underPrice,
      fairProb: round2((Number(model.underConfidence || 50)) / 100),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: Number(model.underEdgePct || 0),
      reasons: [
        "Game total is compared to model fair total.",
        "Park factor and lineup status are included."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(((Number(model.awayWinProb || 50) / 100) + 0.03), 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "away",
      bestBet: context.awayTeam + " " + formatSignedPoint(rl.awayPoint),
      bestBetType: "Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "Run line uses the side model as the anchor.",
        "Price discipline is included in confidence."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(((Number(model.homeWinProb || 50) / 100) + 0.03), 0.01, 0.99);
    out.push({
      marketFamily: "full",
      market: "runline",
      side: "home",
      bestBet: context.homeTeam + " " + formatSignedPoint(rl.homePoint),
      bestBetType: "Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "Run line uses the side model as the anchor.",
        "Price discipline is included in confidence."
      ]
    });
  }

  return out;
}

function generateF5Candidates(context) {
  const out = [];
  const ml = context.f5MoneylineData || {};
  const rl = context.f5RunLineData || {};
  const total = context.f5TotalData || {};
  const componentScores = context.componentScores || {};
  const sideScore =
    Number(componentScores.side && componentScores.side.startingPitcher || 0) +
    Number(componentScores.side && componentScores.side.lineup || 0);

  const homeProb = clamp(0.5 + (sideScore * 0.09), 0.35, 0.65);
  const awayProb = round2(1 - homeProb);

  if (ml.awayPrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "away",
      bestBet: context.awayTeam + " F5 ML",
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.awayPrice,
      fairProb: round2(awayProb),
      impliedProb: americanToImpliedProb(ml.awayPrice),
      edgePct: round2((awayProb - (americanToImpliedProb(ml.awayPrice) || 0)) * 100),
      reasons: [
        "F5 moneyline is anchored to starting pitcher and opening lineup strength.",
        "Bullpen impact is intentionally reduced for first-five markets."
      ]
    });
  }

  if (ml.homePrice != null) {
    out.push({
      marketFamily: "f5",
      market: "f5_moneyline",
      side: "home",
      bestBet: context.homeTeam + " F5 ML",
      bestBetType: "F5 Moneyline",
      oddsPrice: ml.homePrice,
      fairProb: round2(homeProb),
      impliedProb: americanToImpliedProb(ml.homePrice),
      edgePct: round2((homeProb - (americanToImpliedProb(ml.homePrice) || 0)) * 100),
      reasons: [
        "F5 moneyline is anchored to starting pitcher and opening lineup strength.",
        "Bullpen impact is intentionally reduced for first-five markets."
      ]
    });
  }

  if (total.line != null && total.overPrice != null) {
    const overProb = clamp(0.5 + ((Number(componentScores.total && componentScores.total.parkFactor || 0) * 0.06)), 0.32, 0.68);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "over",
      bestBet: "F5 Over " + total.line,
      bestBetType: "F5 Total",
      oddsPrice: total.overPrice,
      fairProb: round2(overProb),
      impliedProb: americanToImpliedProb(total.overPrice),
      edgePct: round2((overProb - (americanToImpliedProb(total.overPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes park and starter context.",
        "Bullpen and late-game volatility are intentionally reduced."
      ]
    });
  }

  if (total.line != null && total.underPrice != null) {
    const underProb = clamp(0.5 - ((Number(componentScores.total && componentScores.total.parkFactor || 0) * 0.06)), 0.32, 0.68);
    out.push({
      marketFamily: "f5",
      market: "f5_total",
      side: "under",
      bestBet: "F5 Under " + total.line,
      bestBetType: "F5 Total",
      oddsPrice: total.underPrice,
      fairProb: round2(underProb),
      impliedProb: americanToImpliedProb(total.underPrice),
      edgePct: round2((underProb - (americanToImpliedProb(total.underPrice) || 0)) * 100),
      reasons: [
        "F5 total emphasizes park and starter context.",
        "Bullpen and late-game volatility are intentionally reduced."
      ]
    });
  }

  if (rl.awayPoint != null && rl.awayPrice != null) {
    const prob = clamp(awayProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "away",
      bestBet: context.awayTeam + " F5 " + formatSignedPoint(rl.awayPoint),
      bestBetType: "F5 Run Line",
      oddsPrice: rl.awayPrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.awayPrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.awayPrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability and price discipline.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  if (rl.homePoint != null && rl.homePrice != null) {
    const prob = clamp(homeProb + 0.02, 0.01, 0.99);
    out.push({
      marketFamily: "f5",
      market: "f5_runline",
      side: "home",
      bestBet: context.homeTeam + " F5 " + formatSignedPoint(rl.homePoint),
      bestBetType: "F5 Run Line",
      oddsPrice: rl.homePrice,
      fairProb: round2(prob),
      impliedProb: americanToImpliedProb(rl.homePrice),
      edgePct: round2((prob - (americanToImpliedProb(rl.homePrice) || 0)) * 100),
      reasons: [
        "F5 run line uses first-five side probability and price discipline.",
        "Starter edge carries more weight than bullpen."
      ]
    });
  }

  return out;
}

function getSignedEdgePct(candidate) {
  const n = Number(candidate && candidate.edgePct);
  return isFinite(n) ? n : 0;
}

function getPositiveEdgePct(candidate) {
  return Math.max(0, getSignedEdgePct(candidate));
}

function isProjectedLineupContext(context) {
  return !(
    context &&
    context.lineupContext &&
    context.lineupContext.officialLineupAvailable
  );
}

function isHeavyJuice(price) {
  const p = Number(price);
  return isFinite(p) && p < -150;
}

function isVeryHeavyJuice(price) {
  const p = Number(price);
  return isFinite(p) && p < -175;
}

function getPriceDisciplineBonus(price) {
  const p = Number(price);
  if (!isFinite(p)) return 0;
  if (p >= -115 && p <= 130) return 1.1;
  if (p >= -130 && p <= 145) return 0.7;
  if (p >= -145 && p <= 165) return 0.2;
  if (p < -145 && p >= -170) return -0.55;
  if (p < -170) return -1.1;
  return 0.15;
}

function getCandidateBucket(candidate) {
  const marketFamily = String(candidate && candidate.marketFamily || "");
  const bestBetType = String(candidate && candidate.bestBetType || "");
  const bestBet = String(candidate && candidate.bestBet || "");

  if (marketFamily === "f5") {
    if (/total/i.test(bestBetType) || /^F5 Over /i.test(bestBet) || /^F5 Under /i.test(bestBet)) return "f5_total";
    if (/run line/i.test(bestBetType)) return "f5_runline";
    return "f5_side";
  }

  if (marketFamily === "prop") {
    if (/Pitcher Strikeouts/i.test(bestBet)) return "pitcher_k_prop";
    if (/Pitcher Outs/i.test(bestBet)) return "pitcher_outs_prop";
    if (/Home Runs/i.test(bestBet)) return "hitter_hr_prop";
    if (/Total Bases/i.test(bestBet)) return "hitter_tb_prop";
    if (/Hits/i.test(bestBet)) return "hitter_hits_prop";
    return "generic_prop";
  }

  if (/Run Line/i.test(bestBetType)) return "runline";
  if (/Total/i.test(bestBetType) || /^Over /i.test(bestBet) || /^Under /i.test(bestBet)) return "total";
  return "side";
}

function getNegativeEdgePenalty(candidate) {
  const edge = getSignedEdgePct(candidate);
  if (edge >= 0) return 0;
  return Math.abs(edge) * 1.35;
}

function getProjectedLineupPenalty(candidate, context) {
  if (!isProjectedLineupContext(context)) return 0;
  const bucket = getCandidateBucket(candidate);

  if (
    bucket === "hitter_hits_prop" ||
    bucket === "hitter_tb_prop" ||
    bucket === "hitter_hr_prop" ||
    bucket === "pitcher_k_prop" ||
    bucket === "pitcher_outs_prop" ||
    bucket === "f5_side" ||
    bucket === "f5_total" ||
    bucket === "f5_runline"
  ) {
    return 0.65;
  }

  return 0.18;
}

function getValueScore(candidate) {
  const positiveEdge = getPositiveEdgePct(candidate);
  const negativeEdgePenalty = getNegativeEdgePenalty(candidate);
  const juiceBonus = getPriceDisciplineBonus(candidate && candidate.oddsPrice);

  const fairProbBonus =
    candidate && candidate.fairProb != null && candidate.impliedProb != null
      ? Math.max(0, (Number(candidate.fairProb) - Number(candidate.impliedProb)) * 1.4)
      : 0;

  return round2((positiveEdge * 1.15) + juiceBonus + fairProbBonus - negativeEdgePenalty);
}

function getCandidateParkTilt(candidate, parkFactor) {
  const pf = Number(parkFactor || 1.0);
  if (candidate.marketFamily === "prop") {
    if (/Home Runs|Total Bases/i.test(candidate.bestBet)) return round2((pf - 1.0) * 2.2);
    if (/Hits/i.test(candidate.bestBet)) return round2((pf - 1.0) * 1.4);
    if (/Pitcher Strikeouts|Pitcher Outs/i.test(candidate.bestBet)) return round2((1.0 - pf) * 1.4);
  }
  if (/^Over /i.test(candidate.bestBet) || /^F5 Over /i.test(candidate.bestBet)) return round2((pf - 1.0) * 2.0);
  if (/^Under /i.test(candidate.bestBet) || /^F5 Under /i.test(candidate.bestBet)) return round2((1.0 - pf) * 2.0);
  return 0;
}

function getMissingDataPenalty(componentScores) {
  let penalty = 0;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.bullpen !== "live") penalty += 0.14;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.scheduleTravel !== "live") penalty += 0.10;
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.defense === "placeholder") penalty += 0.05;
  return penalty;
}

function getMarketShapeBonus(candidate, context) {
  const bucket = getCandidateBucket(candidate);

  if (bucket === "side") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.10;
  }

  if (bucket === "total") {
    const underBonus =
      /^Under /i.test(String(candidate && candidate.bestBet || "")) &&
      context &&
      context.totalData &&
      context.totalData.line != null &&
      Number(context.totalData.line) <= 8
        ? 0.45
        : 0;
    return (Math.abs(Number(context && context.modelOutputs && context.modelOutputs.totalComposite || 0)) * 1.10) + underBonus;
  }

  if (bucket === "runline") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 0.85;
  }

  if (bucket === "f5_side") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.30;
  }

  if (bucket === "f5_total") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.totalComposite || 0)) * 1.20;
  }

  if (bucket === "f5_runline") {
    return Math.abs(Number(context && context.modelOutputs && context.modelOutputs.sideComposite || 0)) * 1.00;
  }

  if (bucket === "pitcher_k_prop" || bucket === "pitcher_outs_prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.35;
  }

  if (bucket === "hitter_hits_prop" || bucket === "hitter_tb_prop" || bucket === "hitter_hr_prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.15;
  }

  if (String(candidate && candidate.marketFamily || "") === "prop") {
    return Math.abs(Number(candidate && candidate.contextTilt || 0)) * 1.0;
  }

  return 0;
}

function getContextScore(candidate, context) {
  const lineupBonus = context && context.lineupContext && context.lineupContext.officialLineupAvailable ? 0.65 : -0.10;
  const parkTilt = getCandidateParkTilt(candidate, context && context.parkFactor || 1.0);
  const starterKnownBonus =
    context &&
    context.probablePitchers &&
    context.probablePitchers.away !== "TBD" &&
    context.probablePitchers.home !== "TBD"
      ? 0.40
      : 0;

  const marketShapeBonus = getMarketShapeBonus(candidate, context || {});
  const missingDataPenalty = getMissingDataPenalty(context && context.componentScores);
  const projectedLineupPenalty = getProjectedLineupPenalty(candidate, context);

  return round2(lineupBonus + parkTilt + starterKnownBonus + marketShapeBonus - missingDataPenalty - projectedLineupPenalty);
}

function getDataCompleteness(componentScores, lineupContext, candidate) {
  let score = 0;
  const bucket = getCandidateBucket(candidate);

  if (lineupContext && lineupContext.officialLineupAvailable) score += 28;
  if (componentScores && componentScores.side && Math.abs(Number(componentScores.side.startingPitcher || 0)) > 0.05) score += 18;
  if (componentScores && componentScores.side && Math.abs(Number(componentScores.side.lineup || 0)) > 0.05) score += 16;
  if (componentScores && componentScores.total && Math.abs(Number(componentScores.total.parkFactor || 0)) > 0.05) score += 12;

  if (
    bucket === "pitcher_k_prop" ||
    bucket === "pitcher_outs_prop" ||
    bucket === "hitter_hits_prop" ||
    bucket === "hitter_tb_prop" ||
    bucket === "hitter_hr_prop" ||
    bucket === "f5_side" ||
    bucket === "f5_total" ||
    bucket === "f5_runline"
  ) {
    if (lineupContext && lineupContext.officialLineupAvailable) score += 12;
    else score -= 10;
  }

  return Math.max(0, Math.min(score, 100));
}

function getThresholdsForBetType(bestBetType, marketFamily, candidateType, candidate) {
  const bucket = getCandidateBucket(candidate || { bestBetType: bestBetType, marketFamily: marketFamily, bestBet: candidateType });

  switch (bucket) {
    case "side":
      return { high: 4.7, medium: 2.9, minEdgeHigh: 1.6, minEdgeMedium: 0.6, minCompletenessHigh: 42 };
    case "total":
      return { high: 4.6, medium: 2.8, minEdgeHigh: 1.5, minEdgeMedium: 0.6, minCompletenessHigh: 40 };
    case "runline":
      return { high: 5.0, medium: 3.1, minEdgeHigh: 1.9, minEdgeMedium: 0.8, minCompletenessHigh: 42 };
    case "f5_side":
      return { high: 5.3, medium: 3.2, minEdgeHigh: 2.0, minEdgeMedium: 0.9, minCompletenessHigh: 46 };
    case "f5_total":
      return { high: 5.1, medium: 3.1, minEdgeHigh: 1.8, minEdgeMedium: 0.8, minCompletenessHigh: 44 };
    case "f5_runline":
      return { high: 5.5, medium: 3.3, minEdgeHigh: 2.1, minEdgeMedium: 0.9, minCompletenessHigh: 46 };
    case "pitcher_k_prop":
      return { high: 5.0, medium: 3.0, minEdgeHigh: 1.7, minEdgeMedium: 0.7, minCompletenessHigh: 46 };
    case "pitcher_outs_prop":
      return { high: 4.9, medium: 2.9, minEdgeHigh: 1.7, minEdgeMedium: 0.7, minCompletenessHigh: 46 };
    case "hitter_hits_prop":
      return { high: 5.0, medium: 3.0, minEdgeHigh: 1.7, minEdgeMedium: 0.7, minCompletenessHigh: 48 };
    case "hitter_tb_prop":
      return { high: 5.3, medium: 3.1, minEdgeHigh: 1.9, minEdgeMedium: 0.8, minCompletenessHigh: 48 };
    case "hitter_hr_prop":
      return { high: 5.8, medium: 3.4, minEdgeHigh: 2.3, minEdgeMedium: 1.0, minCompletenessHigh: 50 };
    default:
      return { high: 4.9, medium: 3.0, minEdgeHigh: 1.7, minEdgeMedium: 0.7, minCompletenessHigh: 44 };
  }
}

function determineConfidenceTier(finalScore, thresholds, candidate, context) {
  const signedEdge = getSignedEdgePct(candidate);
  const positiveEdge = getPositiveEdgePct(candidate);
  const completeness = Number(candidate && candidate.dataCompleteness || 0);
  const bucket = getCandidateBucket(candidate);
  const officialLineups = !!(context && context.lineupContext && context.lineupContext.officialLineupAvailable);
  const expensiveFavorite = isHeavyJuice(candidate && candidate.oddsPrice);
  const veryHeavyFavorite = isVeryHeavyJuice(candidate && candidate.oddsPrice);

  if (signedEdge <= 0) return "Low";

  if (
    finalScore >= thresholds.high &&
    positiveEdge >= thresholds.minEdgeHigh &&
    completeness >= thresholds.minCompletenessHigh &&
    !(veryHeavyFavorite && positiveEdge < (thresholds.minEdgeHigh + 0.8)) &&
    !(
      (bucket === "f5_side" || bucket === "f5_total" || bucket === "f5_runline" ||
       bucket === "pitcher_k_prop" || bucket === "pitcher_outs_prop" ||
       bucket === "hitter_hits_prop" || bucket === "hitter_tb_prop" || bucket === "hitter_hr_prop")
      && !officialLineups
      && finalScore < (thresholds.high + 0.5)
    )
  ) {
    return "High";
  }

  if (
    finalScore >= thresholds.medium &&
    positiveEdge >= thresholds.minEdgeMedium &&
    !(expensiveFavorite && positiveEdge < thresholds.minEdgeHigh)
  ) {
    return "Medium";
  }

  return "Low";
}

function recommendStakeUnits(finalScore, confidence, candidate) {
  const bucket = getCandidateBucket(candidate);

  if (confidence === "High") {
    if (bucket === "f5_side" || bucket === "f5_total" || bucket === "f5_runline") {
      return finalScore >= 6.2 ? 1.0 : 0.75;
    }
    return finalScore >= 6.0 ? 1.25 : 1.0;
  }

  if (confidence === "Medium") return 0.5;
  return 0.25;
}

function getRecommendedTiming(candidate, context) {
  if (candidate.marketFamily === "prop" && context.lineupContext && context.lineupContext.officialLineupAvailable) {
    return "After confirmed lineups";
  }
  if (candidate.marketFamily === "f5") return "Closer to first pitch";
  return "Monitor market";
}

function scoreCandidates(context, candidates) {
  const arr = Array.isArray(candidates) ? candidates : [];

  return arr.map(function(candidate) {
    const valueScore = getValueScore(candidate);
    const contextScore = getContextScore(candidate, context);
    const dataCompleteness = getDataCompleteness(
      context && context.componentScores,
      context && context.lineupContext,
      candidate
    );

    const completenessScore = round2(dataCompleteness / 14);
    const negativeEdgePenalty = getSignedEdgePct(candidate) < 0 ? Math.abs(getSignedEdgePct(candidate)) * 1.15 : 0;

    const finalScore = round2(
      (valueScore * 0.57) +
      (contextScore * 0.23) +
      (completenessScore * 0.20) -
      negativeEdgePenalty
    );

    const thresholds = getThresholdsForBetType(
      candidate && candidate.bestBetType,
      candidate && candidate.marketFamily,
      candidate && candidate.bestBet,
      candidate
    );

    const enriched = Object.assign({}, candidate, {
      valueScore: round2(valueScore),
      contextScore: round2(contextScore),
      dataCompleteness: round2(dataCompleteness),
      completenessScore: round2(completenessScore),
      finalScore: round2(finalScore)
    });

    const confidence = determineConfidenceTier(finalScore, thresholds, enriched, context);
    const confidenceScore = round2(
      confidence === "High" ? Math.max(82, Math.min(98, 82 + (finalScore - thresholds.high) * 6.0)) :
      confidence === "Medium" ? Math.max(58, Math.min(81, 58 + (finalScore - thresholds.medium) * 6.0)) :
      Math.max(20, Math.min(57, 40 + finalScore * 3.0))
    );

    return Object.assign({}, enriched, {
      confidence: confidence,
      confidenceScore: confidenceScore,
      recommendedTiming: getRecommendedTiming(enriched, context),
      recommendedStakeUnits: recommendStakeUnits(finalScore, confidence, candidate)
    });
  });
}

function applyPerGameRanking(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice()
    .sort(function(a, b) {
      return Number(b.finalScore || 0) - Number(a.finalScore || 0);
    })
    .map(function(c, idx) {
      return Object.assign({}, c, { slateRank: idx + 1 });
    });
}

function filterCandidatesForView(candidates, viewMode) {
  const arr = Array.isArray(candidates) ? candidates : [];

  if (viewMode === "pitcher_props") {
    return arr.filter(function(c) { return c.marketFamily === "prop" && c.propSubType === "pitcher"; });
  }

  if (viewMode === "hitter_props") {
    return arr.filter(function(c) { return c.marketFamily === "prop" && c.propSubType === "hitter"; });
  }

  if (viewMode === "props") {
    return arr.filter(function(c) { return c.marketFamily === "prop"; });
  }

  if (viewMode === "f5") {
    return arr.filter(function(c) { return c.marketFamily === "f5"; });
  }

  return arr.filter(function(c) { return c.marketFamily === "full"; });
}

function chooseBestCandidate(filteredCandidates, rankedCandidates, viewMode) {
  const arr = Array.isArray(filteredCandidates) ? filteredCandidates : [];
  if (arr.length) return arr[0];

  return {
    marketFamily: viewMode === "f5" ? "f5" : (viewMode === "full" ? "full" : "prop"),
    bestBet: "Pass",
    bestBetType: "Pass",
    oddsPrice: null,
    confidence: "Low",
    confidenceScore: 0,
    finalScore: 0,
    reasons: ["No qualifying candidate was generated for this view."],
    recommendedTiming: "Monitor market",
    recommendedStakeUnits: 0.0
  };
}

function chooseTopPropCandidate(rankedCandidates) {
  const top = (Array.isArray(rankedCandidates) ? rankedCandidates : []).find(function(c) {
    return c.marketFamily === "prop";
  });

  if (!top) return null;

  return {
    player: top.player,
    market: top.market,
    price: top.oddsPrice,
    modelProb: round2((Number(top.modelProb || top.fairProb || 0.5)) * 100),
    reasons: Array.isArray(top.reasons) ? top.reasons : []
  };
}

function buildTopPropOverallReason(topProp, lineupContext) {
  if (!topProp) return "No supported prop returned.";
  const reasonBits = [];
  if (topProp.market) reasonBits.push(topProp.market + " ranked highest among prop candidates.");
  if (lineupContext && lineupContext.officialLineupAvailable) reasonBits.push("Confirmed lineups improved confidence.");
  if (Array.isArray(topProp.reasons) && topProp.reasons.length) reasonBits.push(topProp.reasons[0]);
  return reasonBits.join(" ");
}

function buildRiskWarnings(componentScores, bestCandidate, rankedCandidates, viewMode) {
  const warnings = [];
  if (!bestCandidate || bestCandidate.bestBet === "Pass") warnings.push("No market cleared the current scoring thresholds.");
  if (componentScores && componentScores.liveFeedStatus && componentScores.liveFeedStatus.bullpen !== "live") {
    warnings.push("Bullpen inputs are still using placeholder context.");
  }
  if (viewMode === "props" || viewMode === "pitcher_props" || viewMode === "hitter_props") {
    const hasOfficial = rankedCandidates.some(function(c) { return c.marketFamily === "prop"; });
    if (!hasOfficial) warnings.push("No qualifying BetMGM prop was returned for this matchup.");
  }
  return warnings;
}

function buildGamePayload(args) {
  const originalGame = args.originalGame || {};
  const best = args.bestCandidate || {};
  const topProp = args.topPropCandidate || null;
  const moneylineData = args.moneylineData || emptyMoneylineDisplay("N/A");
  const spreadData = args.spreadData || emptySpreadDisplay("N/A");
  const totalData = args.totalData || emptyTotalDisplay("N/A");
  const f5MoneylineData = args.f5MoneylineData || emptyMoneylineDisplay("N/A");
  const f5RunLineData = args.f5RunLineData || emptySpreadDisplay("N/A");
  const f5TotalData = args.f5TotalData || emptyTotalDisplay("N/A");
  const lineupContext = args.lineupContext || {};
  const modelOutputs = args.modelOutputs || {};
  const componentScores = args.componentScores || {};
  const scoredCandidates = Array.isArray(args.scoredCandidates) ? args.scoredCandidates : [];
  const propStatus = args.propStatus || "No supported prop returned.";

  return {
    id: originalGame.id || "",
    eventId: originalGame.id || "",
    rawCommenceTime: originalGame.commence_time || "",
    time: formatBoardDateTime(originalGame.commence_time || ""),
    away: args.awayTeam,
    home: args.homeTeam,
    probablePitchers: args.probablePitchers || null,
    viewMode: args.viewMode,

    moneyline: moneylineData.display,
    runLine: spreadData.display,
    total: totalData.display,
    firstFiveMoneyline: f5MoneylineData.display,
    firstFiveRunLine: f5RunLineData.display,
    firstFiveTotal: f5TotalData.display,

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
    firstFiveMoneylineConfidence: deriveF5ConfidenceMap(scoredCandidates, "f5_moneyline"),
    firstFiveTotalConfidence: deriveF5TotalConfidenceMap(scoredCandidates),
    firstFiveRunLineConfidence: deriveF5RunLineConfidenceMap(scoredCandidates),

    lineupMode: lineupContext.lineupMode,
    lineupSource: lineupContext.lineupSource,
    officialLineupAvailable: lineupContext.officialLineupAvailable,
    projectedLineupUsed: lineupContext.projectedLineupUsed,
    projectedLineups: lineupContext.projectedLineups,
    officialLineups: lineupContext.officialLineups,

    bestBet: best.bestBet || "Pass",
    bestBetType: best.bestBetType || "Pass",
    bestBetOdds: best.oddsPrice != null ? best.oddsPrice : null,
    confidence: best.confidence || "Low",
    confidenceScore: best.confidenceScore != null ? best.confidenceScore : 0,
    recommendedTiming: best.recommendedTiming || "Monitor market",
    recommendedStakeUnits: best.recommendedStakeUnits != null ? best.recommendedStakeUnits : 0,
    reasons: Array.isArray(best.reasons) ? best.reasons : [],

    topPropOverall: topProp,
    topPropOverallReason: topProp ? buildTopPropOverallReason(topProp, lineupContext) : propStatus,
    propStatus: propStatus,

    componentScores: componentScores,
    riskWarnings: Array.isArray(args.riskWarnings) ? args.riskWarnings : [],
    parkFactor: args.parkFactor,
    debug: {
      topCandidates: scoredCandidates.slice(0, 7).map(function(c) {
        return {
          bestBet: c.bestBet,
          bestBetType: c.bestBetType,
          marketFamily: c.marketFamily,
          propSubType: c.propSubType || null,
          edgePct: c.edgePct,
          valueScore: c.valueScore,
          contextScore: c.contextScore,
          dataCompleteness: c.dataCompleteness,
          finalScore: c.finalScore,
          confidence: c.confidence,
          slateRank: c.slateRank
        };
      }),
      lineupDiagnostics: lineupContext.lineupDebug,
      dataAvailability: {
        officialLineupAvailable: lineupContext.officialLineupAvailable,
        hitterPropGenerated: scoredCandidates.some(function(c) {
          return c.marketFamily === "prop" && c.propSubType === "hitter";
        }),
        underGenerated: scoredCandidates.some(function(c) {
          return c.bestBetType === "Total" && /^Under /i.test(c.bestBet);
        })
      }
    }
  };
}

function deriveF5ConfidenceMap(candidates, market) {
  const away = (candidates || []).find(function(c) { return c.market === market && c.side === "away"; });
  const home = (candidates || []).find(function(c) { return c.market === market && c.side === "home"; });

  return {
    away: away ? sigmoidScoreToPct(away.finalScore) : null,
    home: home ? sigmoidScoreToPct(home.finalScore) : null
  };
}

function deriveF5TotalConfidenceMap(candidates) {
  const over = (candidates || []).find(function(c) { return c.market === "f5_total" && c.side === "over"; });
  const under = (candidates || []).find(function(c) { return c.market === "f5_total" && c.side === "under"; });

  return {
    over: over ? sigmoidScoreToPct(over.finalScore) : null,
    under: under ? sigmoidScoreToPct(under.finalScore) : null
  };
}

function deriveF5RunLineConfidenceMap(candidates) {
  const away = (candidates || []).find(function(c) { return c.market === "f5_runline" && c.side === "away"; });
  const home = (candidates || []).find(function(c) { return c.market === "f5_runline" && c.side === "home"; });

  return {
    away: away ? sigmoidScoreToPct(away.finalScore) : null,
    home: home ? sigmoidScoreToPct(home.finalScore) : null
  };
}