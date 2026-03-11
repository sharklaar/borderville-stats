// scripts/calculateOverallScore.js
"use strict";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Season raw score (2026 only, stat matches only).
 * Intentionally "position-neutral".
 * Role gating happens in aggregate.js.
 */
function computeSeasonRaw({
  playedSeason,
  wins,
  draws,
  goals,
  assists,
  cleanSheets,
  conceded,
  concededExactlyOneMatches,
  ogs,
  otfs,
  motm,
  motmCaptain,
  winningCaptain,
  honourableMentions
}) {

  if (!playedSeason || playedSeason <= 0) return 0;

  const ppg = (wins + 0.5 * draws) / playedSeason;

  const W = {

    PPG: 25,

    MOTM: 8,
    MOTM_CAP_BONUS: 3,
    WINNING_CAP: 4,

    GOAL: 2.0,
    ASSIST: 2.0,

    CLEAN_SHEET: 7.0,
    CONCEDED_EXACTLY_ONE_MATCH: 2.0,

    CONCEDED: -0.35,

    OG: -2.5,
    OTF: -0.15,
    HON_MENTION: 0.15
  };

  return (
    (W.PPG * ppg) +
    (W.MOTM * motm) +
    (W.MOTM_CAP_BONUS * motmCaptain) +
    (W.WINNING_CAP * winningCaptain) +
    (W.GOAL * goals) +
    (W.ASSIST * assists) +
    (W.CLEAN_SHEET * cleanSheets) +
    (W.CONCEDED_EXACTLY_ONE_MATCH * (concededExactlyOneMatches ?? 0)) +
    (W.CONCEDED * conceded) +
    (W.OG * ogs) +
    (W.OTF * otfs) +
    (W.HON_MENTION * (honourableMentions ?? 0))
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