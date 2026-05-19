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

-- YL Spark UI Builder Settings
insert into app_settings (key, value)
values
  ('fontFamily', '"DM Sans"'::jsonb),
  ('headingFont', '"Fraunces"'::jsonb),
  ('backgroundColor', '"#fcf8ef"'::jsonb),
  ('cardColor', '"#ffffff"'::jsonb),
  ('inkColor', '"#28251d"'::jsonb),
  ('mutedColor', '"#6f6b62"'::jsonb),
  ('borderRadius', '"16px"'::jsonb),
  ('buttonRadius', '"999px"'::jsonb),
  ('shadowStyle', '"soft"'::jsonb),
  ('layoutWidth', '"900px"'::jsonb),
  ('heroPadding', '"large"'::jsonb),
  ('heroAlignment', '"left"'::jsonb),
  ('headerStyle', '"classic"'::jsonb),
  ('tabStyle', '"pills"'::jsonb),
  ('cardStyle', '"soft"'::jsonb),
  ('buttonStyle', '"rounded"'::jsonb),
  ('showHeroShapes', 'true'::jsonb),
  ('showFooter', 'true'::jsonb),
  ('showToolIntros', 'true'::jsonb),
  ('showSavedLibrary', 'true'::jsonb),
  ('heroBadgeText', '"YL Spark"'::jsonb),
  ('lessonTabLabel', '"Lesson plan"'::jsonb),
  ('adapterTabLabel', '"Adapt activity"'::jsonb),
  ('flashcardsTabLabel', '"Flashcards"'::jsonb),
  ('savedTabLabel', '"Saved"'::jsonb),
  ('lessonIntroTitle', '"Spark a full lesson"'::jsonb),
  ('lessonIntroText', '"Tell me about your class — age, level, topic, time. I will draft a complete lesson with stages, teacher language, materials, visuals and a quick check."'::jsonb),
  ('adapterIntroTitle', '"Adapt any activity"'::jsonb),
  ('adapterIntroText', '"Paste an activity and reshape it for your age and level — simpler, more physical, more visual, or scaffolded."'::jsonb),
  ('flashcardsIntroTitle', '"Build a vocab set"'::jsonb),
  ('flashcardsIntroText', '"Pick a topic. Get printable flashcards with sentences, image ideas, a chant and games."'::jsonb),
  ('footerText', '"YL Spark · Materiales de Clase para Young Learners"'::jsonb)
on conflict (key) do nothing;
