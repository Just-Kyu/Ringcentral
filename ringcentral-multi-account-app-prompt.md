# Easy Call — Multi-Account RingCentral Dashboard Build Prompt

## Project Overview

Build a web application that connects to **an unlimited number of RingCentral accounts simultaneously** and allows the user to:

1. **Receive incoming calls** from every connected account (covering every number on every tenant) in one unified interface
2. **Make outbound calls** from any connected number by selecting which number to call from
3. **See clearly which number** is being called on incoming calls (which account + which specific number)
4. **Handle multiple simultaneous calls** with hold, transfer, mute, and switch capabilities
5. Run entirely in the browser using WebRTC — no phone hardware required

The app will be deployed on **Railway** and accessed via Chrome browser.

---

## Core Requirements

### Functional Requirements

- **Multi-Account Authentication**: OAuth 2.0 flow for every connected RingCentral account, with secure token storage and auto-refresh
- **Simultaneous WebRTC Connections**: One independent WebPhone SDK instance per account, scaling to as many accounts as the user adds
- **Unified Incoming Call Notifications**: When any number on any account rings, show a clear notification with:
  - Caller's phone number and name (if available)
  - Which business number was dialed
  - Which account it belongs to
  - Answer / Decline / Send to Voicemail buttons
- **Unified Outbound Dialer**: A single dialpad with a "From:" dropdown listing every connected number, grouped by account
- **Active Call Management**:
  - Hold / Resume
  - Mute / Unmute
  - DTMF keypad (for IVR navigation)
  - Transfer
  - Hang up
  - Switch between multiple active calls
- **Call History**: Unified log of all inbound/outbound calls across every connected account
- **Visual Account/Number Labels**: Every number should be labeled (e.g., "Main Line — Premier Trucking", "Sales — Account 2") configurable by the user

### Non-Functional Requirements

- **Runs in Chrome browser** (WebRTC support required)
- **Responsive design** — works on desktop primarily but should be usable on tablet
- **Secure token handling** — never expose Client Secrets to the frontend
- **Auto-reconnect** on WebRTC drops
- **Low latency** — calls should connect within 2 seconds
- **Clean, modern UI** — looks like a professional softphone, not a developer tool

---

## Technical Stack

### Frontend
- **React 18+** with TypeScript
- **Vite** as the build tool
- **TailwindCSS** for styling
- **shadcn/ui** for base components
- **Lucide React** for icons
- **Zustand** for global state management
- **@ringcentral/web-phone** SDK for WebRTC voice
- **@ringcentral/sdk** for REST API calls

### Backend
- **Node.js 20+** with Express (or Fastify)
- **TypeScript**
- **PostgreSQL** (via Railway) for storing:
  - Account configurations
  - OAuth tokens (encrypted)
  - Number labels
  - Call history
- **Prisma** as the ORM
- **express-session** or **JWT** for app-level authentication
- **Crypto module** for encrypting OAuth tokens at rest

### Deployment
- **Railway** (user already has an account)
- Single service deployment (backend serves the React build)
- Environment variables for all secrets

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Browser (Chrome)                     │
│  ┌────────────────────────────────────────────┐  │
│  │  React Frontend                            │  │
│  │  - Unified Dashboard UI                    │  │
│  │  - N× WebPhone SDK instances               │  │
│  │  - Zustand state store                     │  │
│  └───────────────┬────────────────────────────┘  │
└──────────────────┼───────────────────────────────┘
                   │
                   │ HTTPS + WSS (for WebRTC)
                   │
┌──────────────────┼───────────────────────────────┐
│          Railway Deployment                       │
│  ┌───────────────▼────────────────────────────┐  │
│  │  Node.js Backend                           │  │
│  │  - OAuth flow handler (unlimited accounts) │  │
│  │  - Token refresh service                   │  │
│  │  - SIP provisioning proxy                  │  │
│  │  - Call history logger                     │  │
│  └───────────────┬────────────────────────────┘  │
│                  │                                │
│  ┌───────────────▼────────────────────────────┐  │
│  │  PostgreSQL Database                       │  │
│  │  - accounts, tokens, numbers, call_log     │  │
│  └────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
                   │
                   │ RingCentral Platform APIs
                   ▼
            ┌──────────────┐
            │ RingCentral  │
            │   Cloud      │
            └──────────────┘
