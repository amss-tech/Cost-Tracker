CREATE TABLE IF NOT EXISTS job_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  phase text,
  sub_job text,
  scope_system text,
  lead text,
  contractor text,
  status text DEFAULT 'Not Started',
  priority text DEFAULT 'Medium',
  pct_complete numeric DEFAULT 0,
  start_date date,
  completion_date date,
  next_action text,
  blocker_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_tasks_job_id_idx ON job_tasks (job_id);
ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_job_tasks ON job_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
