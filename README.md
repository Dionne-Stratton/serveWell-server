# ServeWell Server

Cloudflare Worker API for ServeWell: multi-organization volunteer intake, form configuration in D1, and organization-scoped admin access.

For product direction and request/response shapes, see the sibling docs in the parent repo:

- [API Contract](../docs/API-Contract.md)
- [Implementation plan](../docs/Implementation-Plan.md)
- [Progress checklist](../docs/Implementation-Progress-Checklist.md)

## Stack

- Cloudflare Workers
- Cloudflare D1 (SQL)
- TypeScript
- JWT admin auth
- REST JSON API

## Requirements

- Node.js **22+**
- npm

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy local secrets and CORS origin:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

   Set `JWT_SECRET` to a long random string for local use. `FRONTEND_ORIGIN` should match your Vite dev server (default `http://localhost:5173`).

3. **First-time only:** create a D1 database and set `database_id` in `wrangler.toml`:

   ```sh
   npx wrangler d1 create servewell-db
   ```

4. Apply migrations to **local** D1 (creates schema + demo org, form, serving areas, admin user):

   ```sh
   npm run d1:migrations:apply:local
   ```

5. Start the Worker:

   ```sh
   npm run dev
   ```

   Wrangler’s default local URL is `http://127.0.0.1:8787`. If you use another port, substitute it in the examples below.

## Database migrations

| Script | Command |
|--------|---------|
| List migration status | `npm run d1:migrations:list` |
| Apply locally | `npm run d1:migrations:apply:local` |
| Apply to remote | `npm run d1:migrations:apply:remote` |

Migrations live in `migrations/`:

- `0001_saas_schema.sql` — organizations, forms, scoped serving areas/submissions
- `0002_seed_demo_organization_and_form.sql` — org `demo`, form `general-serving`, demo admin
- `0003_seed_demo_serving_areas.sql` — demo serving areas and requirements
- `0004_seed_demo_sample_submissions.sql` — demo dashboard sample rows

**Remote D1:** `d1:migrations:apply:remote` changes production data. Run it only when you intend to update the deployed database.

## Demo seed (local testing)

After migrations, the demo organization is available:

| Item | Value |
|------|--------|
| Organization slug | `demo` |
| Default form slug | `general-serving` |
| Admin email | `church@example.com` |
| Admin password | `temporary-password` (see `.dev.vars.example`) |

## API routes

### Health and meta

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | Service health |
| `GET` | `/api` | API name/version |

### Public (organization-scoped)

All public volunteer data and submissions are scoped by **organization slug** (and optionally **form slug**). The server resolves org/form from the URL; clients must not send trusted `organizationId` for authorization.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/organizations/:organizationSlug/volunteer-form` | Default active form + serving areas + requirements |
| `GET` | `/api/organizations/:organizationSlug/forms/:formSlug` | Specific form payload |
| `POST` | `/api/organizations/:organizationSlug/forms/:formSlug/submissions` | Create submission for that form |
| `POST` | `/api/organizations/:organizationSlug/volunteer-submissions` | Create submission on org default form |

Legacy global routes (`GET /api/serving-areas`, `POST /api/volunteer-submissions`) are **removed**. Use the organization routes above (e.g. slug `demo`).

### Admin (JWT: `Authorization: Bearer <token>`)

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/admin/login` | Returns `token`, `admin`, `organization` |
| `GET` | `/api/admin/me` | Current admin + organization |
| `GET` | `/api/admin/submissions` | List for authenticated admin’s org; query: `formId`, `status`, `archived`, `servingAreaId`, `search` |
| `GET` | `/api/admin/submissions/:id` | Detail; must belong to admin’s org |
| `PATCH` | `/api/admin/submissions/:id` | Update admin fields (e.g. status, archive) |
| `DELETE` | `/api/admin/submissions/:id` | Delete submission in org (demo/test cleanup) |
| `POST` | `/api/admin/submissions/:id/notes` | Add staff-only note to a submission |
| `DELETE` | `/api/admin/notes/:noteId` | Delete a note in the authenticated admin’s org |

