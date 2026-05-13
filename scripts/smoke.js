// Quick smoke test: seed sample participants + attempts, print rankings,
// verify finalist + winner selection. Run with `node scripts/smoke.js`.

const { getDb, init } = require('../db');
const { rankParticipants, topN, formatMs } = require('../lib/ranking');

init();
const db = getDb();

// Reset participant + attempt data so the smoke is deterministic.
db.exec("DELETE FROM attempts; DELETE FROM participants;");

const cat = db.prepare("SELECT id FROM categories WHERE name = ?").get('Terbuka B19 L/P');
const disc = db.prepare("SELECT id FROM disciplines WHERE code = ?").get('333');

const sample = [
  { name: 'Alice',  bib: 'A1', g: 'P', times: [620, 590, 575] },
  { name: 'Bob',    bib: 'A2', g: 'L', times: [610, 605, 600] },
  { name: 'Cara',   bib: 'A3', g: 'P', times: [565, 555, 552] }, // fastest
  { name: 'Dan',    bib: 'A4', g: 'L', times: [700, 695, 680] },
  { name: 'Eve',    bib: 'A5', g: 'P', times: [630, 615, 612] },
  { name: 'Finn',   bib: 'A6', g: 'L', times: [null, null, null] }, // DNF
  { name: 'Gita',   bib: 'A7', g: 'P', times: [580, 578, 570] },
];

const insertP = db.prepare(
  "INSERT INTO participants (full_name, bib_no, gender, category_id) VALUES (?, ?, ?, ?)"
);
const insertA = db.prepare(
  "INSERT INTO attempts (participant_id, discipline_id, round, attempt_no, time_ms) VALUES (?, ?, 'qualifying', ?, ?)"
);

for (const s of sample) {
  const r = insertP.run(s.name, s.bib, s.g, cat.id);
  s.times.forEach((t, i) => insertA.run(r.lastInsertRowid, disc.id, i + 1, t));
}

const ranking = rankParticipants({
  categoryId: cat.id,
  disciplineId: disc.id,
  round: 'qualifying',
});

console.log('Qualifying ranking — Terbuka B19 L/P · 3-3-3:');
ranking.forEach((r) => {
  console.log(
    `  ${r.rank ?? 'DNF'}.  ${r.full_name.padEnd(8)} bib=${r.bib_no}  best=${formatMs(r.best_ms)}  attempts=${r.attempts.map(formatMs).join('/')}`
  );
});

const finalists = topN(ranking, 5);
console.log('\nFinalists (top 5):', finalists.map((f) => f.full_name).join(', '));

// Now seed final attempts for those 5 and verify winners.
db.exec("DELETE FROM attempts WHERE round='final'");
const finalSeed = {
  Cara: [550, 548, 545],   // champion
  Gita: [560, 558, 559],   // 1st runner-up
  Alice: [570, 572, 571],  // 2nd runner-up
  Bob:  [600, 590, 588],
  Eve:  [610, 605, 600],
};
const insertF = db.prepare(
  "INSERT INTO attempts (participant_id, discipline_id, round, attempt_no, time_ms) VALUES (?, ?, 'final', ?, ?)"
);
for (const f of finalists) {
  const ts = finalSeed[f.full_name] || [null, null, null];
  ts.forEach((t, i) => insertF.run(f.participant_id, disc.id, i + 1, t));
}

const finalRanking = rankParticipants({
  categoryId: cat.id,
  disciplineId: disc.id,
  round: 'final',
});
console.log('\nFinal ranking:');
finalRanking.forEach((r) => {
  console.log(`  ${r.rank ?? 'DNF'}.  ${r.full_name.padEnd(8)} best=${formatMs(r.best_ms)}`);
});
const podium = topN(finalRanking, 3);
console.log('\nPodium:');
podium.forEach((p) => {
  const label = p.rank === 1 ? 'Champion' : p.rank === 2 ? '1st Runner-Up' : '2nd Runner-Up';
  console.log(`  ${label}: ${p.full_name} (${formatMs(p.best_ms)})`);
});
