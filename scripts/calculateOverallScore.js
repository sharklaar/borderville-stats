// scripts/calculateOverallScore.js
"use strict";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Borderville season raw score (2026 only, stat matches only).
 * Uses actual match roles rather than listed player position.
 */
function computeSeasonRaw({
  roleApps,
  roleWins,
  roleGoals,
  assists,
  cleanSheets,
  concededExactlyOneMatches,
  concededExactlyTwoMatches,
  ogs,
  otfs,
  motm,
  motmCaptain
}) {

  const appsGK = asNumber(roleApps?.GK);
  const appsDEF = asNumber(roleApps?.DEF);
  const appsOTHER = asNumber(roleApps?.OTHER);
  const playedSeason = appsGK + appsDEF + appsOTHER;

  if (playedSeason <= 0) return 0;

  const winsGK = asNumber(roleWins?.GK);
  const winsDEF = asNumber(roleWins?.DEF);
  const winsOTHER = asNumber(roleWins?.OTHER);

  const goalsGK = asNumber(roleGoals?.GK);
  const goalsDEF = asNumber(roleGoals?.DEF);
  const goalsOTHER = asNumber(roleGoals?.OTHER);

  return (
    playedSeason +
    ((winsGK + winsDEF) * 5) +
    (winsOTHER * 3) +
    (goalsGK * 10) +
    (goalsDEF * 6) +
    (goalsOTHER * 4) +
    (asNumber(assists) * 3) +
    (asNumber(cleanSheets) * 6) +
    (asNumber(concededExactlyOneMatches) * 3) +
    (asNumber(concededExactlyTwoMatches) * 2) +
    (asNumber(motm) * 3) +
    asNumber(motmCaptain) +
    (asNumber(ogs) * -2) +
    (asNumber(otfs) * -1)
  );
}

/**
 * Recent inactivity penalty
 */
function computeRecentPenalty({
  playedLast10,
  playedSeason,
  matchesSeason,
  attendanceImmunity = 0.20,
  penaltyMax = 12,
}) {

  if (!matchesSeason || matchesSeason <= 0) return 0;

  const attendanceRate = playedSeason / matchesSeason;

  if (attendanceRate >= attendanceImmunity) return 0;

  if (playedLast10 > 2) return 0;

  const inactivity = clamp((2 - playedLast10) / 2, 0, 1);

  return inactivity * penaltyMax;
}

function computeCombined(inputs) {

  const rawSeason = computeSeasonRaw(inputs);
  const playedSeason =
    asNumber(inputs?.roleApps?.GK) +
    asNumber(inputs?.roleApps?.DEF) +
    asNumber(inputs?.roleApps?.OTHER);

  const penalty = computeRecentPenalty({
    ...inputs,
    playedSeason,
  });

  return {
    rawSeason,
    penalty,
    combined: rawSeason - penalty
  };
}

/**
 * Standard normalisation
 */
function normaliseTo100(scoreMap) {

  const vals = Object.values(scoreMap);

  if (!vals.length) return {};

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  if (max === min) {
    const out = {};
    for (const pid of Object.keys(scoreMap)) out[pid] = 50;
    return out;
  }

  const out = {};

  for (const [pid, v] of Object.entries(scoreMap)) {
    const ovr = 100 * (v - min) / (max - min);
    out[pid] = Math.round(ovr);
  }

  return out;
}

module.exports = {
  computeSeasonRaw,
  computeRecentPenalty,
  computeCombined,
  normaliseTo100
};