Login and `/api/admin/me` include `organizationId` on the admin object and a public `organization` object (`slug`, `name`, etc.).

### Church signup (public)

Creates an **organization profile** and the **first admin user**. Does **not** create a volunteer form yet (that comes in a later step).

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/auth/register` | Returns `201` with `token`, `admin`, `organization` (same shape as login) |

Request body (JSON):

| Field | Required | Notes |
|-------|----------|--------|
| `organizationName` | yes | Display name |
| `organizationSlug` | yes | URL slug: lowercase letters, numbers, hyphens (not `demo`, etc.) |
| `organizationType` | no | `church` (default), `ministry`, or `other` |
| `contactEmail` | no | Defaults to `adminEmail` if omitted |
| `websiteUrl` | no | `http` or `https` |
| `adminEmail` | yes | Staff login email (unique across the app) |
| `adminPassword` | yes | At least 8 characters |
| `adminDisplayName` | yes | Shown in admin UI |

### Placeholders (not implemented)

| Method | Path |
|--------|------|
| `POST` | `/api/auth/login` → use `/api/admin/login` instead |
| `GET` / `POST` | `/api/volunteers` → `501 NOT_IMPLEMENTED` |

Use `/api/admin/login` for dashboard auth.

## Local smoke tests

Assume the API is at `http://127.0.0.1:8787`. Adjust the host/port if needed.

Load the demo volunteer form (default form):

```sh
curl -s "http://127.0.0.1:8787/api/organizations/demo/volunteer-form"
```

Register a new church (organization + admin only; no volunteer form yet):

```sh
curl -s -X POST "http://127.0.0.1:8787/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Kairos Community Church",
    "organizationSlug": "kairos-community",
    "organizationType": "church",
    "contactEmail": "office@example.com",
    "websiteUrl": "https://example.com",
    "adminEmail": "admin@example.com",
    "adminPassword": "secure-password-here",
    "adminDisplayName": "Church Admin"
  }'
```

Use the returned `data.token` with `GET /api/admin/me`, or sign in via `POST /api/admin/login` with the same email and password.

Admin login:

```sh
curl -s -X POST "http://127.0.0.1:8787/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"church@example.com","password":"temporary-password"}'
```

Save the `data.token` from the response, then list submissions:

```sh
curl -s "http://127.0.0.1:8787/api/admin/submissions" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Create a volunteer submission on the demo default form (`servingAreaId` 4 = Slides in seed data):

```sh
curl -s -X POST "http://127.0.0.1:8787/api/organizations/demo/volunteer-submissions" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Dionne",
    "lastName": "Stratton",
    "email": "example@email.com",
    "phone": "555-555-5555",
    "preferredContactMethod": "text",
    "overallFrequency": "every_week",
    "availability": ["sunday_morning"],
    "openToSpecialEvents": true,
    "experienceNotes": "I have experience with slides and media.",
    "additionalNotes": "I prefer not to miss more than one Sunday service per month.",
    "interests": [
      {
        "servingAreaId": 4,
        "usesAreaSpecificFrequency": false,
        "areaSpecificFrequency": null,
        "experienceLevel": "experienced",
        "interestNotes": "I can run slides most Sundays."
      }
    ],
    "requirementConfirmations": []
  }'
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Worker (`wrangler dev`) |
| `npm run deploy` | Deploy Worker to Cloudflare |
| `npm run typecheck` | `tsc --noEmit` |

## Deploy

1. Ensure remote D1 migrations are applied when the schema or seeds change: `npm run d1:migrations:apply:remote`
2. Deploy the Worker: `npm run deploy`
3. Point the frontend `VITE_API_URL` at the deployed Worker URL and deploy the frontend when you are ready for a coordinated release.

Pushing this repo to `main` does not by itself update the live Worker or remote D1.
