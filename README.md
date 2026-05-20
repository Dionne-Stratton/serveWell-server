# ServeWell Server

Starter backend for the ServeWell church volunteer intake app.

## Stack

- Cloudflare Workers
- Cloudflare D1
- TypeScript
- JWT auth
- REST API

## Setup

Use Node.js 22 or newer. Current Wrangler releases require Node 22+.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy local environment values:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

3. Create a D1 database with Wrangler, then replace `database_id` in `wrangler.toml`:

   ```sh
   wrangler d1 create servewell-db
   ```

4. Start the local Worker:

   ```sh
   npm run dev
   ```

## Routes

- `GET /health`
- `GET /api`
- `POST /api/auth/login`
- `GET /api/volunteers`
- `POST /api/volunteers`

These are placeholders only. Business logic has not been implemented yet.
