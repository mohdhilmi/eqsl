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

// Render (and most PaaS) terminates TLS at a proxy. Trust it so secure cookies
// and req.protocol behave correctly behind the proxy.
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

const isProd = process.env.NODE_ENV === 'production';
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'eqsl-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // require HTTPS in prod (Render serves HTTPS)
    },
  })
);

// Lightweight healthcheck for Render.
app.get('/healthz', (req, res) => res.type('text').send('ok'));

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
