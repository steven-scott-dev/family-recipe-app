-- SupperLine: portion size on family members (small/standard/large).
-- Small = post-surgery stomach, light eaters, etc. The AI scales their share down.
-- Run once in the Supabase SQL editor.

alter table family_members add column if not exists portion_size text default 'standard';
