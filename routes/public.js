// Public-facing routes: home, registration, public results.

const express = require('express');
const { getDb } = require('../db');
const { rankParticipants, topN, formatMs } = require('../lib/ranking');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const stats = {
    participants: db.prepare('SELECT COUNT(*) AS n FROM participants').get().n,
    attempts: db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,
  };
  res.render('home', { stats });
});

// Registration form
router.get('/register', (req, res) => {
  res.render('register', { values: {}, error: null });
});

router.post('/register', (req, res) => {
  const db = getDb();
  const { full_name, bib_no, gender, school, category_id } = req.body;

  if (!full_name || !category_id) {
    return res.status(400).render('register', {
      values: req.body,
      error: 'Name and category are required.',
    });
  }

  try {
    db.prepare(
      `INSERT INTO participants (full_name, bib_no, gender, school, category_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      full_name.trim(),
      bib_no ? String(bib_no).trim() : null,
      gender || null,
      school ? school.trim() : null,
      Number(category_id)
    );
  } catch (e) {
    return res.status(400).render('register', {
      values: req.body,
      error: e.message.includes('UNIQUE')
        ? 'Bib number already in use.'
        : e.message,
    });
  }
  req.session.flash = { type: 'success', msg: 'Registration successful!' };
  res.redirect('/register');
});

// Public results: choose category + discipline + round (qualifying/final)
router.get('/results', (req, res) => {
  const db = getDb();
  const categoryId = Number(req.query.category_id) || null;
  const disciplineId = Number(req.query.discipline_id) || null;
  const round = req.query.round === 'final' ? 'final' : 'qualifying';

  let rows = [];
  let categoryName = null;
  let disciplineName = null;
  if (categoryId && disciplineId) {
    rows = rankParticipants({ categoryId, disciplineId, round });
    categoryName = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId)?.name;
    disciplineName = db.prepare('SELECT name FROM disciplines WHERE id = ?').get(disciplineId)?.name;
  }

  // Apply podium/finalist limits for display.
  const display = round === 'final' ? topN(rows, 3) : rows;

  res.render('results', {
    categoryId,
    disciplineId,
    round,
    rows: display,
    allRows: rows,
    categoryName,
    disciplineName,
    formatMs,
  });
});

module.exports = router;
