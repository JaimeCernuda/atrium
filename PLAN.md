# Atrium Plan

## Phase 0 — Setup ✅
- Monorepo scaffold (pnpm workspaces, TypeScript, Vite, Fastify)
- `apps/server` + `apps/web` + `packages/shared`
- CI: lint + typecheck

## Phase 1 — Feature parity with bigodines/matrix
- Room list rendered from config
- Presence via socket.io (user X is in room Y)
- "Enter meeting" opens external meeting URL
- Google OAuth
- Per-room colors (already a patch in the old app)
- Config file for rooms (JSON) so we can migrate current Gnosis setup directly
- Build + test locally; when ready, swap the Cloudflare Tunnel route from the old bigodines/matrix container to this one. Same public URL (`gnosis.jcernuda.com`), same Google OAuth app — zero reconfiguration for existing users.

## Phase 2 — Persistence + theming framework
- Postgres schema: users, rooms, sessions, messages
- Branding config: `BRAND_NAME`, logo URL, color palette, custom CSS hook
- Gnosis theme as the first consumer

## Phase 3 — Auth expansion
- OIDC-based pluggable auth
- Providers: Google, Microsoft/Entra, magic-link email
- Domain whitelist per provider

## Phase 4 — Admin UI
- Web page for CRUD on rooms (no more JSON editing)
- Role: `admin` flag on users

## Phase 5 — Social features
- Profile picture upload
- Global chat (one room, Slack-lite)
- Direct messages between users
- "Ping to talk" — notification with one-click "join me in [room]"

## Phase 6 — Layout/UX polish
- Section headers by room category/color
- Responsive mobile layout
- Loading, empty, error states
- Subtle animations
