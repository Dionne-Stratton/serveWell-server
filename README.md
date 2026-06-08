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

   Optional (Planning Center OAuth): set `PLANNING_CENTER_CLIENT_ID`, `PLANNING_CENTER_CLIENT_SECRET`, and `PLANNING_CENTER_REDIRECT_URI_LOCAL` (see `.dev.vars.example`). Without these, connect/disconnect routes return errors when invoked.

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

- `0001_schema.sql` — full ServeWell schema (organizations, forms, sections, submissions, Planning Center OAuth, admin invites, password reset, notification prefs, and related indexes)
- `0002_seed_demo_organization_and_form.sql` — org `demo`, form `general-serving`, demo **owner** admin
- `0003_seed_demo_serving_areas.sql` — demo form sections, serving areas, and requirements
- `0004_seed_demo_sample_submissions.sql` — demo dashboard sample rows
- `0005_volunteer_self_edit.sql` — `volunteer_self_updated_at` on submissions and `volunteer_submission_edit_tokens` for volunteer self-edit links
- `0006_volunteer_updated_notify_default.sql` — enable `notify_volunteer_updated` for existing admins (new signups default on in schema)
- `0007_volunteer_update_review.sql` — volunteer update review flag and reviewed metadata on submissions
- `0008_purge_orphan_admin_users.sql` — remove admin rows left behind after organization deletes

**Email (Resend):** set `RESEND_API_KEY` (and optionally `RESEND_FROM`) on the Worker. Without a key, local dev logs password-reset URLs to the console and skips other outbound mail.

**Founder signup alerts:** set `FOUNDER_NOTIFY_EMAIL` (and `RESEND_API_KEY`) to receive an email on every `POST /api/auth/register`. Failures are logged only; signup still succeeds.

**Remote D1:** `d1:migrations:apply:remote` changes production data. Run it only when you intend to update the deployed database.

### Fresh database

Use this after pulling a migration squash or whenever local D1 is out of sync with the repo.

**Local**

1. Stop `npm run dev` if it is running.
2. Delete the local D1 state (from `serveWell-server`):

   ```sh
   rm -rf .wrangler/state/v3/d1
   ```

   On Windows PowerShell: `Remove-Item -Recurse -Force .wrangler\state\v3\d1`

3. Apply migrations:

   ```sh
   npm run d1:migrations:apply:local
   ```

**Remote (empty / demo-only environments)**

Recreating the D1 database is simpler than clearing Wrangler’s migration history on an old DB:

1. `npx wrangler d1 delete servewell-db` (confirm when prompted).
2. `npx wrangler d1 create servewell-db` — copy the new `database_id` into `wrangler.toml` under `[[d1_databases]]`.
3. `npm run d1:migrations:apply:remote`
4. `npm run deploy`

Re-connect Planning Center OAuth for any org after a remote reset (tokens lived in the old database).

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

Public form payloads include **sections** (when present), serving areas, and requirements. Submissions require **email**; **phone** is optional unless preferred contact is text or phone (validated server-side).

Legacy global routes (`GET /api/serving-areas`, `POST /api/volunteer-submissions`) are **removed**. Use the organization routes above (e.g. slug `demo`).

