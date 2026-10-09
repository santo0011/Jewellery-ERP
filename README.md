# Jewellery ERP

Multi-tenant jewellery business management SaaS on the MERN stack. Architecture and roadmap: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

- Node.js 22+
- MongoDB running as a replica set (needed for transactions). For local development, the bundled script starts one for you.

## First-time setup

```bash
npm install
cp backend/.env.example backend/.env      # then set JWT_ACCESS_SECRET to a long random value
npm run dev:db                            # terminal 1: local MongoDB replica set (first run downloads MongoDB)
npm run seed                              # once: collections + default Super Admin
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Daily development

```bash
npm run dev        # MongoDB + API (http://localhost:5000) + web (http://localhost:5173)
```

Or run them separately with `npm run dev:db`, `npm run dev:api` and `npm run dev:web`.

Everyone signs in at `/login` (no role selection). The default Super Admin comes from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `backend/.env`; it is created by `npm run seed` and also on API start-up if no Super Admin exists. Signing in with it opens the Super Admin panel (`/admin`), where you create organisations and set each one's branch limit.

To start again from an empty database (development only), run `npm run db:reset`. It drops every collection and uploaded file, recreates the collections and indexes, and creates the default Super Admin.

Password-reset emails are printed in the API console until an email provider is configured.

## Tests

```bash
npm test           # shared unit tests + backend API, tenant-isolation and RBAC tests
```

Backend tests run against an in-memory MongoDB replica set, so they need no running database.

## Layout

```
packages/shared   permission registry, role templates, enums, unit maths, Zod schemas
backend           Express API: core (context, tenancy, audit) + domain modules
frontend          React + Vite + MUI app
docs              architecture and decisions
```
