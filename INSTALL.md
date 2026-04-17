# Atrium — Install guide

This walks through a fresh deploy for a small research group. Assumes a Linux
host with Docker + Docker Compose, and a domain you control. If you're reading
this from the Gnosis deploy, the concrete values (URLs, branding) are filled
in; the structure is otherwise identical.

> **Scope.** This guide sets up:
> 1. Atrium itself (web app + Postgres)
> 2. Google OAuth login
> 3. Microsoft / Entra OAuth login (optional, useful if some users are locked out of Google)
> 4. Self-hosted Jitsi for meetings (optional; falls back to external per-room URLs)
> 5. Reverse proxy / Cloudflare Tunnel routing

---

## 1. Prerequisites

- Linux host with Docker 24+ and Docker Compose v2 (`docker compose`, not `docker-compose`).
- A domain you control, managed by Cloudflare (or any reverse proxy that terminates TLS).
- If you want self-hosted Jitsi: the ability to port-forward UDP 10000 on your router.

**Clone + install script:**

```bash
git clone https://github.com/JaimeCernuda/atrium.git
cd atrium
cp .env.example .env
# then edit .env following the sections below
```

The `config/rooms.json` file bundled in the repo is what the seeder uses on
first startup. You can edit it before first boot, or leave it alone and use the
Admin UI later.

---

## 2. Core configuration (`.env`)

Open `.env` and fill these required values:

```dotenv
PUBLIC_URL=https://gnosis.example.com
ATRIUM_PORT=8070               # host port your tunnel/proxy forwards to
TZ=America/Chicago

ADMIN_EMAILS=["you@example.com"]
WHITELIST_DOMAINS=["@yourorg.edu"]

# Generate with: openssl rand -hex 32
SESSION_SECRET=<64 hex chars>
```

Then pick one or both OAuth providers (below). You need **at least one** for
anyone to log in.

---

## 3. Google OAuth (recommended)

Most orgs use Google. Also works for personal Gmail.

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2. Create a project if you don't have one.
3. Configure the **OAuth consent screen** first (left sidebar):
   - User type: **External**
   - App name: _Gnosis_ (or whatever)
   - User support + developer emails: yours
   - Scopes: click "Save and continue" through with defaults (email, profile)
   - Test users: optional; skip if you plan to **Publish** the app
4. Back in **Credentials**, click **+ Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: anything
   - **Authorized redirect URIs**: `https://gnosis.example.com/auth/google/callback`  
     (exactly matches `PUBLIC_URL` + `/auth/google/callback`)
5. Click **Create**. Copy the **Client ID** and **Client secret**.
6. In `.env`:
   ```dotenv
   GOOGLE_CLIENT_ID=<client id>
   GOOGLE_CLIENT_SECRET=<secret>
   GOOGLE_CALLBACK_URL=https://gnosis.example.com/auth/google/callback
   ```

### Publishing (optional, recommended for >5 users)

While the app is in **Testing**, only manually-added Test users can sign in,
capped at 100. For larger teams click **Publish App** on the consent screen —
users see a one-time "unverified app" warning they click through, then the
`WHITELIST_DOMAINS` setting does the actual access control.

### Illinois Tech & similar Google Workspace domains

