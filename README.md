# Simple Users CRUD

A minimal **Manage Users** app for Autocode GenAI tests (bug fixes, feature changes, UI tweaks).

## Stack

- Node.js + Express REST API
- JSON file storage (`data/users.json`)
- Vanilla HTML / CSS / JS frontend

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Dev mode with auto-restart:

```bash
npm run dev
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user |
| POST | `/api/users` | Create user `{ name, email, role? }` |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/health` | Health check |

## Project layout

```
server.js           Express entry
routes/users.js     CRUD routes + validation
data/users.json     Seed / persisted users
public/
  index.html        UI shell
  styles.css        Styles
  app.js            Frontend logic
```

## Good Autocode test ideas

- Fix validation bugs (email format, duplicate email)
- Add fields (phone, status) end-to-end
- Add sorting / pagination
- Change UI layout or theme
- Add confirmation toast instead of `alert`/`confirm`
