Initial Data Model
Purpose of This Document
This document defines the first working data model for ServeWell. It is meant to support the V1 demo/usable prototype while leaving room for V2 features like editable serving areas, better admin tools, and Planning Center integration.
The goal is to avoid frontend/backend drift by deciding early what the main records are called, how they relate to each other, and what shape the API should eventually return.
Recommended Stack Assumption
For the initial version, the recommended database approach is SQL, likely Cloudflare D1.
ServeWell’s data is highly relational:
One volunteer submission can include many serving interests.
One serving area can appear on many submissions.
Some serving areas have requirements.
Admins need to filter submissions by status, serving area, background-check needs, etc.
That fits SQL well.
Core Entities

1. Admin User
   For V1, there will likely be one shared admin login.
   In the earliest prototype, this could be seeded manually with the church email and a temporary password. No public registration should exist.
   Future versions may support multiple admin accounts and permissions.
   Suggested table: admin_users
   Fields:
   id
   email
   password_hash
   display_name
   role
   is_active
   created_at
   updated_at
   Suggested V1 role:
   admin
   Future roles:
   owner
   admin
   viewer
   form_editor
2. Serving Area
   A serving area is a ministry role or volunteer opportunity that someone can select on the public form.
   For the earliest V1 demo, serving areas may be hardcoded in the frontend or seeded in the database. Long-term, they should live in the database so admins can edit them.
   Suggested table: serving_areas
   Fields:
   id
   slug
   name
   category
   description
   public_note
   requires_background_check
   requires_training
   requires_audition_or_interview
   is_active
   sort_order
   created_at
   updated_at
   Example categories:
   worship
   media_tech
   kids_youth
   hospitality
   events
   prayer_ministry
   general
   Example serving areas:
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
3. Serving Area Requirement
   Some serving areas have specific requirements, such as Wednesday availability for youth ministry or rehearsal availability for choir/worship.
   For V1, these can be hardcoded or seeded. Future versions should allow admins to edit them.
   Suggested table: serving_area_requirements
   Fields:
   id
   serving_area_id
   requirement_type
   label
   description
   day_of_week
   start_time
   end_time
   is_mandatory
   requires_confirmation
   sort_order
   created_at
   updated_at
   Suggested requirement_type values:
   availability
   rehearsal
   background_check
   training
   audition_or_interview
   custom_acknowledgement
   Examples:
   Youth Ministry:
   requirement_type: availability
   label: Wednesday night youth service
   is_mandatory: true
   requires_confirmation: true
   Worship Team / Singer:
   requirement_type: rehearsal
   label: Saturday rehearsal
   description: This role may require rehearsal availability in addition to Sunday service.
   is_mandatory: true
   requires_confirmation: true
   Kids Ministry:
   requirement_type: background_check
   label: Background check required
   is_mandatory: true
   requires_confirmation: true
4. Volunteer Submission
   A volunteer submission is the main form response from a person who wants to serve.
   Suggested table: volunteer_submissions
   Fields:
   id
   first_name
   last_name
   email
   phone
   preferred_contact_method
   overall_frequency
   general_availability_notes
   open_to_special_events
   experience_notes
   additional_notes
   status
   is_archived
   created_at
   updated_at
   Suggested preferred_contact_method values:
   email
   text
   phone
   no_preference
   Suggested overall_frequency values:
   every_week
   two_to_three_times_month
   twice_month
   once_month
   occasionally
   flexible
   Suggested status values:
   new
   follow_up_needed
   background_check_needed
   training_needed
   approved_ready_to_schedule
   added_to_planning_center
   archived_inactive
   not_a_fit
   Notes:
   is_archived allows hiding submissions from the main dashboard without deleting them.
   For the first demo, delete may also exist for test submissions.
   Long-term, archive is safer than delete.
