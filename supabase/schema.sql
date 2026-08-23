-- 拾光小屋数据库
create extension if not exists pgcrypto;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  kind text not null check (kind in ('note','event','invite')),
  title text not null,
  content text,
  event_type text,
  place text,
  event_date date not null default current_date,
  event_time time,
  cover_url text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  image_url text not null,
  caption text,
  photo_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id boolean primary key default true,
  owner_id uuid,
  site_title text not null default '拾光小屋',
  subtitle text not null default '把我们的小日子，一格一格收藏起来。',
  accent text not null default '#8E9A8B',
  accent_2 text not null default '#C9B8A6',
  paper text not null default '#F4EFE7',
  ink text not null default '#4D4A45',
  background_url text,
  pixel_scale integer not null default 4,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.trash (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  source_table text not null check (source_table in ('entries','photos')),
  source_id uuid not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now()
);

alter table public.entries enable row level security;
alter table public.photos enable row level security;
alter table public.site_settings enable row level security;
alter table public.trash enable row level security;

-- 开放阅读；写入/修改/软删除只允许自己的匿名身份。
create policy "entries_read" on public.entries for select using (deleted_at is null);
create policy "entries_insert" on public.entries for insert with check (owner_id = auth.uid());
create policy "entries_update_own" on public.entries for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "photos_read" on public.photos for select using (deleted_at is null);
create policy "photos_insert" on public.photos for insert with check (owner_id = auth.uid());
create policy "photos_update_own" on public.photos for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "settings_read" on public.site_settings for select using (true);
create policy "settings_update" on public.site_settings for update using (owner_id = auth.uid() or owner_id is null) with check (owner_id = auth.uid() or owner_id is null);

create policy "trash_read_own" on public.trash for select using (owner_id = auth.uid());
create policy "trash_insert_own" on public.trash for insert with check (owner_id = auth.uid());
create policy "trash_delete_own" on public.trash for delete using (owner_id = auth.uid());

-- Storage：建立名为 love-media 的 bucket 后执行以下 policy。
-- 前端会把文件放在 {auth.uid()}/... 下。
insert into storage.buckets (id, name, public)
values ('love-media', 'love-media', true)
on conflict (id) do update set public = true;

create policy "love_media_read"
on storage.objects for select
using (bucket_id = 'love-media');

create policy "love_media_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'love-media'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

create policy "love_media_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'love-media'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

create policy "love_media_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'love-media'
  and (storage.foldername(name))[1] = (auth.uid())::text
);

-- 自动更新时间
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
for each row execute function public.touch_updated_at();

drop trigger if exists photos_touch on public.photos;
create trigger photos_touch before update on public.photos
for each row execute function public.touch_updated_at();

-- Realtime（可选）：让多个浏览器看到近实时变化
alter publication supabase_realtime add table public.entries;
alter publication supabase_realtime add table public.photos;
