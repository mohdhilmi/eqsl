const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const { init, getDb } = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

init();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'eqsl-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  })
);

// Make common data available to every view.
app.use((req, res, next) => {
  const db = getDb();
  res.locals.categories = db
    .prepare('SELECT id, name FROM categories ORDER BY id')
    .all();
  res.locals.disciplines = db
    .prepare('SELECT id, code, name FROM disciplines ORDER BY id')
    .all();
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`eQSL server listening on http://localhost:${PORT}`);
});
