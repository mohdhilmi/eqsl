// SQLite schema + seed for the Sports Stacking Competition system.
// Single source of truth: import { getDb } elsewhere; this file also runs
// directly via `node db.js` to (re)initialize the database.

const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');

let _db;
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS disciplines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bib_no TEXT UNIQUE,
  full_name TEXT NOT NULL,
  gender TEXT,                 -- 'L' or 'P'
  school TEXT,
  category_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

-- One row per attempt. round = 'qualifying' | 'final'.
-- time_ms = NULL means DNF / not recorded.
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  discipline_id INTEGER NOT NULL,
  round TEXT NOT NULL CHECK (round IN ('qualifying','final')),
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  time_ms INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (participant_id, discipline_id, round, attempt_no),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attempts_lookup
  ON attempts (round, discipline_id, participant_id);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
`;

const SEED_CATEGORIES = [
  'Terbuka B19 L/P',
  'Terbuka B15 L/P',
  'Terbuka B12 L/P',
  'SDS Rendah',
  'SDS Menengah',
];

const SEED_DISCIPLINES = [
  { code: '333', name: '3-3-3' },
  { code: '363', name: '3-6-3' },
  { code: 'cycle', name: 'Cycle' },
];

function init() {
  const db = getDb();
  db.exec(SCHEMA);

  const insertCategory = db.prepare(
    'INSERT OR IGNORE INTO categories (name) VALUES (?)'
  );
  const insertDiscipline = db.prepare(
    'INSERT OR IGNORE INTO disciplines (code, name) VALUES (?, ?)'
  );

  const seed = db.transaction(() => {
    SEED_CATEGORIES.forEach((c) => insertCategory.run(c));
    SEED_DISCIPLINES.forEach((d) => insertDiscipline.run(d.code, d.name));

    const adminRow = db
      .prepare('SELECT COUNT(*) AS n FROM admins')
      .get();
    if (adminRow.n === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      db.prepare(
        'INSERT INTO admins (username, password_hash) VALUES (?, ?)'
      ).run('admin', hash);
    }
  });
  seed();
}

module.exports = { getDb, init, DB_PATH };

if (require.main === module) {
  init();
  console.log('Database initialized at', DB_PATH);
  console.log('Default admin -> username: admin  password: admin123');
}
