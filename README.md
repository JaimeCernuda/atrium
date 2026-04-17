# Atrium

A modern self-hosted virtual office. Rooms for presence, one-click meetings via
Jitsi, pluggable Google + Microsoft auth, first-class theming. Successor to the
abandoned bigodines/matrix project, rebuilt on Node 20 / React 18 / Vite /
TypeScript.

Gnosis Research Center (Illinois Tech) is the first consumer; other teams can
deploy the same codebase with their own branding and room list.

## Features

- **Rooms + presence** — see who's in which room, grouped as a floorplan
  (entry / bullpen / offices / meetings / status).
- **One-click meetings** — each room opens a persistent Jitsi URL in a new tab.
- **Office ownership + locking** — users auto-join their own office on login;
  locked offices accept knocks but not walk-ins.
- **Knock + ping** — doorbell to alert everyone in a room, or ping a specific
  person. Both fire browser notifications with sound and vibration.
- **Global chat + DMs** — Slack-lite global channel and 1:1 threads with a
  user search for discovering teammates not in any room.
- **Admin CRUD UI** — add/rename/color rooms without editing JSON.
- **Usage metrics** — total room time and meeting time per user, daily
  activity. Admin-only endpoints and a minimal dashboard.
- **Profiles** — upload a custom avatar (cropper with drag-to-pan and
  pinch-to-zoom), edit display name. Updates broadcast live.
- **Themes + preferences** — light/dark/system, three levels of sound
  (general / global chat / off), notifications permission handled in-app.
- **Installable PWA** — install from the browser address bar on
  desktop/Android, Add to Home Screen on iOS.

## Stack

- **Backend:** Fastify + socket.io + Prisma + Postgres
- **Frontend:** Vite + React 18 + MUI v6 + Zustand
- **Shared:** TypeScript types via pnpm workspace package
- **Runtime:** Node 20 in Docker

## Quick start

```bash
git clone https://github.com/JaimeCernuda/atrium.git
cd atrium
cp .env.example .env
# edit .env — see INSTALL.md for the full walkthrough
docker compose up -d --build
```

For Jitsi:

```bash
./scripts/init-jitsi.sh
docker compose --profile jitsi up -d
```

Full setup (Google OAuth, Microsoft/Entra, Jitsi, DNS, port forwards, common
issues): see **[INSTALL.md](./INSTALL.md)**.

## Project layout

```
.
├── apps/
│   ├── server/        Fastify API + socket.io, Prisma schema, migrations
│   └── web/           Vite React SPA
├── packages/
│   └── shared/        TS types shared between client + server
├── config/
│   └── rooms.json     First-boot seed data
├── scripts/
│   └── init-jitsi.sh  Bootstrap Jitsi shared secrets + config dirs
├── docker-compose.yml Core services + optional Jitsi profile
├── Dockerfile         Multi-stage build (Node 20 Alpine)
└── INSTALL.md         Full deployment walkthrough
```

## Development

```bash
pnpm install
pnpm dev              # starts server on :8090 and web on :5173 (proxies /api + /socket.io)
pnpm build            # typechecks + builds both apps
pnpm typecheck
```

Local dev uses a local Postgres — run it with:

```bash
docker compose up -d postgres
```

## License

MIT.
