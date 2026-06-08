-- Sample volunteer submissions for the demo organization (admin dashboard preview).
-- Public demo form UI does not accept new submissions; these rows are read-only fixtures.

INSERT INTO volunteer_submissions (
  id,
  organization_id,
  form_id,
  first_name,
  last_name,
  email,
  phone,
  preferred_contact_method,
  overall_frequency,
  open_to_special_events,
  experience_notes,
  additional_notes,
  status,
  is_archived
) VALUES
  (
    1,
    1,
    1,
    'Jordan',
    'Ellis',
    'jordan.ellis@example.com',
    '555-0101',
    'email',
    'every_week',
    1,
    'Comfortable with ProPresenter and lyric slides.',
    'Usually available except one Sunday per month.',
    'new',
    0
  ),
  (
    2,
    1,
    1,
    'Maria',
    'Chen',
    'maria.chen@example.com',
    NULL,
    'text',
    'twice_month',
    0,
    'Former nursery volunteer at another church.',
    NULL,
    'follow_up_needed',
    0
  ),
  (
    3,
    1,
    1,
    'Alex',
    'Rivera',
    NULL,
    '555-0103',
    'phone',
    'flexible',
    1,
    NULL,
    'Interested in greeting and special events.',
    'contacted',
    0
  )
ON CONFLICT(id) DO UPDATE SET
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  preferred_contact_method = excluded.preferred_contact_method,
  overall_frequency = excluded.overall_frequency,
  open_to_special_events = excluded.open_to_special_events,
  experience_notes = excluded.experience_notes,
  additional_notes = excluded.additional_notes,
  status = excluded.status,
  is_archived = excluded.is_archived,
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM volunteer_availability
WHERE organization_id = 1 AND form_id = 1 AND submission_id IN (1, 2, 3);

DELETE FROM volunteer_interests
WHERE organization_id = 1 AND form_id = 1 AND submission_id IN (1, 2, 3);

INSERT INTO volunteer_availability (organization_id, form_id, submission_id, availability_key) VALUES
  (1, 1, 1, 'sunday_morning'),
  (1, 1, 2, 'sunday_morning'),
  (1, 1, 2, 'wednesday_night'),
  (1, 1, 3, 'sunday_morning'),
  (1, 1, 3, 'special_events');

INSERT INTO volunteer_interests (
  organization_id,
  form_id,
  submission_id,
  serving_area_id,
  serving_area_name,
  uses_area_specific_frequency,
  experience_level,
  interest_notes
)
SELECT 1, 1, 1, sa.id, sa.name, 0, 'experienced', 'Can serve slides most Sundays.'
FROM serving_areas sa
WHERE sa.form_id = 1 AND sa.slug = 'slides'
UNION ALL
SELECT 1, 1, 2, sa.id, sa.name, 0, 'some', 'Would love to help in kids ministry.'
FROM serving_areas sa
WHERE sa.form_id = 1 AND sa.slug = 'kids-ministry'
UNION ALL
SELECT 1, 1, 3, sa.id, sa.name, 0, 'none', NULL
FROM serving_areas sa
WHERE sa.form_id = 1 AND sa.slug = 'greeting-hospitality'
UNION ALL
SELECT 1, 1, 3, sa.id, sa.name, 0, 'not_sure', 'Happy to help with events when needed.'
FROM serving_areas sa
WHERE sa.form_id = 1 AND sa.slug = 'events-special-events';
