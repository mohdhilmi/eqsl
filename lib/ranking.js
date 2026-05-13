// Pure ranking helpers. All times are in milliseconds; null/undefined = DNF.
// Lower time is better. DNF participants always sort last.

const { getDb } = require('../db');

function bestTime(times) {
  const valid = times.filter((t) => Number.isFinite(t) && t > 0);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

// Render milliseconds as MM:SS:CS (three colon-separated pairs). DNF -> 'DNF'.
function formatMs(ms) {
  if (ms == null) return 'DNF';
  const totalCs = Math.round(ms / 10);
  const minutes = Math.floor(totalCs / 6000);
  const seconds = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return (
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + ':' +
    String(cs).padStart(2, '0')
  );
}

// Empty / zeroed default for input fields when no time has been recorded.
const ZERO_TIME = '00:00:00';

// Parse user input into milliseconds. null = DNF / not recorded.
// Accepted formats:
//   "MM:SS:CS"  e.g. "00:05:42"   <-- preferred stopwatch format
//   "MM:SS.cs"  e.g. "00:05.42"
//   "SS.cs"     e.g. "5.42"
//   ""  or "DNF"  or all-zero -> null
function parseTimeInput(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === '' || s.toUpperCase() === 'DNF') return null;

  let seconds = NaN;
  const colonParts = s.split(':');
  if (colonParts.length === 3) {
    const [mm, ss, cc] = colonParts.map((p) => parseInt(p, 10));
    if ([mm, ss, cc].some((n) => !Number.isFinite(n))) return null;
    seconds = mm * 60 + ss + cc / 100;
  } else if (colonParts.length === 2) {
    const mm = parseInt(colonParts[0], 10);
    const rest = parseFloat(colonParts[1]);
    if (!Number.isFinite(mm) || !Number.isFinite(rest)) return null;
    seconds = mm * 60 + rest;
  } else if (colonParts.length === 1) {
    seconds = parseFloat(colonParts[0]);
  } else {
    return null;
  }

  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

// Compute ranked rows for (categoryId, disciplineId, round).
// Returns: [{ participant_id, full_name, bib_no, school, gender,
//             attempts: [t1,t2,t3], best_ms, rank }]
// rank is 1-based; DNFs get null rank.
function rankParticipants({ categoryId, disciplineId, round }) {
  const db = getDb();

  const participants = db
    .prepare(
      `SELECT id, bib_no, full_name, gender, school
       FROM participants
       WHERE category_id = ?
       ORDER BY id`
    )
    .all(categoryId);

  if (participants.length === 0) return [];

  const attemptsStmt = db.prepare(
    `SELECT attempt_no, time_ms FROM attempts
     WHERE participant_id = ? AND discipline_id = ? AND round = ?`
  );

  let rows = participants.map((p) => {
    const attemptRows = attemptsStmt.all(p.id, disciplineId, round);
    const attempts = [null, null, null];
    for (const a of attemptRows) attempts[a.attempt_no - 1] = a.time_ms;
    return {
      participant_id: p.id,
      bib_no: p.bib_no,
      full_name: p.full_name,
      gender: p.gender,
      school: p.school,
      attempts,
      hasAttempt: attemptRows.length > 0,
      best_ms: bestTime(attempts),
    };
  });

  // For finals, only show participants who actually competed in this round.
  // (Non-finalists shouldn't appear in the finals ranking at all.)
  if (round === 'final') {
    rows = rows.filter((r) => r.hasAttempt);
  }

  // Sort: valid times ascending, DNFs last.
  rows.sort((a, b) => {
    if (a.best_ms == null && b.best_ms == null) return 0;
    if (a.best_ms == null) return 1;
    if (b.best_ms == null) return -1;
    return a.best_ms - b.best_ms;
  });

  rows.forEach((r, i) => {
    r.rank = r.best_ms == null ? null : i + 1;
  });

  return rows;
}

// Top-N helper used for finalists (N=5) and winners (N=3).
function topN(rows, n) {
  return rows.filter((r) => r.rank != null && r.rank <= n);
}

module.exports = {
  bestTime,
  formatMs,
  parseTimeInput,
  rankParticipants,
  topN,
  ZERO_TIME,
};
