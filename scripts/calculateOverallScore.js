// scripts/calculateOverallScore.js
"use strict";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalisePosition(position) {
  return String(position || "").trim().toUpperCase();
}

function isDefOrGk(position) {
  const pos = normalisePosition(position);
  return pos === "DEF" || pos === "GK";
}

function goalPointsForPosition(position) {
  const pos = normalisePosition(position);
  if (pos === "GK") return 10;
  if (pos === "DEF") return 6;
  return 4; // MID / FWD / unknown
}

/**
 * Borderville season raw score (2026 only, stat matches only).
 * Uses the agreed defender-friendly FPL-style model.
 */
function computeSeasonRaw({
  position,
  playedSeason,
  wins,
  goals,
  assists,
  cleanSheets,
  concededExactlyOneMatches,
  concededExactlyTwoMatches,
  ogs,
  otfs,
  motm,
  motmCaptain
}) {

  if (!playedSeason || playedSeason <= 0) return 0;

  const isDefensive = isDefOrGk(position);

  const W = {
    APPEARANCE: 1,
    GOAL: goalPointsForPosition(position),
    ASSIST: 3,
    CLEAN_SHEET: isDefensive ? 6 : 0,
    CONCEDED_EXACTLY_ONE_MATCH: isDefensive ? 3 : 0,
    CONCEDED_EXACTLY_TWO_MATCH: isDefensive ? 2 : 0,
    WIN: 3,
    DEFENSIVE_WIN_BONUS: isDefensive ? 2 : 0,
    MOTM: 3,
    MOTM_CAP_BONUS: 1,
    OG: -2,
    OTF: -1
  };

  return (
    (W.APPEARANCE * playedSeason) +
    ((W.WIN + W.DEFENSIVE_WIN_BONUS) * wins) +
    (W.GOAL * goals) +
    (W.ASSIST * assists) +
    (W.CLEAN_SHEET * cleanSheets) +
    (W.CONCEDED_EXACTLY_ONE_MATCH * (concededExactlyOneMatches ?? 0)) +
    (W.CONCEDED_EXACTLY_TWO_MATCH * (concededExactlyTwoMatches ?? 0)) +
    (W.MOTM * motm) +
    (W.MOTM_CAP_BONUS * motmCaptain) +
    (W.OG * ogs) +
    (W.OTF * otfs)
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

  const penalty = computeRecentPenalty(inputs);

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