```

---

## Detailed Feature Specifications

### 1. Account Setup Flow

- First-time setup wizard that guides the user to add each of their 5 RingCentral accounts
- For each account, the user enters:
  - A friendly account name (e.g., "Premier Trucking")
  - RingCentral App Client ID
  - RingCentral App Client Secret
- The app then runs the OAuth 2.0 Authorization Code flow
- After successful OAuth, fetch all phone numbers associated with that account and let the user label each one
- Store all of this encrypted in the database

### 2. Main Dashboard UI

Layout (desktop):

```
┌────────────────────────────────────────────────────────────┐
│  LOGO    [Account Status: 5/5 Connected]   [⚙ Settings]    │
├──────────────┬─────────────────────────────────────────────┤
│              │                                              │
│   SIDEBAR    │          MAIN CONTENT AREA                   │
│              │                                              │
│  • Dialpad   │  ┌────────────────────────────────────────┐  │
│  • History   │  │                                         │  │
│  • Contacts  │  │    Active Calls Panel                   │  │
│  • Numbers   │  │    (shows any ongoing calls)            │  │
│  • Settings  │  │                                         │  │
│              │  └────────────────────────────────────────┘  │
│              │                                              │
│              │  ┌────────────────────────────────────────┐  │
│              │  │    Dialpad / History / etc.             │  │
│              │  │    (based on sidebar selection)         │  │
│              │  │                                         │  │
│              │  └────────────────────────────────────────┘  │
└──────────────┴─────────────────────────────────────────────┘
```

### 3. Dialpad View

- Large, clean dialpad with number buttons
- **"From:" dropdown at the top** listing every connected number with its label and account
  - Example entries:
    - `📞 (513) 493-0303 — Premier Trucking Main`
    - `📞 (555) 123-4567 — Premier Sales`
    - `📞 (555) 987-6543 — Account 2 Support`
- Phone number input field with formatting
- "Call" button
- Recent outbound calls list below

### 4. Incoming Call Handling

- When a call arrives on ANY of the connected accounts:
  - A prominent incoming call modal appears
  - Shows caller number, caller name (from contacts if available), the dialed business number, and which account
  - Plays a ringtone (different per account optional)
  - Three buttons: **Answer**, **Decline**, **Send to Voicemail**
- Multiple simultaneous incoming calls queue up and show as a stacked list

### 5. Active Call Panel

When on a call, show:
- Caller info (number, name, which business number they called)
- Call duration timer
- Controls: Mute, Hold, Keypad (DTMF), Transfer, Record, Hang up
- If there are other active calls, show them as switchable pills at the top

### 6. Call History

- Unified log across every connected account
- Filterable by: account, number, direction (in/out), date range
- Columns: Time, Direction, Caller/Callee, Business Number Used, Duration, Status
- Click any entry to call back

### 7. Settings

- Add/remove accounts
- Edit number labels
- Set default "From:" number
- Configure ringtones
- Manage microphone/speaker selection
- View connection status for each account

---

## RingCentral API Integration Details

### Required Permissions (per Developer App, for each account)

- `ReadAccounts` — fetch account info and phone numbers
- `ReadCallLog` — pull call history
- `CallControl` — manage active calls
- `VoipCalling` — WebRTC calling
- `ReadPresence` — see availability
- `EditExtensions` — (optional) for settings management

### Key APIs to Use

1. **OAuth 2.0**: `https://platform.ringcentral.com/restapi/oauth/authorize` and `/token`
2. **SIP Provisioning**: `POST /restapi/v1.0/client-info/sip-provision` (returns config for WebPhone)
3. **Extension Info**: `GET /restapi/v1.0/account/~/extension/~`
4. **Phone Numbers**: `GET /restapi/v1.0/account/~/phone-number`
5. **Call Log**: `GET /restapi/v1.0/account/~/call-log`
6. **Call Control** (for in-call actions): `POST /restapi/v1.0/account/~/telephony/sessions/{sessionId}/parties/{partyId}/...`

