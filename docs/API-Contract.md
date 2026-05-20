API Contract
Purpose
This document defines the initial API contract for ServeWell so the frontend and backend can stay aligned from the beginning.
The goal is to avoid mock-data drift by deciding early:
endpoint names,
request shapes,
response shapes,
enum values,
and expected behavior.
This API contract is written for the V1 demo/usable prototype.
Base Assumptions
Frontend:
React + Vite
Backend:
Cloudflare Workers
Database:
D1 / SQL
Auth:
JWT-based admin login for V1
One shared admin account initially
No public registration
Base API path:
/api

Response Style
Successful responses should generally return JSON.
Example:
{
"success": true,
"data": {}
}

Error responses should return:
{
"success": false,
"error": {
"message": "Something went wrong.",
"code": "ERROR_CODE"
}
}

Shared Enums
preferredContactMethod
email
text
phone
no_preference

overallFrequency / areaSpecificFrequency
every_week
two_to_three_times_month
twice_month
once_month
occasionally
flexible

availabilityKey
sunday_morning
tuesday_night
wednesday_night
special_events
other

submissionStatus
new
follow_up_needed
background_check_needed
training_needed
approved_ready_to_schedule
added_to_planning_center
archived_inactive
not_a_fit

experienceLevel
none
some
experienced
not_sure

servingAreaCategory
worship
media_tech
kids_youth
hospitality
events
prayer_ministry
general

requirementType
availability
rehearsal
background_check
training
audition_or_interview
custom_acknowledgement

Public Endpoints
GET /api/serving-areas
Returns active serving areas and their requirements for the public volunteer form.
Auth
Public.
Response
{
"success": true,
"data": {
"servingAreas": [
{
"id": 1,
"slug": "worship-singer",
"name": "Worship Team / Singer",
"category": "worship",
"description": "Help lead the church in worship through singing.",
"publicNote": "This role may require rehearsal availability.",
"requiresBackgroundCheck": false,
"requiresTraining": false,
"requiresAuditionOrInterview": true,
"requirements": [
{
"id": 11,
"type": "rehearsal",
"label": "Rehearsal availability",
"description": "This role may require rehearsal availability in addition to Sunday service.",
"dayOfWeek": "saturday",
"startTime": "14:00",
"endTime": null,
"isMandatory": true,
"requiresConfirmation": true
}
]
}
]
}
}

Notes
For the earliest V1 demo, this data may be seeded or hardcoded. Long-term, it should come from the database.
POST /api/volunteer-submissions
Creates a new volunteer submission from the public form.
Auth
Public.
Request Body
{
"firstName": "Dionne",
"lastName": "Stratton",
"email": "example@email.com",
"phone": "555-555-5555",
"preferredContactMethod": "text",
"overallFrequency": "every_week",
"availability": ["sunday_morning", "wednesday_night"],
"openToSpecialEvents": true,
"experienceNotes": "I have experience with slides and media.",
"additionalNotes": "I prefer not to miss more than one Sunday service per month.",
"interests": [
{
"servingAreaId": 1,
"usesAreaSpecificFrequency": true,
"areaSpecificFrequency": "once_month",
"experienceLevel": "some",
"interestNotes": "I am willing to help with kids once a month."
},
{
"servingAreaId": 2,
"usesAreaSpecificFrequency": false,
"areaSpecificFrequency": null,
"experienceLevel": "experienced",
"interestNotes": "I can run slides most Sundays."
}
],
"requirementConfirmations": [
{
"servingAreaId": 1,
"requirementId": 5,
"confirmed": true
}
]
}

Required Fields
firstName
lastName
email or phone
preferredContactMethod
overallFrequency
at least one serving interest
Validation Rules
V1 should validate:
At least one contact method is provided.
At least one serving area is selected.
If usesAreaSpecificFrequency is true, areaSpecificFrequency is required.
If a selected serving area has a mandatory requirement with requiresConfirmation, confirmation is required.
If a selected serving area requires a specific availability block, the user should either select that availability or receive a clear validation message.
Example validation message:
Youth Ministry usually meets on Wednesday nights. Please select Wednesday night availability or remove Youth Ministry from your serving interests.

Response
{
"success": true,
"data": {
"submissionId": 101,
"message": "Thank you! Your interest has been submitted. Someone from the church will follow up with you soon."
}
}

Admin Auth Endpoints
POST /api/admin/login
Logs in an approved admin user and returns a JWT.
Auth
Public, but only works for seeded/approved admin account.
Request Body
{
"email": "church@example.com",
"password": "temporary-password"
}

Response
{
"success": true,
"data": {
"token": "jwt-token-here",
"admin": {
"id": 1,
"email": "church@example.com",
"displayName": "Church Admin",
"role": "admin"
}
}
}

Error Response
{
"success": false,
"error": {
"message": "Invalid email or password.",
"code": "INVALID_LOGIN"
}
}

GET /api/admin/me
Returns the currently logged-in admin user.
Auth
Admin JWT required.
Response
{
"success": true,
"data": {
"admin": {
"id": 1,
"email": "church@example.com",
"displayName": "Church Admin",
"role": "admin"
}
}
}

Admin Submission Endpoints
GET /api/admin/submissions
Returns volunteer submissions for the admin dashboard.
Auth
Admin JWT required.
Query Params
Optional:
status=new
archived=false
servingAreaId=1
search=dionne