Students on `@hawk.illinoistech.edu` log in normally (it's Google Workspace).
Staff on `@illinoistech.edu` are on Microsoft 365 — they either need to:

- Register their work email as a **personal Google account** at
  [accounts.google.com/signup → "Use your existing email"](https://accounts.google.com/signup)
  (2 minutes, one-time), **or**
- Sign in with Microsoft instead — see next section.

If your staff are also blocked on the Workspace side by the university admin
(you'll see "couldn't sign you in, contact your administrator"), either pursue
option 1 above, or add Microsoft OAuth (next section).

---

## 4. Microsoft / Entra OAuth (optional)

Useful if your org uses Microsoft 365 and Google OAuth is blocked/unavailable.

1. Open [entra.microsoft.com](https://entra.microsoft.com) and sign in.  
   If it says you have no tenant, go to [portal.azure.com](https://portal.azure.com)
   → Microsoft Entra ID → Create a tenant (free, no subscription required).
2. In Entra admin: **Applications → App registrations → + New registration**.
3. Name: _Gnosis_ (or whatever).
4. **Supported account types**: pick based on who should log in:
   - **Multiple Microsoft Entra ID tenants** — requires allowlisting specific tenants. Most restrictive.
   - **Any Microsoft Entra ID tenant + personal Microsoft accounts** — loosest, any work or personal.
   - **Single tenant only** — only your tenant.
5. **Redirect URI**: platform `Web`, URL `https://gnosis.example.com/auth/microsoft/callback`.
6. Click **Register**. On the app's Overview page, copy **Application (client) ID**.
7. Sidebar: **Certificates & secrets → + New client secret**. Pick 24 months.
   Copy the **Value** immediately (shown once). Don't confuse it with "Secret ID".
8. Fill `.env`:
   ```dotenv
   MICROSOFT_CLIENT_ID=<application (client) id>
   MICROSOFT_CLIENT_SECRET=<secret value>
   MICROSOFT_CALLBACK_URL=https://gnosis.example.com/auth/microsoft/callback
   MICROSOFT_TENANT=common          # or "organizations" / tenant GUID
   ```

> **Heads up — multitenant consent wall.** If you registered as multitenant
> and your publisher isn't verified, users from *other* tenants may need their
> Entra admin to approve the app before they can log in. This is a Microsoft
> policy; it doesn't affect your own tenant.
>
> You can look up another org's tenant ID with:
> ```bash
> curl -s https://login.microsoftonline.com/<domain>/.well-known/openid-configuration \
>   | jq -r .issuer
> ```

---

## 5. Branding

```dotenv
BRAND_NAME=Your Research Group
BRAND_SHORT_NAME=YRG
BRAND_LOGO_URL=/brand/your-logo.png
BRAND_ACCENT_COLOR=#7b1fa2
```

Drop custom logos/banners into `apps/web/public/brand/` before building the
image, or serve them from a public URL and set `BRAND_LOGO_URL` to that URL.

---

## 6. Deploy (Atrium only)

```bash
docker compose up -d --build
```

Verify:

```bash
curl http://localhost:8070/healthz                 # {"ok":true}
curl http://localhost:8070/api/auth/providers      # {"google":true,"microsoft":true}
```

Point your reverse proxy / Cloudflare Tunnel at `localhost:${ATRIUM_PORT}`
(default 8070) for the `PUBLIC_URL` hostname. For Cloudflare Zero Trust:

- Tunnel → Public Hostname → Add
- Subdomain: e.g. `gnosis`, Domain: your domain
- Service type: **HTTP**, URL: `localhost:8070`

That's it. Log in with your admin email and you'll see **Rooms** + **Metrics**
in the header.

---

## 7. Self-hosted Jitsi (optional)

Skip this section if you'll set each room's meeting URL to a Zoom / Google
Meet / external Jitsi URL via the Admin Rooms page.

### 7a. Prereqs

- Decide on a subdomain (e.g. `meet.example.com`).
- **Router port-forward: UDP port 10000 → the host running Atrium.**
  This is the media port; Cloudflare Tunnel cannot proxy it. Without this,
  meetings appear to connect but carry no audio/video.
- Your ISP must assign you a real public IPv4 (no CGNAT). Find it with
  `curl -4 ifconfig.co`.

### 7b. Generate shared secrets

```bash
./scripts/init-jitsi.sh
```

This appends six shared-secret variables to `.env` and creates the `jitsi-cfg/`
directory tree. Idempotent — safe to re-run (it no-ops if already done).

### 7c. Jitsi-specific .env values

```dotenv
JITSI_PUBLIC_URL=https://meet.example.com
JVB_ADVERTISE_IPS=<your public IPv4>       # from `curl -4 ifconfig.co`
JITSI_HTTP_PORT=8075
JVB_PORT=10000
JICOFO_MAX_MEMORY=512m
VIDEOBRIDGE_MAX_MEMORY=768m
```

### 7d. Start Jitsi

```bash
docker compose --profile jitsi up -d
```

This starts four extra containers: `jitsi-web`, `jitsi-prosody`, `jitsi-jicofo`, `jitsi-jvb`.

### 7e. Route meet.example.com → localhost:8075

Same as step 6, add a second Cloudflare Tunnel hostname:
- Subdomain: `meet`, Domain: yours
- Service type: **HTTP**, URL: `localhost:8075`

### 7f. Point rooms at your Jitsi

In the Atrium Admin → Rooms UI, set each room's **External meeting URL** to
`https://meet.example.com/gnosis-<room-slug>-<random>`. Or run this SQL once
to auto-generate URLs for all rooms:

```sql
UPDATE "Room"
SET "externalMeetUrl" =
  'https://meet.example.com/gnosis-' ||
  regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') ||
  '-' || substr(md5(random()::text), 1, 8)
WHERE "externalMeetUrl" IS NULL AND NOT "disableMeeting";
```

### 7g. Verify end-to-end

Open two browser windows, log in as two users, join the same room, click
"Enter meeting". You should see each other on camera within a few seconds. If
you see "Connection error" immediately, the UDP port forward is the usual
culprit.

---

## 8. Upgrading

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on container start via
`prisma migrate deploy`.

---

## 9. Common issues

**"Couldn't sign you in — contact your administrator" (Google/Microsoft)**  
The user's org has blocked external OAuth apps. Options:
- Have the org admin allowlist this OAuth client, or
- Have the user sign in with a personal account on a whitelisted domain, or
- Have the user register their org email as a personal Google identity.

**Logo / images don't load, login page looks broken**  
Usually browser cache — hard-refresh (Ctrl+Shift+R) or try incognito. If it
still fails, check that `apps/web/public/brand/` was copied into the built
image (`docker exec atrium ls /app/web/brand/`).

**Meeting button opens Jitsi but immediately disconnects**  
UDP 10000 not open / not forwarded to the host. Confirm with:
```bash
nc -zvu your-public-ip 10000   # should succeed from outside
```

**Auto-join to office isn't happening**  
The office's `ownerEmail` in the DB must match the user's login email exactly.
Check with:
```bash
docker exec atrium-postgres psql -U atrium -d atrium \
  -c 'SELECT name, "ownerEmail" FROM "Room" WHERE "ownerEmail" IS NOT NULL;'
```

**Everything compiled but the page is blank white**  
JavaScript error in the SPA. Open DevTools → Console. Most common cause is
stale cached JS after a deploy; hard-refresh fixes it.