### WebPhone SDK Setup (Per Account)

```typescript
import { SDK } from '@ringcentral/sdk';
import WebPhone from '@ringcentral/web-phone';

// Per account — repeat 5 times
const sdk = new SDK({
  clientId: account.clientId,
  clientSecret: account.clientSecret, // via backend proxy only
  server: 'https://platform.ringcentral.com',
});

await sdk.platform().login({ /* OAuth tokens from backend */ });

const sipProvision = await sdk.platform().post(
  '/restapi/v1.0/client-info/sip-provision',
  { sipInfo: [{ transport: 'WSS' }] }
).then(r => r.json());

const webPhone = new WebPhone(sipProvision, {
  appKey: account.clientId,
  appName: 'Easy Call',
  appVersion: '1.0.0',
});

webPhone.userAgent.on('invite', (session) => {
  // Incoming call — surface to UI
});
```

Each of the 5 WebPhone instances lives in memory simultaneously and listens for incoming calls independently.

---

## Database Schema

```prisma
model Account {
  id            String   @id @default(cuid())
  name          String   // "Premier Trucking"
  clientId      String
  clientSecret  String   // encrypted
  accessToken   String?  // encrypted
  refreshToken  String?  // encrypted
  tokenExpiry   DateTime?
  status        String   // "connected", "disconnected", "error"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  phoneNumbers  PhoneNumber[]
  callLogs      CallLog[]
}

model PhoneNumber {
  id            String   @id @default(cuid())
  accountId     String
  account       Account  @relation(fields: [accountId], references: [id])
  number        String   // "+15134930303"
  label         String   // "Main Line"
  extensionId   String?
  isDefault     Boolean  @default(false)
}

model CallLog {
  id            String   @id @default(cuid())
  accountId     String
  account       Account  @relation(fields: [accountId], references: [id])
  direction     String   // "inbound" | "outbound"
  fromNumber    String
  toNumber      String
  businessNumberUsed String
  duration      Int      // seconds
  status        String   // "completed", "missed", "voicemail"
  startedAt     DateTime
  recording     String?  // URL if available
}

model AppUser {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
}
```

---

## Security Considerations

1. **Client Secrets never touch the frontend** — all OAuth token exchanges happen server-side
2. **Tokens encrypted at rest** using AES-256-GCM with a key from env var
3. **App-level login required** (single user for now, but extensible) — protects the dashboard
4. **HTTPS only** — Railway provides this by default
5. **CORS locked down** to the Railway domain
6. **Session timeout** after 24 hours of inactivity
7. **Rate limiting** on all API endpoints
8. **No logging of sensitive data** (tokens, call content)

---

## Environment Variables

```
# Backend
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=<32-byte hex>
JWT_SECRET=<random string>
APP_USER_EMAIL=<your email>
APP_USER_PASSWORD_HASH=<bcrypt hash>
NODE_ENV=production
PORT=3000

# Frontend (Vite)
VITE_API_BASE_URL=/api
```

RingCentral Client IDs and Secrets are entered by the user via the UI and stored in the database — NOT as env vars.

---

## Step-by-Step Build Plan

### Phase 1: Foundation (Day 1–2)
1. Initialize repo with frontend (Vite + React + TS + Tailwind) and backend (Node + TS + Express)
2. Set up monorepo or sibling folders
3. Configure Prisma with PostgreSQL
4. Build basic app-level login (email + password)
5. Deploy empty skeleton to Railway to verify the pipeline

