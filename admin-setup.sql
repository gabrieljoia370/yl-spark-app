-- YL Spark Admin Area Setup
-- Run this in Supabase SQL Editor.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into app_settings (key, value)
values
  ('heroTitle', '"YL Spark"'::jsonb),
  ('heroSubtitle', '"Materiales de Clase para Young Learners"'::jsonb),
  ('heroDescription', '"AI-powered lesson planning, flashcards, visual supports and classroom materials for English teachers of young learners."'::jsonb),
  ('primaryColor', '"#01696f"'::jsonb),
  ('accentColor', '"#ef6b53"'::jsonb),
  ('logoSize', '"medium"'::jsonb),
  ('freeLimit', '3'::jsonb),
  ('price', '390'::jsonb),
  ('currency', '"UYU"'::jsonb),
  ('showPricing', 'true'::jsonb),
  ('lessonPromptExtra', '""'::jsonb),
  ('flashcardsPromptExtra', '""'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;

-- Keep direct public access restricted. Server-side API uses the service role key.
drop policy if exists "No public app_settings writes" on app_settings;
create policy "No public app_settings writes"
on app_settings for all
using (false)
with check (false);