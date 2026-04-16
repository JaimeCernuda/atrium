# Atrium

A modern self-hosted virtual office. Rooms for presence, one-click meetings via Jitsi, pluggable auth, first-class theming. Successor to the abandoned bigodines/matrix project, rebuilt on Node 20 / React 18 / Vite / TypeScript.

Gnosis Research Center (Illinois Tech) is the first consumer; other teams can deploy the same codebase with their own branding.

## Status

Early scaffolding — see `PLAN.md`.

## Stack

- **Backend:** Fastify + socket.io + Prisma + Postgres
- **Frontend:** Vite + React 18 + MUI v6 + Zustand
- **Shared:** TypeScript types via pnpm workspace package
- **Runtime:** Node 20 in Docker

## Dev

```bash
pnpm install
pnpm dev
```
