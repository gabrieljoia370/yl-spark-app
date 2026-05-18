-- Supabase setup for YL Spark Commercial MVP
-- Run this in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create or replace function public.increment_usage(user_id_input uuid)
returns void
language sql
security definer
as $$
  update public.profiles
  set usage_count = usage_count + 1,
      updated_at = now()
  where id = user_id_input;
$$;

-- To manually unlock a paid user after they pay:
-- update public.profiles set plan = 'paid' where email = 'teacher@email.com';

-- To reset a user's free usage:
-- update public.profiles set usage_count = 0 where email = 'teacher@email.com';