5. Volunteer Interest
   A volunteer interest connects a submission to a serving area.
   One volunteer submission can include multiple serving interests.
   Suggested table: volunteer_interests
   Fields:
   id
   submission_id
   serving_area_id
   uses_area_specific_frequency
   area_specific_frequency
   interest_notes
   experience_level
   created_at
   updated_at
   Suggested experience_level values:
   none
   some
   experienced
   not_sure
   Frequency logic:
   If uses_area_specific_frequency is false, use the submission’s overall_frequency.
   If uses_area_specific_frequency is true, use area_specific_frequency for this serving area.
   Example:
   A volunteer says they are willing to serve every week overall, selects Kids Ministry and Slides, but limits Kids Ministry to once per month.
   volunteer_submissions.overall_frequency = every_week
   Kids interest: uses_area_specific_frequency = true, area_specific_frequency = once_month
   Slides interest: uses_area_specific_frequency = false
6. Volunteer Availability
   Availability can be modeled simply in V1 and expanded later.
   Suggested table: volunteer_availability
   Fields:
   id
   submission_id
   availability_key
   label
   created_at
   Suggested availability_key values:
   sunday_morning
   tuesday_night
   wednesday_night
   special_events
   other
   Notes:
   open_to_special_events may live on volunteer_submissions as a simple boolean in V1.
   If more nuance is needed later, special events can move into a richer availability/constraints model.
7. Requirement Confirmation
   If a serving area has mandatory requirements, the form may ask the volunteer to confirm they understand or are generally available.
   Suggested table: volunteer_requirement_confirmations
   Fields:
   id
   submission_id
   serving_area_id
   requirement_id
   confirmed
   created_at
   Example:
   A volunteer selects Worship Team / Singer. The form displays a rehearsal requirement and asks them to confirm they understand that rehearsal availability may be required.
8. Admin Note
   Admin notes are optional for V1 but useful.
   Suggested table: admin_notes
   Fields:
   id
   submission_id
   admin_user_id
   note
   created_at
   updated_at
   Examples:
   “Emailed her on Tuesday.”
   “Background check link sent.”
   “Talked to worship pastor.”
   “Only available during summer break.”
   If V1 needs to stay very lean, admin notes can be delayed.
9. Status History
   Status history is likely V2, but the model should keep it in mind.
   Suggested table: submission_status_history
   Fields:
   id
   submission_id
   old_status
   new_status
   changed_by_admin_user_id
   created_at
   This would make it easier to see when someone moved from new to follow-up needed, then to approved, etc.
   V1 Minimum Database Tables
   For a practical V1, the minimum useful set is probably:
   admin_users
   volunteer_submissions
   volunteer_interests
   volunteer_availability
   Serving areas and requirements could be hardcoded for the first demo, but it may still be better to seed them into the database early to avoid rewriting later.
   Recommended V1 practical set:
   admin_users
   serving_areas
   serving_area_requirements
   volunteer_submissions
   volunteer_interests
   volunteer_availability
   volunteer_requirement_confirmations
   Optional V1:
   admin_notes
   V2:
   submission_status_history
   Suggested Initial Relationships
   One volunteer_submission has many volunteer_interests.
   One serving_area has many volunteer_interests.
   One serving_area has many serving_area_requirements.
   One volunteer_submission has many volunteer_availability rows.
   One volunteer_submission has many volunteer_requirement_confirmations.
   One admin_user may create many admin_notes.
   One volunteer_submission may have many admin_notes.
   Public Form Response Shape
   The public form should probably receive serving areas in a structure like this:
   {
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
   "isMandatory": true,
   "requiresConfirmation": true
   }
   ]
   }
   ]
   }

Volunteer Submission Request Shape
The frontend should submit something like:
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

Admin Submission List Shape
The admin dashboard can receive submission list items like:
{
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

Admin Submission Detail Shape
Submission detail should include the full submission, selected interests, requirements, confirmations, and notes.
{
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

Notes for Implementation
Use consistent enum values in the frontend and backend from the beginning.
Avoid hardcoding a different mock shape than the eventual API shape.
If mock data is used in the frontend, keep it in one place and match these response shapes exactly.
Prefer archive/deactivate for real records, but allow delete for early testing/demo cleanup if needed.
Keep V1 simple, but do not name fields in a way that blocks future scheduling features.
Open Questions for Later
Should serving area requirements be fully editable in V2?
Should the church eventually own the deployment/account/database?
Should Planning Center integration push new volunteers directly into People?
Should background check status live per submission or per serving area interest?
Should volunteers eventually have their own login to update availability?
Should this become a full scheduling engine later?
