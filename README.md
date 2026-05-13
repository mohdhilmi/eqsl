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
