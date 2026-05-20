Implementation Plan
Purpose
This document defines the recommended build order for the ServeWell V1 prototype.
ServeWell V1 is a demo/usable prototype for volunteer intake. It should prove whether a simple public form and protected admin dashboard can help the church collect, organize, and follow up with people who want to serve.
The goal is to build the smallest useful version first, without overbuilding scheduling, Planning Center integration, or full form-editing tools.
V1 Definition
V1 should include:
Public volunteer intake form
Login-protected admin area
Submission storage
Serving area selection
Basic role requirement display/confirmation
Overall serving frequency
Optional area-specific frequency limits
Special events checkbox
Admin submission list
Admin submission detail view
Admin status updates
Archive/delete for testing and cleanup
V1 should not include yet:
Editable serving areas
Planning Center integration
Full scheduling engine
Volunteer accounts
Multiple admin roles
Automated scheduling
Background check integration
Church-owned deployment transfer
Recommended Architecture
Frontend:
React + Vite
Backend:
Cloudflare Workers
Database:
Cloudflare D1 / SQL
Auth:
JWT-based admin login
One seeded/shared admin account for V1
Hosting:
Cloudflare Pages for frontend
Cloudflare Workers for API
Folder Structure Assumption
Current local structure:
/church-name-folder
/serve-well-front-end
/serve-well-server

This plan assumes separate frontend and backend folders.
Phase 1: Project Setup

1. Create Frontend App
   Use Vite React.
   npm create vite@latest serve-well-front-end -- --template react

Then:
cd serve-well-front-end
npm install
npm run dev

Install routing:
npm install react-router-dom

Optional later:
npm install lucide-react

2. Create Backend App
   Use Wrangler/Cloudflare Workers.
   A simple Workers project is enough for V1.
   Recommended later command can be decided when creating the server folder, but the backend should support:
   API routes
   D1 binding
   JWT auth
   CORS for local frontend dev
3. Create Git Repositories
   Options:
   One repo containing both frontend and server folders
   Separate repos for frontend and server
   Recommended for simplicity:
   One repo for the full ServeWell prototype.
   Phase 2: Frontend Shell
   Create the basic frontend route structure before building the full form.
   Routes:
   / Staff landing page
   /serve Public volunteer form
   /admin/login Admin login
   /admin Admin dashboard
   /admin/submissions/:id Submission detail

Future routes:
/admin/serving-areas
/admin/settings

Initial Pages
Create placeholder pages:
HomePage
ServePage
AdminLoginPage
AdminDashboardPage
AdminSubmissionDetailPage
Home Page
Purpose:
Simple staff-facing landing page.
Suggested buttons/cards:
Open volunteer form
Admin login / dashboard
Note:
The Wix site would eventually embed or link directly to /serve, not necessarily the homepage.
Phase 3: Database Schema
Create D1 migrations for V1 tables.
Recommended V1 tables:
admin_users
serving_areas
serving_area_requirements
volunteer_submissions
volunteer_interests
volunteer_availability
volunteer_requirement_confirmations
Optional V1:
admin_notes
Migration Order
Admin users
Serving areas
Serving area requirements
Volunteer submissions
Volunteer interests
Volunteer availability
Volunteer requirement confirmations
Admin notes, if included
Phase 4: Seed Data
Create seed data for:
One admin user
Initial serving areas
Initial serving area requirements
Seed Admin User
For demo:
email: church email
password: temporary password
Important:
Store only password hash in the database, never plain text.
Seed Serving Areas
Initial seed examples:
Worship Team / Singer
Bass Player
Other Instrumentalist
Slides
Sound
Camera / Livestream
Kids Ministry
Youth Ministry
Greeting / Hospitality
Setup / Cleanup
Events / Special Events
Prayer / Ministry Team
Seed Requirements
Examples:
Youth Ministry:
Wednesday night availability
Background check required
Kids Ministry:
Background check required
Training may be required
Worship Team / Singer:
Rehearsal availability may be required
Audition/interview may be required
Camera / Livestream:
Sunday morning availability
Training may be required
Slides:
Flexible media/tech role
Training may be required
Phase 5: Public API
Build public endpoints first.

1. GET /api/serving-areas
   Purpose:
   Return active serving areas and their requirements for the public form.
   Frontend dependency:
   The public form needs this before it can render dynamic serving options.
2. POST /api/volunteer-submissions
   Purpose:
   Save a volunteer form submission.
   Should create rows in:
   volunteer_submissions
   volunteer_interests
   volunteer_availability
   volunteer_requirement_confirmations
   Validation:
   First name required
   Last name required
   Email or phone required
   Preferred contact method required
   Overall frequency required
   At least one serving area required
   Required confirmations must be checked
   If required availability is missing, return clear validation error
   Phase 6: Public Form UI
   Build the /serve page using the API contract.
   Form Sections
   Welcome / intro
   Contact information
   Preferred contact method
   Overall serving frequency
   General availability
   Serving area selection
   Conditional requirement notes/confirmations
   Optional area-specific frequency limits
   Special events checkbox
   Experience notes
   Additional notes
   Submit button
   Success message/modal/state
   UX Rules
   Keep the form calm and uncluttered.
   Show details only when relevant.
   Do not show choir/rehearsal/youth/kids details unless those serving areas are selected.
   Use clear helper text for special events.
   Use clear validation messages.
   Suggested Success Message
   Thank you! Your interest has been submitted. Someone from the church will follow up with you soon.