Response
{
"success": true,
"data": {
"submissions": [
{
"id": 101,
"firstName": "Dionne",
"lastName": "Stratton",
"email": "example@email.com",
"phone": "555-555-5555",
"preferredContactMethod": "text",
"overallFrequency": "every_week",
"availability": ["sunday_morning", "wednesday_night"],
"openToSpecialEvents": true,
"status": "new",
"isArchived": false,
"servingAreas": ["Kids Ministry", "Slides"],
"requiresBackgroundCheck": true,
"requiresTraining": false,
"createdAt": "2026-05-19T18:00:00.000Z"
}
]
}
}

Notes
The list response should stay lightweight. Full notes, requirement confirmations, and detailed interests can be loaded through the detail endpoint.
GET /api/admin/submissions/:id
Returns full details for one volunteer submission.
Auth
Admin JWT required.
Response
{
"success": true,
"data": {
"submission": {
"id": 101,
"firstName": "Dionne",
"lastName": "Stratton",
"email": "example@email.com",
"phone": "555-555-5555",
"preferredContactMethod": "text",
"overallFrequency": "every_week",
"availability": ["sunday_morning", "wednesday_night"],
"openToSpecialEvents": true,
"experienceNotes": "I have experience with slides and media.",
"additionalNotes": "I prefer not to miss more than one Sunday service per month.",
"status": "new",
"isArchived": false,
"createdAt": "2026-05-19T18:00:00.000Z",
"updatedAt": "2026-05-19T18:00:00.000Z"
},
"interests": [
{
"id": 1,
"servingAreaId": 1,
"servingAreaName": "Kids Ministry",
"usesAreaSpecificFrequency": true,
"areaSpecificFrequency": "once_month",
"effectiveFrequency": "once_month",
"requiresBackgroundCheck": true,
"requiresTraining": true,
"experienceLevel": "some",
"interestNotes": "I am willing to help with kids once a month."
}
],
"requirementConfirmations": [
{
"requirementId": 5,
"servingAreaName": "Kids Ministry",
"label": "Background check required",
"confirmed": true
}
],
"adminNotes": []
}
}

PATCH /api/admin/submissions/:id
Updates admin-controlled fields on a volunteer submission.
Auth
Admin JWT required.
Request Body
All fields optional.
{
"status": "follow_up_needed",
"isArchived": false
}

Response
{
"success": true,
"data": {
"submission": {
"id": 101,
"status": "follow_up_needed",
"isArchived": false,
"updatedAt": "2026-05-19T19:00:00.000Z"
}
}
}

DELETE /api/admin/submissions/:id
Deletes a volunteer submission.
Auth
Admin JWT required.
V1 Notes
This is useful for demo/test cleanup.
Long-term, archive should be preferred over hard delete.
Response
{
"success": true,
"data": {
"deleted": true
}
}

Admin Notes Endpoints
Admin notes are optional for V1. If included, use the following endpoints.
POST /api/admin/submissions/:id/notes
Adds a staff-only note to a submission.
Auth
Admin JWT required.
Request Body
{
"note": "Emailed her about slides availability."
}

Response
{
"success": true,
"data": {
"note": {
"id": 1,
"submissionId": 101,
"adminUserId": 1,
"note": "Emailed her about slides availability.",
"createdAt": "2026-05-19T19:10:00.000Z"
}
}
}

DELETE /api/admin/notes/:id
Deletes an admin note.
Auth
Admin JWT required.
Response
{
"success": true,
"data": {
"deleted": true
}
}

Future Admin Serving Area Endpoints
These are likely V2, not required for the first demo.
GET /api/admin/serving-areas
Returns all serving areas, including inactive ones.
POST /api/admin/serving-areas
Creates a new serving area.
PATCH /api/admin/serving-areas/:id
Updates a serving area.
PATCH /api/admin/serving-areas/:id/archive
Deactivates a serving area without deleting it.
Future Planning Center Endpoint Ideas
These are not V1.
POST /api/admin/submissions/:id/planning-center
Pushes or prepares the submission for Planning Center.
Possible behavior:
Create or update person in Planning Center People
Attach notes or tags
Mark submission as added_to_planning_center
This should only be attempted after confirming:
the church wants integration,
API access is available,
permissions are appropriate,
and the data mapping is clear.
Frontend Route Mapping
Suggested frontend routes:
/ Staff landing page
/serve Public volunteer form
/admin/login Admin login
/admin Admin dashboard
/admin/submissions/:id Submission detail

Future:
/admin/serving-areas
/admin/settings

Implementation Notes
Keep enum values identical between frontend and backend.
Put shared option lists in one place if possible.
Avoid scattered mock data.
If frontend mock data is needed, make it match this contract exactly.
Use archive for real records, but allow delete during early demo/testing.
Keep V1 endpoints small and focused.
Avoid Planning Center integration until the basic intake workflow is validated.
Suggested Build Order Based on API
Create database schema/migrations.
Seed one admin user.
Seed serving areas and requirements.
Build GET /api/serving-areas.
Build POST /api/volunteer-submissions.
Build admin login.
Build GET /api/admin/submissions.
Build GET /api/admin/submissions/:id.
Build status/archive update.
Add delete for demo cleanup.
Add admin notes if desired.
