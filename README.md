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
- `POST /api/volunteer-submissions`
- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/admin/submissions`
- `GET /api/admin/submissions/:id`
- `POST /api/auth/login` placeholder
- `GET /api/volunteers` placeholder
- `POST /api/volunteers` placeholder

`GET /api/serving-areas`, `POST /api/volunteer-submissions`, and the admin auth routes are backed by D1. The other API routes are placeholders until their V1 phases are implemented.

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

Log in with the seeded demo admin:

```sh
curl -X POST http://localhost:8787/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"church@example.com","password":"temporary-password"}'
```

Create a volunteer submission:

```sh
curl -X POST http://localhost:8787/api/volunteer-submissions \
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
