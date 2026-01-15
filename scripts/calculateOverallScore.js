// scripts/calculateOverallScore.js
"use strict";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Season raw score (2026 only, stat matches only).
 * Intentionally "position-neutral" and later normalised to 0..100 across all players.
 */
function computeSeasonRaw({
  playedSeason,
  wins,
  draws,
  goals,
  assists,
  cleanSheets,
  conceded,
  ogs,
  otfs,
  motm,
  motmCaptain,     // captain + MOTM in same match
  winningCaptain,  // captain + WIN
}) {
  if (!playedSeason || playedSeason <= 0) return 0;

  // Win% in points-per-game terms: W=1, D=0.5, L=0
  const ppg = (wins + 0.5 * draws) / playedSeason;

  // Weights (tune later if needed)
  const W = {
    PPG: 25,               // medium
    MOTM: 8,               // strong
    MOTM_CAP_BONUS: 3,     // extra on top of MOTM
    WINNING_CAP: 4.0,      // mid boost for winning captain only
    GOAL: 2.0,             // medium-low
    ASSIST: 2.0,           // same as goal (per your change)
    CLEAN_SHEET: 7.0,      // high because rare
    CONCEDED: -0.35,       // moderate negative
    OG: -2.5,              // stings more than a goal helps
    OTF: -0.15,            // tiny (barely moves needle)
  };

  return (
    (W.PPG * ppg) +
    (W.MOTM * motm) +
    (W.MOTM_CAP_BONUS * motmCaptain) +
    (W.WINNING_CAP * winningCaptain) +
    (W.GOAL * goals) +
    (W.ASSIST * assists) +
    (W.CLEAN_SHEET * cleanSheets) +
    (W.CONCEDED * conceded) +
    (W.OG * ogs) +
    (W.OTF * otfs)
  );
}

/**
 * Recent inactivity penalty:
 * - Only consider if playedLast10 <= 2
 * - IMMUNE if season attendance >= 20%
 * - Otherwise: 2 => 0, 1 => 0.5, 0 => 1 of penaltyMax
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
    combined: rawSeason - penalty,
  };
}

/**
 * Normalise combined scores to 0..100 across all players.
 * Returns integers (rounded), plus leaves you with combined floats for tie-breaks.
 */
function normaliseTo100(combinedByPlayerId) {
  const vals = Object.values(combinedByPlayerId);
  if (!vals.length) return {};

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  if (max === min) {
    const out = {};
    for (const pid of Object.keys(combinedByPlayerId)) out[pid] = 50;
    return out;
  }

  const out = {};
  for (const [pid, v] of Object.entries(combinedByPlayerId)) {
    const ovr = 100 * (v - min) / (max - min);
    out[pid] = Math.round(ovr);
  }
  return out;
}

module.exports = {
  computeSeasonRaw,
  computeRecentPenalty,
  computeCombined,
  normaliseTo100,
};
