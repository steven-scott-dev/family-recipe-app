-- SupperLine: age + role on family members (for kid-appropriate portions/nutrition).
-- Run once in the Supabase SQL editor.

alter table family_members add column if not exists age int;
alter table family_members add column if not exists role text default 'parent';
