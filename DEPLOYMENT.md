# Deploying to Railway

The whole monorepo runs as a **single Railway service** — the Node backend builds the
React frontend and serves it from `frontend/dist` in production.

## 1. Create the Railway project

1. Push this repo to GitHub.
2. In Railway, **New project → Deploy from GitHub repo** and pick your fork.
3. Railway should auto-detect Node. If it doesn't, set the root build/start commands
   yourself (see below).

## 2. Add a PostgreSQL plugin

Inside the project, **+ New → Database → PostgreSQL**. Railway exposes the connection
string as `DATABASE_URL` to your service automatically.

## 3. Set environment variables

In the service's **Variables** tab, add:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (Railway also sets `PORT` automatically — leave this as-is). |
| `APP_BASE_URL` | The public URL Railway gives you, e.g. `https://your-app.up.railway.app` |
| `ENCRYPTION_KEY` | Output of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET` | Any long random string |
| `APP_USER_EMAIL` | Your sign-in email |
| `APP_USER_PASSWORD_HASH` | Output of `node -e "console.log(require('bcryptjs').hashSync('YOURPW', 12))"` |
| `RINGCENTRAL_SERVER` | `https://platform.ringcentral.com` (or sandbox while testing) |

## 4. Build & start commands

Railway should pick these up from `package.json`, but to be explicit:

- **Install command**: `npm install`
- **Build command**: `npm run build`
- **Start command**: `npm --workspace backend run prisma:migrate && npm start`

The `prisma:migrate` step runs `prisma db push --skip-generate`, which is safe to run
on every boot — it diffs the schema against the live database and applies any missing
changes. We use `db push` instead of `migrate deploy` because this app doesn't keep a
migrations history; schema changes flow straight from `schema.prisma`.

## 5. Configure RingCentral redirect URIs

For each of your 5 RingCentral developer apps, add this redirect URI:

```
https://YOUR-DEPLOYMENT.up.railway.app/api/oauth/callback
```

(Replace with the exact URL from Railway. The host has to match exactly — RingCentral
will reject mismatched callbacks.)

## 6. First sign-in

1. Open the Railway URL.
2. Sign in with `APP_USER_EMAIL` / the password you used when generating the bcrypt hash.
3. Go to **Settings → Add account** and connect each of the 5 RingCentral apps via OAuth.
4. Visit **Numbers** to label every line so the dashboard always shows you a friendly
   identifier when calls come in.

## 7. Operational tips

- **Token refresh**: a background job sweeps every 5 minutes and refreshes tokens that
  expire in the next 10 minutes. If a refresh fails (e.g. revoked refresh token), the
  account moves to `status: error` and shows up in the dashboard so you can re-auth it.
- **Microphone permission**: Chrome will prompt the first time you place or answer a call.
  The dashboard handles a denial by showing a banner — re-grant in
  `chrome://settings/content/microphone` if needed.
- **Sandbox vs production**: while testing, set `RINGCENTRAL_SERVER` to
  `https://platform.devtest.ringcentral.com` and use sandbox developer apps. Each
  production app must be graduated by RingCentral before it can talk to live tenants.
- **Backups**: enable Railway's PostgreSQL backups — losing the DB means losing OAuth
  tokens and you'll have to re-authorize all five accounts.
- **Scaling**: the WebPhone instances all live in the browser, so the backend stays light.
  A single Railway hobby instance is plenty for a single user.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Missing required env var: ENCRYPTION_KEY` on boot | Variable not set in Railway. |
| Account stuck on `connecting` after OAuth popup | Redirect URI mismatch — check it matches `APP_BASE_URL` exactly. |
| All accounts show `error` | Server time skew or rotated client secret — recreate the account in **Settings**. |
| Calls don't connect | Verify `VITE_USE_MOCK_WEBPHONE=false` in the build, mic permission granted, and the RingCentral app has the `VoipCalling` scope. |
