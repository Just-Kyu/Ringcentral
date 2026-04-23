# Unified Phone Dashboard

A web-based softphone that connects to **5 separate RingCentral accounts simultaneously** so
you can receive calls on any of ~15 business numbers and place outbound calls from any of
them — all from a single Chrome tab, with no desk phone required.

Built per [`ringcentral-multi-account-app-prompt.md`](./ringcentral-multi-account-app-prompt.md).

## What's in the box

- **Frontend** — Vite + React 18 + TypeScript + TailwindCSS + Zustand, plus a thin wrapper
  around `@ringcentral/web-phone` for browser WebRTC.
- **Backend** — Node 20 + Express + TypeScript + Prisma (PostgreSQL). Owns OAuth, encrypts
  RingCentral tokens at rest with AES-256-GCM, and proxies SIP provisioning so client
  secrets never reach the browser.
- **Demo mode** — out of the box, the frontend runs against a mock WebPhone that synthesizes
  incoming calls every 30–90s so you can experience the full UI without configuring any
  RingCentral accounts.

## Quick start (demo mode, no backend)

```bash
cd frontend
cp .env.example .env       # leaves VITE_USE_MOCK_WEBPHONE=true
npm install
npm run dev
```

Open http://localhost:5173, sign in with any email/password — the dashboard loads with 5
sample accounts, 15 labeled numbers, and a steady drip of fake incoming calls so you can
exercise the answer / hold / mute / transfer / hang-up flows.

## Full local setup (real RingCentral accounts)

1. **Postgres** — bring up a local Postgres or use a Railway connection string.
2. **Backend env** — copy `backend/.env.example` to `backend/.env` and fill in:
   - `DATABASE_URL`
   - `ENCRYPTION_KEY` — generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `JWT_SECRET` — any long random string
   - `APP_USER_EMAIL` and `APP_USER_PASSWORD_HASH` — generate the hash with
     `node -e "console.log(require('bcryptjs').hashSync('YOURPW', 12))"`
3. **Frontend env** — copy `frontend/.env.example` to `frontend/.env` and set
   `VITE_USE_MOCK_WEBPHONE=false` to use real RingCentral.
4. **Install + migrate**:
   ```bash
   npm install              # installs both workspaces
   npm --workspace backend run prisma:generate
   npx --workspace backend prisma migrate dev
   ```
5. **Run both processes**:
   ```bash
   npm run dev              # spawns backend on :3000 and frontend on :5173
   ```
6. Sign in, click **Settings → Add account**, paste the Client ID / Secret of one of your
   five RingCentral developer apps, and walk through the OAuth popup. Repeat for the other
   four.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Railway deployment.

## Architecture

```
Browser (Chrome)                   Railway (single service)
┌──────────────────────┐         ┌──────────────────────────┐
│ React + Tailwind UI  │         │ Express + Prisma         │
│ Zustand store        │ HTTPS   │  /api/auth               │
│ 5x WebPhone SDK      ├────────►│  /api/accounts           │
│   instances          │  WSS    │  /api/oauth/callback     │
│                      │         │  /api/numbers            │
│                      │         │  /api/call-log           │
└──────────────────────┘         │  /api/accounts/:id/      │
        ▲                        │       sip-provision      │
        │                        └────────────┬─────────────┘
        │                                     │
        │  RingCentral                        ▼
        │  WebRTC media   ┌──────────────────────────────────┐
        └────────────────►│ RingCentral Cloud (5 tenants)    │
                          │  + PostgreSQL (encrypted tokens)  │
                          └──────────────────────────────────┘
```

## Repo layout

```
.
├── package.json                  # root workspace
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # auth gate
│   │   ├── pages/                # LoginPage, DashboardPage, Dialpad, History, Numbers, Settings
│   │   ├── components/
│   │   │   ├── layout/           # TopBar, Sidebar
│   │   │   ├── calls/            # IncomingCallModal, ActiveCallPanel
│   │   │   ├── dialpad/          # Keypad, FromNumberSelect
│   │   │   └── ui/               # Button, Badge, Modal
│   │   ├── store/useStore.ts     # Zustand store, owns calls + accounts + history
│   │   ├── lib/webphone.ts       # WebPhone wrapper (real + mock)
│   │   ├── lib/api.ts            # typed REST client
│   │   └── types/                # shared TS types
│   └── vite.config.ts            # proxies /api to backend in dev
└── backend/
    ├── prisma/schema.prisma      # AppUser, Account, PhoneNumber, CallLog
    └── src/
        ├── index.ts              # Express bootstrap
        ├── env.ts
        ├── middleware/auth.ts    # JWT cookie session
        ├── services/
        │   ├── crypto.ts         # AES-256-GCM for tokens at rest
        │   ├── ringcentral.ts    # OAuth, refresh, SIP provisioning
        │   └── db.ts             # Prisma singleton
        ├── routes/
        │   ├── auth.ts           # POST /api/auth/login, /logout, GET /me
        │   ├── accounts.ts       # CRUD + /:id/sip-provision
        │   ├── oauth.ts          # GET /api/oauth/callback
        │   ├── numbers.ts        # PATCH /:id, POST /:id/default
        │   └── callLog.ts        # GET / POST
        └── jobs/tokenRefresh.ts  # 5-minute sweep, refresh tokens before expiry
```

## RingCentral developer app setup

For each of your 5 RingCentral accounts you need to create one developer app and grant
these scopes:

- `ReadAccounts`
- `ReadCallLog`
- `CallControl`
- `VoipCalling`
- `ReadPresence`

Add the redirect URI:

```
https://YOUR-DEPLOYMENT.up.railway.app/api/oauth/callback
```

(use `http://localhost:3000/api/oauth/callback` while developing locally).

Each developer app must be **graduated to Production** before it can authenticate against
your real production RingCentral tenants. While you're testing, point
`RINGCENTRAL_SERVER` at `https://platform.devtest.ringcentral.com` and use sandbox apps.

## Security notes

- RingCentral client secrets and OAuth tokens are encrypted at rest using AES-256-GCM with
  a versioned ciphertext format.
- The browser never sees a client secret — SIP provisioning is proxied through
  `/api/accounts/:id/sip-provision`.
- App-level login uses a bcrypt-hashed password (single user MVP, easy to extend).
- Sessions are httpOnly + SameSite=Lax cookies, signed with `JWT_SECRET`, expiring after
  24h of inactivity.
- The `/api/auth` and `/api/oauth` surfaces are rate-limited to 30 req/min per IP.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run backend (`:3000`) and frontend (`:5173`) concurrently. |
| `npm run build` | Build the backend (`tsc`) and frontend (`vite build`). |
| `npm run start` | Start the production backend, which serves the frontend bundle from `frontend/dist`. |
| `npm --workspace backend run prisma:migrate` | `prisma migrate deploy` (used in Railway start command). |

## License

Private / internal — see your organization's policy.
