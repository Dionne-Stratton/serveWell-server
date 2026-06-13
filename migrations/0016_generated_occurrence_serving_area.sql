ALTER TABLE generated_schedule_occurrence_requirements
  ADD COLUMN schedule_serving_area_id INTEGER
  REFERENCES schedule_serving_areas(id) ON DELETE SET NULL;

UPDATE generated_schedule_occurrence_requirements
SET schedule_serving_area_id = (
  SELECT srr.schedule_serving_area_id
  FROM schedule_rhythm_requirements srr
  WHERE srr.id = generated_schedule_occurrence_requirements.template_rhythm_requirement_id
)
WHERE template_rhythm_requirement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_occurrence_req_unique_area
  ON generated_schedule_occurrence_requirements (occurrence_id, schedule_serving_area_id)
  WHERE schedule_serving_area_id IS NOT NULL;
