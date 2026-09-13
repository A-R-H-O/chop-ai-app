-- The loader subscribes to its own job row, so jobs must be in the
-- Realtime publication. Only jobs: samples are read once when the job
-- completes, and job_metrics is never client-visible, so publishing
-- either would be pure overhead.
--
-- RLS still applies to Realtime, so a subscriber only ever receives rows
-- it could have selected.
alter publication supabase_realtime add table public.jobs;

-- Realtime sends only the primary key on UPDATE unless the table has
-- REPLICA IDENTITY FULL. The loader needs status and stage on every
-- change, so the full row is required.
alter table public.jobs replica identity full;
