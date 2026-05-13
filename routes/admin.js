// Admin routes: login, dashboard, participants CRUD,
// timing entry, qualifying & final round views, slips, exports.

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const {
  rankParticipants,
  topN,
  formatMs,
  parseTimeInput,
} = require('../lib/ranking');
const { buildResultsWorkbook } = require('../lib/export');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  next();
}

// ---------- Auth ----------
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) {
    return res.status(401).render('admin/login', { error: 'Invalid credentials.' });
  }
  req.session.user = { id: row.id, username: row.username };
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use(requireAuth);

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const db = getDb();
  const counts = {
    participants: db.prepare('SELECT COUNT(*) AS n FROM participants').get().n,
    qualifying: db.prepare(
      "SELECT COUNT(*) AS n FROM attempts WHERE round='qualifying'"
    ).get().n,
    final: db.prepare(
      "SELECT COUNT(*) AS n FROM attempts WHERE round='final'"
    ).get().n,
  };
  const perCategory = db
    .prepare(
      `SELECT c.name, COUNT(p.id) AS participants
       FROM categories c LEFT JOIN participants p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.id`
    )
    .all();
  res.render('admin/dashboard', { counts, perCategory });
});

// ---------- Participants ----------
router.get('/participants', (req, res) => {
  const db = getDb();
  const filterCategory = Number(req.query.category_id) || null;
  const params = [];
  let where = '';
  if (filterCategory) {
    where = 'WHERE p.category_id = ?';
    params.push(filterCategory);
  }
  const participants = db
    .prepare(
      `SELECT p.*, c.name AS category_name FROM participants p
       JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.category_id, p.id`
    )
    .all(...params);
  res.render('admin/participants', { participants, filterCategory });
});

router.post('/participants', (req, res) => {
  const db = getDb();
  const { full_name, bib_no, gender, school, category_id } = req.body;
  db.prepare(
    `INSERT INTO participants (full_name, bib_no, gender, school, category_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    full_name.trim(),
    bib_no ? bib_no.trim() : null,
    gender || null,
    school ? school.trim() : null,
    Number(category_id)
  );
  req.session.flash = { type: 'success', msg: 'Participant added.' };
  res.redirect('/admin/participants');
});

router.delete('/participants/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM participants WHERE id = ?').run(Number(req.params.id));
  req.session.flash = { type: 'success', msg: 'Participant removed.' };
  res.redirect('/admin/participants');
});

// ---------- Timings entry (qualifying & final) ----------
router.get('/timings', (req, res) => {
  const db = getDb();
  const categoryId = Number(req.query.category_id) || null;
  const disciplineId = Number(req.query.discipline_id) || null;
  const round = req.query.round === 'final' ? 'final' : 'qualifying';

  let participants = [];
  let qualifierIds = new Set();
  if (categoryId && disciplineId) {
    if (round === 'final') {
      // Only finalists (top 5 from qualifying) compete in finals.
      const qRows = rankParticipants({
        categoryId,
        disciplineId,
        round: 'qualifying',
      });
      const finalists = topN(qRows, 5);
      qualifierIds = new Set(finalists.map((r) => r.participant_id));
      participants = finalists.map((r) => ({
        id: r.participant_id,
        full_name: r.full_name,
        bib_no: r.bib_no,
        gender: r.gender,
      }));
    } else {
      participants = db
        .prepare(
          `SELECT id, full_name, bib_no, gender
           FROM participants WHERE category_id = ? ORDER BY id`
        )
        .all(categoryId);
    }
  }

  // Build a map of existing attempts.
  const existing = {};
  if (categoryId && disciplineId && participants.length) {
    const stmt = db.prepare(
      `SELECT participant_id, attempt_no, time_ms FROM attempts
       WHERE discipline_id = ? AND round = ? AND participant_id IN
       (${participants.map(() => '?').join(',')})`
    );
    const rows = stmt.all(
      disciplineId,
      round,
      ...participants.map((p) => p.id)
    );
    for (const row of rows) {
      existing[row.participant_id] = existing[row.participant_id] || {};
      existing[row.participant_id][row.attempt_no] = row.time_ms;
    }
  }

  res.render('admin/timings', {
    categoryId,
    disciplineId,
    round,
    participants,
    existing,
    formatMs,
  });
});

router.post('/timings', (req, res) => {
  const db = getDb();
  const disciplineId = Number(req.body.discipline_id);
  const round = req.body.round === 'final' ? 'final' : 'qualifying';
  const categoryId = Number(req.body.category_id);
  const times = req.body.times || {}; // { 'p<id>': { 'a<n>': '00:00:00' } }

  const upsert = db.prepare(
    `INSERT INTO attempts (participant_id, discipline_id, round, attempt_no, time_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(participant_id, discipline_id, round, attempt_no)
     DO UPDATE SET time_ms = excluded.time_ms, updated_at = CURRENT_TIMESTAMP`
  );

  const tx = db.transaction(() => {
    for (const [pidKey, attempts] of Object.entries(times)) {
      const participantId = Number(String(pidKey).replace(/^p/, ''));
      if (!Number.isInteger(participantId) || participantId <= 0) continue;
      for (const [nKey, raw] of Object.entries(attempts || {})) {
        const attemptNo = Number(String(nKey).replace(/^a/, ''));
        if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > 3) {
          continue;
        }
        const ms = parseTimeInput(raw);
        upsert.run(participantId, disciplineId, round, attemptNo, ms);
      }
    }
  });
  tx();

  req.session.flash = { type: 'success', msg: 'Timings saved.' };
  res.redirect(
    `/admin/timings?category_id=${categoryId}&discipline_id=${disciplineId}&round=${round}`
  );
});

// ---------- Results & slips ----------
function loadResults(req) {
  const db = getDb();
  const categoryId = Number(req.query.category_id) || null;
  const disciplineId = Number(req.query.discipline_id) || null;
  const round = req.query.round === 'final' ? 'final' : 'qualifying';
  if (!categoryId || !disciplineId) return null;

  const rows = rankParticipants({ categoryId, disciplineId, round });
  const categoryName = db.prepare('SELECT name FROM categories WHERE id=?').get(categoryId)?.name;
  const disciplineName = db.prepare('SELECT name FROM disciplines WHERE id=?').get(disciplineId)?.name;
  return { categoryId, disciplineId, round, rows, categoryName, disciplineName };
}

router.get('/results', (req, res) => {
  const ctx = loadResults(req);
  res.render('admin/results', {
    ...(ctx || {}),
    have: !!ctx,
    formatMs,
    topN,
  });
});

// Printable slip (HTML page styled for print -> PDF via browser).
router.get('/slip', (req, res) => {
  const ctx = loadResults(req);
  if (!ctx) return res.redirect('/admin/results');
  const { rows, round } = ctx;
  // Qualifying slip: top 5; Final slip: top 3.
  const limit = round === 'final' ? 3 : 5;
  const top = topN(rows, limit);
  res.render('admin/slip', { ...ctx, top, formatMs, limit });
});

// Excel export of full ranking (qualifying or final).
router.get('/export.xlsx', async (req, res, next) => {
  try {
    const ctx = loadResults(req);
    if (!ctx) return res.redirect('/admin/results');
    const wb = await buildResultsWorkbook({
      title: 'Sports Stacking Competition Results',
      categoryName: ctx.categoryName,
      disciplineName: ctx.disciplineName,
      round: ctx.round,
      rows: ctx.rows,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="results-${ctx.round}-${ctx.disciplineId}-${ctx.categoryId}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
