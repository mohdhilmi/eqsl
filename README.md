# eQSL — Sports Stacking Competition Management System

A web app to run a Sports Stacking competition end-to-end: participant
registration, qualifying & final round timing entry, automatic best-time
selection, automatic ranking, top-5 finalist selection, top-3 winner
determination, printable result slips, and Excel export.

## Stack

- Node.js + Express
- SQLite via `better-sqlite3` (file: `data.sqlite`)
- EJS server-rendered views
- Session-based admin auth (bcrypt)
- ExcelJS for `.xlsx` export
- Browser print-to-PDF for result slips

## Categories (seeded)

- Terbuka B19 L/P
- Terbuka B15 L/P
- Terbuka B12 L/P
- SDS Rendah
- SDS Menengah

## Disciplines (seeded)

- 3-3-3
- 3-6-3
- Cycle

## Rules implemented

- Each participant has 3 attempts per discipline per round.
- Best (lowest) time of the 3 attempts is selected automatically.
- Qualifying: ranked by best time; **top 5** advance.
- Final: top-5 finalists run another 3 attempts; ranked by best time;
  **top 3** are awarded Champion / 1st Runner-Up / 2nd Runner-Up.
- DNF (blank time) is sorted last.

## Run

```bash
npm install
npm run init-db   # creates data.sqlite, seeds categories/disciplines, seeds admin
npm start         # http://localhost:3000
```

Default admin: `admin` / `admin123`. Change this in production.

## Routes

Public:

- `GET  /`             — landing page
- `GET  /register`     — registration form
- `POST /register`     — create participant
- `GET  /results`      — public results browser

Admin (require login):

- `GET  /admin/login`  — login form
- `POST /admin/login`
- `GET  /admin`        — dashboard
- `GET  /admin/participants`            — list / filter
- `POST /admin/participants`            — add
- `DELETE /admin/participants/:id`      — remove
- `GET  /admin/timings`                 — entry form (qualifying or final)
- `POST /admin/timings`                 — upsert attempt times
- `GET  /admin/results`                 — rankings + actions
- `GET  /admin/slip`                    — printable result slip (HTML, print to PDF)
- `GET  /admin/export.xlsx`             — Excel export of full ranking

All filtered by `?category_id=&discipline_id=&round=qualifying|final`.

## Time entry format

`seconds.cs` — e.g. `5.42`. `1:02.34` is also accepted.
Blank cell = DNF.


## Deploy on Render

This repo includes a `render.yaml` blueprint.

1. Create a free account at https://render.com and connect your GitHub.
2. Click **New +** → **Blueprint** → pick `mohdhilmi/eqsl` → **Apply**.
   Render reads `render.yaml`, provisions one web service, and auto-generates `SESSION_SECRET`.
3. Wait for the build & first deploy. Your app will be live at `https://eqsl.onrender.com` (or similar).
4. **Change the default admin password** by logging in as `admin` / `admin123` and updating it (a future feature) — for now, set a new password by re-seeding via the Render shell:
   ```bash
   node -e "const b=require('bcryptjs');const{getDb}=require('./db');getDb().prepare('UPDATE admins SET password_hash=? WHERE username=?').run(b.hashSync('YOUR_NEW_PASSWORD',10),'admin')"
   ```

### Custom domain `stacking.xo.je`

InfinityFree owns the `xo.je` domain. To point `stacking.xo.je` at Render:

1. In Render → your service → **Settings** → **Custom Domains** → **Add Custom Domain** → enter `stacking.xo.je`. Render will show you a CNAME target like `eqsl.onrender.com`.
2. Log into the InfinityFree control panel for `stacking.xo.je` and open the **DNS / CNAME records** section.
3. Add a CNAME record:
   - **Name / Host**: `stacking` (or `@` if InfinityFree treats the subdomain as the apex of this zone)
   - **Target / Value**: the CNAME shown by Render (e.g. `eqsl.onrender.com`)
   - **TTL**: default
4. Wait for DNS to propagate (usually a few minutes, sometimes up to an hour). Render will detect the record and issue a free TLS certificate automatically.

### Free-tier caveat: data is ephemeral

Render's free web tier has an ephemeral filesystem. Each redeploy or cold start wipes `data.sqlite`. For real competition use, upgrade to a paid plan and uncomment the `disk:` block in `render.yaml` (and update `DB_PATH` to the mount path). Alternatively, swap SQLite for a hosted Postgres (Render offers free Postgres for 90 days) — happy to do that port when you're ready.