After success:
Reset form, or
Show a “submit another response” button
Phase 7: Admin Auth
Build admin authentication.

1. POST /api/admin/login
   Accepts:
   email
   password
   Returns:
   JWT token
   admin object
2. GET /api/admin/me
   Validates token and returns logged-in admin.
   Frontend Auth Behavior
   Login form at /admin/login
   Store token in a practical V1 location
   Protect /admin and /admin/submissions/:id
   Redirect unauthenticated users to login
   Security note:
   For V1 demo, keep it simple. For long-term use, revisit token storage and auth hardening.
   Phase 8: Admin Dashboard API
   Build protected admin endpoints.
3. GET /api/admin/submissions
   Returns lightweight list of submissions.
   Useful filters:
   status
   archived
   servingAreaId
   search
4. GET /api/admin/submissions/:id
   Returns full submission detail.
   Includes:
   contact information
   availability
   overall frequency
   selected serving areas
   area-specific frequency limits
   requirement confirmations
   notes from volunteer
   admin notes, if included
5. PATCH /api/admin/submissions/:id
   Updates admin-controlled fields:
   status
   is_archived
6. DELETE /api/admin/submissions/:id
   Useful for demo cleanup.
   Long-term, prefer archive over hard delete.
   Phase 9: Admin Dashboard UI
   Build the protected admin pages.
   Admin Dashboard Page
   Should show:
   Submission count
   New submissions
   Search/filter controls
   List/table/cards of volunteer submissions
   Submission list item should show:
   Name
   Contact method
   Selected serving areas
   Status
   Background check/training flags
   Created date
   Submission Detail Page
   Should show:
   Contact information
   Preferred contact method
   Overall frequency
   Availability
   Special event willingness
   Selected serving areas
   Effective frequency for each selected area
   Requirement confirmations
   Experience notes
   Additional notes
   Status dropdown/update
   Archive/delete controls
   Optional:
   Admin notes section
   Phase 10: Admin Notes Optional
   If included in V1:
   Backend:
   POST /api/admin/submissions/:id/notes
   DELETE /api/admin/notes/:id
   Frontend:
   Add note field on submission detail page
   Display notes chronologically
   Allow deleting notes
   If time is tight, skip this until V2.
   Phase 11: Local Testing Checklist
   Test public form:
   Submit with one serving area
   Submit with multiple serving areas
   Submit with area-specific frequency limit
   Submit with special events checked
   Submit role requiring confirmation
   Try submitting role requiring confirmation without checking it
   Try youth without Wednesday availability, if validation is enabled
   Try missing contact info
   Test admin:
   Login succeeds
   Login fails with wrong password
   Dashboard loads submissions
   Detail page loads
   Status update works
   Archive works
   Delete works for test records
   Test edge cases:
   Form reset after successful submission
   Refresh protected admin page
   Invalid token behavior
   Empty dashboard state
   Long notes or many selected roles
   Phase 12: Demo Polish
   Before showing church staff:
   Use realistic sample serving areas
   Make form visually calm and easy to follow
   Add a helpful intro sentence
   Make success message warm
   Make dashboard easy to understand quickly
   Add a few test/demo submissions
   Confirm mobile responsiveness
   Confirm no confusing dev-only text is visible
   Phase 13: Deployment
   Likely deployment path:
   Frontend:
   Cloudflare Pages
   Backend:
   Cloudflare Workers
   Database:
   Cloudflare D1
   For demo:
   Use developer-owned Cloudflare account
   Use temporary app URL
   Do not require church DNS access yet
   Later if church adopts it:
   Decide whether to transfer ownership or recreate under church-owned accounts
   Discuss Wix embed
   Discuss custom subdomain
   Discuss Planning Center integration
   Phase 14: Church Feedback Questions
   When showing the prototype, ask simple reaction-based questions rather than abstract technical questions.
   Good questions:
   Does this feel easier than the current process?
   Are any serving areas missing?
   Are any requirements wrong?
   Would this help you follow up with people?
   Is anything confusing?
   Would you want this embedded on the website?
   Would email notifications help?
   Would you want this connected to Planning Center later?
   Avoid starting with:
   What features do you want?
   How should the database work?
   Should this replace Planning Center?
   Phase 15: Likely V2 Build Order
   If the church wants to continue:
   Add email notification on new submission.
   Add admin notes if not already included.
   Add editable serving areas.
   Add editable role requirements.
   Add password reset/change password.
   Add CSV export.
   Add better archive/deactivate workflows.
   Add Wix embed support/testing.
   Discuss church-owned deployment.
   Investigate Planning Center integration.
   Guiding Principle
   Build the first version to answer one question:
   Can this reduce the friction of people offering to serve and staff following up with them?
   If yes, then expand carefully from there.
