// Pure ranking helpers. All times are in milliseconds; null/undefined = DNF.
// Lower time is better. DNF participants always sort last.

const { getDb } = require('../db');

function bestTime(times) {
  const valid = times.filter((t) => Number.isFinite(t) && t > 0);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

function formatMs(ms) {
  if (ms == null) return 'DNF';
  const totalCs = Math.round(ms / 10); // centiseconds
  const seconds = Math.floor(totalCs / 100);
  const cs = totalCs % 100;
  return `${seconds}.${String(cs).padStart(2, '0')}`;
}

// Parse "12.34" or "1:02.34" or "" into milliseconds (or null).
function parseTimeInput(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === '' || s.toUpperCase() === 'DNF') return null;
  const parts = s.split(':');
  let seconds;
  if (parts.length === 1) {
    seconds = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
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
};
