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
- `GET /api/serving-areas`
- `POST /api/auth/login` placeholder
- `GET /api/volunteers` placeholder
- `POST /api/volunteers` placeholder

`GET /api/serving-areas` is backed by D1 seed data. The other API routes are placeholders until their V1 phases are implemented.

## Local D1

Apply migrations locally:

```sh
npm run d1:migrations:apply:local
```

Then start the Worker:

```sh
npm run dev
```

Test the first real public endpoint:

```sh
curl http://localhost:8787/api/serving-areas
```
