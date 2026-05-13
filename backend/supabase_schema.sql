-- ============================================================
-- Justif.ai — Supabase Database Schema
-- Run this in the Supabase SQL Editor (supabase.com/dashboard)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES TABLE
-- Auto-created when a user signs up via auth trigger
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users can insert their own profile (for the trigger)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- 2. CHATS TABLE
-- Each conversation thread belongs to a user
-- ============================================================
create table if not exists public.chats (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Bagong Usapan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.chats enable row level security;

-- Users can only see their own chats
create policy "Users can view own chats"
  on public.chats for select
  using (auth.uid() = user_id);

-- Users can create their own chats
create policy "Users can create own chats"
  on public.chats for insert
  with check (auth.uid() = user_id);

-- Users can update their own chats
create policy "Users can update own chats"
  on public.chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own chats
create policy "Users can delete own chats"
  on public.chats for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. MESSAGES TABLE
-- Individual messages within a chat
-- ============================================================
create table if not exists public.messages (
  id uuid not null default uuid_generate_v4() primary key,
  chat_id uuid references public.chats(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.messages enable row level security;

-- Users can view messages from their own chats
create policy "Users can view own chat messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id
      and chats.user_id = auth.uid()
    )
  );

-- Users can insert messages into their own chats
create policy "Users can insert messages into own chats"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.chats
      where chats.id = messages.chat_id
      and chats.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. TRIGGER: Auto-create profile on user signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 5. INDEXES for performance
-- ============================================================
create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_chats_updated_at on public.chats(updated_at desc);
create index if not exists idx_messages_chat_id on public.messages(chat_id);
create index if not exists idx_messages_created_at on public.messages(created_at asc);

-- ============================================================
-- 6. Updated_at trigger for chats
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_chats_updated_at on public.chats;
create trigger update_chats_updated_at
  before update on public.chats
  for each row execute procedure public.update_updated_at_column();