### Phase 2: Account Management (Day 3–4)
6. Build "Add Account" flow with OAuth redirect
7. Implement OAuth callback handler
8. Encrypt and store tokens
9. Build token refresh background job
10. Build account list UI with connection status

### Phase 3: Phone Numbers & Labeling (Day 5)
11. Fetch phone numbers from each connected account
12. Build number labeling UI
13. Store labels in database

### Phase 4: WebPhone Integration (Day 6–8)
14. Integrate @ringcentral/web-phone SDK
15. Instantiate 5 WebPhone instances in parallel
16. Handle SIP provisioning per account
17. Build incoming call detection and UI modal
18. Build outbound call flow with "From" selection

### Phase 5: Call Controls (Day 9–10)
19. Active call panel with all controls (mute, hold, DTMF, transfer, hang up)
20. Multi-call switching
21. Ringtones per account (optional)

### Phase 6: Call History (Day 11)
22. Sync call logs from all accounts
23. Build history UI with filters
24. Click-to-call from history

### Phase 7: Polish & Deploy (Day 12–14)
25. Full styling pass — clean modern design
26. Error handling and reconnect logic
27. Loading states
28. Responsive tweaks
29. Final deployment to Railway
30. Test end-to-end with real accounts

---

## Deliverables

1. A GitHub-ready monorepo or two-folder project
2. Full source code for frontend and backend
3. `README.md` with local dev setup instructions
4. `DEPLOYMENT.md` with Railway deployment steps
5. `.env.example` files for both frontend and backend
6. Prisma schema and migration files
7. A brief user guide for setting up the 5 RingCentral developer apps

---

## Success Criteria

The app is considered complete when:
- [ ] User can log in to the dashboard
- [ ] User can add every RingCentral account they own via OAuth (no hard limit)
- [ ] Every phone number is labeled and visible
- [ ] Every added account shows as "Connected" simultaneously
- [ ] An incoming call on any connected number triggers the UI notification with correct labeling
- [ ] User can answer and talk through the browser with clear audio
- [ ] User can make an outbound call from any connected number via the "From:" dropdown
- [ ] User can be on a call from Account 1 and receive a call from Account 3 simultaneously (call waiting works)
- [ ] Call history shows entries from all accounts
- [ ] App auto-refreshes OAuth tokens without user intervention
- [ ] App auto-reconnects WebRTC sessions on network blips
- [ ] Deployed and running on Railway with HTTPS

---

## Notes & Constraints

- **Browser**: Chrome recommended; Firefox works too
- **Microphone permission**: Will prompt on first call — handle gracefully
- **Sandbox testing**: Start in RingCentral Sandbox, then switch to Production
- **Production app approval**: Each of the 5 RingCentral developer apps must go through RingCentral's graduation process before they can be used in production. Sandbox is instant.
- **15-number limit is soft**: Architecture should scale to 10+ accounts and 50+ numbers without refactoring

---

## Questions to Clarify Before Building (for Claude Code)

Before starting the build, confirm:

1. Should the app support **SMS** too, or voice calls only? *(voice only for MVP)*
2. Should call recording be toggled per-account or globally? *(globally, user-controlled)*
3. Is there a need for **multiple users** on the dashboard, or is it single-user? *(single user for MVP)*
4. Any specific branding/colors for the UI? *(clean, professional, RingCentral-adjacent but not identical)*

---

## Reference Documentation

- RingCentral WebRTC Guide: https://developers.ringcentral.com/guide/voice/webrtc
- WebPhone SDK: https://github.com/ringcentral/ringcentral-web-phone
- Call Control API: https://developers.ringcentral.com/guide/voice/call-control
- RingCentral JS SDK: https://github.com/ringcentral/ringcentral-js
- OAuth Guide: https://developers.ringcentral.com/guide/authentication/auth-code-flow

---

**Build this as a clean, production-quality application. Prioritize reliability of the call functionality above all else — a softphone that drops calls is worse than no softphone.**