### Admin (JWT: `Authorization: Bearer <token>`)

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/admin/login` | Body: `organizationSlug`, `email`, `password` → `token`, `admin`, `organization` |
| `GET` | `/api/admin/me` | Current admin + organization + `notificationPreferences` |
| `PATCH` | `/api/admin/me` | Body: `{ notificationPreferences: { newSubmissions?, readyToSchedule? } }` |
| `PATCH` | `/api/admin/organization` | **Owner only** — update org name, type, contact email, website (slug not editable); demo blocked |
| `DELETE` | `/api/admin/organization` | **Owner only** — permanent org delete; body `{ confirmSlug }`; demo blocked; cascades all org data |
| `POST` | `/api/admin/request-password-reset` | Authenticated; emails reset link to signed-in admin |
| `GET` | `/api/admin/team` | Members + pending invites; `canManage` when role is `owner` |
| `POST` | `/api/admin/team/invites` | Owner only; invite admin by email (7-day token, Resend) |
| `DELETE` | `/api/admin/team/invites/:inviteId` | Owner only; revoke pending invite |
| `DELETE` | `/api/admin/team/members/:adminUserId` | Owner only; deactivate admin (not owner, not self) |
| `GET` | `/api/admin/submissions` | List for authenticated admin’s org; query: `formId`, `status`, `archived`, `servingAreaId`, `search` |
| `GET` | `/api/admin/submissions/:id` | Detail (`editedSinceLastPlanningCenterSync`, PC sync fields, `updatedBy`); must belong to admin’s org |
| `PATCH` | `/api/admin/submissions/:id` | Update workflow fields (`status`, `isArchived`); updates `updated_at` / `updated_by`, not `intake_updated_at` |
| `PUT` | `/api/admin/submissions/:id` | Replace volunteer intake fields (same body as public submit; sets `intake_updated_at`; not allowed for org `demo`) |
| `DELETE` | `/api/admin/submissions/:id` | Permanent delete in ServeWell only (not Planning Center) |
| `POST` | `/api/admin/submissions/:id/planning-center` | Push/sync to PC People; records `planning_center_synced_at` / `by` (does not change workflow status on re-sync) |
| `POST` | `/api/admin/submissions/:id/notes` | Add staff-only note to a submission |
| `DELETE` | `/api/admin/notes/:noteId` | Delete a note in the authenticated admin’s org |
| `GET` | `/api/admin/forms` | List volunteer forms for the admin’s org |
| `POST` | `/api/admin/forms` | Create form (template or blank); **not allowed** for org slug `demo` |
| `GET` | `/api/admin/forms/:formId` | Form detail (sections, areas, requirements) |
| `PATCH` | `/api/admin/forms/:formId` | Update form metadata (title, slug, intro, active flag, etc.); demo org read-only |
| `DELETE` | `/api/admin/forms/:formId` | Delete form (demo org read-only) |
| `POST` | `/api/admin/forms/:formId/sections` | Add section |
| `PATCH` | `/api/admin/form-sections/:sectionId` | Update section |
| `DELETE` | `/api/admin/form-sections/:sectionId` | Delete section |
| `POST` | `/api/admin/forms/:formId/serving-areas` | Add serving area |
| `PATCH` | `/api/admin/serving-areas/:servingAreaId` | Update serving area |
| `DELETE` | `/api/admin/serving-areas/:servingAreaId` | Delete serving area |
| `POST` | `/api/admin/serving-areas/:servingAreaId/requirements` | Add requirement / acknowledgement |
| `PATCH` | `/api/admin/requirements/:requirementId` | Update requirement |
| `DELETE` | `/api/admin/requirements/:requirementId` | Delete requirement |

Login and `/api/admin/me` include `organizationId` on the admin object and a public `organization` object (`slug`, `name`, etc.).

### Admin — Planning Center integration (JWT)

OAuth callback is a browser redirect (no JWT). Admin routes require `Authorization: Bearer <token>`.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/admin/integrations/planning-center` | Connection status for admin’s org (any admin) |
| `POST` | `/api/admin/integrations/planning-center/connect` | **Owner only** — returns `authorizationUrl` to start OAuth |
| `POST` | `/api/admin/integrations/planning-center/disconnect` | **Owner only** — revokes refresh token when possible, clears integration |
| `GET` | `/api/planning-center/callback` | OAuth redirect target; redirects to `FRONTEND_ORIGIN` with query params |

Requires migration `0006` and Planning Center app credentials in Worker secrets / `.dev.vars`.

On successful OAuth connect, the server ensures one People tab per volunteer form, named **SW: {form name}** (for example **SW: Volunteering**), each with the same custom fields (Overall Frequency, Frequency Limits, Availability, Special Events, Requirements, Serving areas, Last synced). Tab and field IDs are stored in `organization_integrations.settings_json` under `formTabs` (keyed by form id). New forms created while connected get a matching tab automatically. If setup fails, connect still completes and the admin redirect includes `fieldsSetup=error`.

### Church signup (public)

Creates an **organization profile**, the **first admin user**, and a **default volunteer form** (`general-serving`) with serving areas and requirements from the `church_volunteer_default` template (same baseline as the demo form).

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/auth/register` | Returns `201` with `token`, `admin`, `organization` (same shape as login) |
| `POST` | `/api/auth/forgot-password` | Body: `organizationSlug`, `email` (generic success message) |
| `POST` | `/api/auth/church-slug-hint` | Body: `email` — emails church name(s) and URL slug(s) for sign-in (generic success message) |
| `POST` | `/api/auth/reset-password` | Body: `token`, `newPassword` |
| `GET` | `/api/auth/accept-invite?token=` | Preview invite (org name, email) |
| `POST` | `/api/auth/accept-invite` | Body: `token`, `newPassword`, `confirmPassword` → login payload |

Request body (JSON):

| Field | Required | Notes |
|-------|----------|--------|
| `organizationName` | yes | Display name |
| `organizationSlug` | yes | URL slug: lowercase letters, numbers, hyphens (not `demo`, etc.) |
| `organizationType` | no | `church` (default), `ministry`, or `other` |
| `contactEmail` | no | Defaults to `adminEmail` if omitted |
| `websiteUrl` | no | `http` or `https` |
| `adminEmail` | yes | Staff login email (unique per organization; same email may exist in other orgs) |
| `adminPassword` | yes | At least 8 characters |
| `adminDisplayName` | yes | Shown in admin UI |

### Placeholders (not implemented)

| Method | Path |
|--------|------|
| `POST` | `/api/auth/login` → use `/api/admin/login` instead |
| `GET` / `POST` | `/api/volunteers` → `501 NOT_IMPLEMENTED` |

Use `/api/admin/login` for dashboard auth (`organizationSlug` + email + password).

## Local smoke tests

Assume the API is at `http://127.0.0.1:8787`. Adjust the host/port if needed.

Load the demo volunteer form (default form):

```sh
curl -s "http://127.0.0.1:8787/api/organizations/demo/volunteer-form"
```

Register a new church (organization, admin, and default volunteer form):

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

Use the returned `data.token` with `GET /api/admin/me`, or sign in via `POST /api/admin/login` with organization slug, email, and password.

Admin login:

```sh
curl -s -X POST "http://127.0.0.1:8787/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"organizationSlug":"demo","email":"church@example.com","password":"temporary-password"}'
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
