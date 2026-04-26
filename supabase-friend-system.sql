-- MIRACFLIX friend requests, notifications, and public profile lookup.
-- Run this in Supabase SQL Editor once.

create table if not exists public.user_public_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    display_name text not null,
    avatar_url text,
    search_text text,
    updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references auth.users(id) on delete cascade,
    receiver_id uuid not null references auth.users(id) on delete cascade,
    requester_name text not null,
    requester_avatar text,
    receiver_name text not null,
    receiver_avatar text,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    responded_at timestamptz,
    constraint friend_requests_not_self check (requester_id <> receiver_id)
);

create table if not exists public.friendships (
    user_id uuid not null references auth.users(id) on delete cascade,
    friend_id uuid not null references auth.users(id) on delete cascade,
    friend_name text not null,
    friend_avatar text,
    created_at timestamptz not null default now(),
    primary key (user_id, friend_id),
    constraint friendships_not_self check (user_id <> friend_id)
);

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    type text not null,
    title text not null,
    body text,
    actor_id uuid references auth.users(id) on delete set null,
    actor_name text,
    actor_avatar text,
    request_id uuid references public.friend_requests(id) on delete cascade,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create unique index if not exists friend_requests_pending_unique
    on public.friend_requests (requester_id, receiver_id)
    where status = 'pending';

create index if not exists friend_requests_receiver_status_idx
    on public.friend_requests (receiver_id, status, created_at desc);

create index if not exists friend_requests_requester_status_idx
    on public.friend_requests (requester_id, status, created_at desc);

create index if not exists friendships_user_created_idx
    on public.friendships (user_id, created_at desc);

create index if not exists notifications_user_read_created_idx
    on public.notifications (user_id, is_read, created_at desc);

create index if not exists user_public_profiles_search_idx
    on public.user_public_profiles using gin (to_tsvector('simple', coalesce(search_text, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(email, '')));

alter table public.user_public_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Public profiles are searchable by signed in users" on public.user_public_profiles;
create policy "Public profiles are searchable by signed in users"
    on public.user_public_profiles for select
    to authenticated
    using (true);

drop policy if exists "Users maintain their public profile" on public.user_public_profiles;
create policy "Users maintain their public profile"
    on public.user_public_profiles for all
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

drop policy if exists "Users can see their friend requests" on public.friend_requests;
create policy "Users can see their friend requests"
    on public.friend_requests for select
    to authenticated
    using (requester_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
    on public.friend_requests for insert
    to authenticated
    with check (requester_id = auth.uid() and requester_id <> receiver_id and status = 'pending');

drop policy if exists "Users can see their friendships" on public.friendships;
create policy "Users can see their friendships"
    on public.friendships for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "Users can insert their friendships" on public.friendships;
create policy "Users can insert their friendships"
    on public.friendships for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
    on public.notifications for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
    on public.notifications for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "Users can create actor notifications" on public.notifications;
create policy "Users can create actor notifications"
    on public.notifications for insert
    to authenticated
    with check (actor_id = auth.uid());

create or replace function public.accept_friend_request(request_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    req public.friend_requests%rowtype;
begin
    select *
    into req
    from public.friend_requests
    where id = request_uuid
      and receiver_id = auth.uid()
      and status = 'pending'
    for update;

    if not found then
        raise exception 'Friend request not found or not pending';
    end if;

    update public.friend_requests
    set status = 'accepted',
        updated_at = now(),
        responded_at = now()
    where id = req.id;

    insert into public.friendships (user_id, friend_id, friend_name, friend_avatar)
    values
        (req.receiver_id, req.requester_id, req.requester_name, req.requester_avatar),
        (req.requester_id, req.receiver_id, req.receiver_name, req.receiver_avatar)
    on conflict (user_id, friend_id) do update
    set friend_name = excluded.friend_name,
        friend_avatar = excluded.friend_avatar;

    update public.notifications
    set is_read = true
    where request_id = req.id
      and user_id = req.receiver_id;

    insert into public.notifications (user_id, type, title, body, actor_id, actor_name, actor_avatar, request_id)
    values (
        req.requester_id,
        'friend_accepted',
        'Arkadaşlık isteğin kabul edildi',
        req.receiver_name || ' arkadaşlık isteğini kabul etti.',
        req.receiver_id,
        req.receiver_name,
        req.receiver_avatar,
        req.id
    );
end;
$$;

create or replace function public.decline_friend_request(request_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    req public.friend_requests%rowtype;
begin
    select *
    into req
    from public.friend_requests
    where id = request_uuid
      and receiver_id = auth.uid()
      and status = 'pending'
    for update;

    if not found then
        raise exception 'Friend request not found or not pending';
    end if;

    update public.friend_requests
    set status = 'declined',
        updated_at = now(),
        responded_at = now()
    where id = req.id;

    update public.notifications
    set is_read = true
    where request_id = req.id
      and user_id = req.receiver_id;

    insert into public.notifications (user_id, type, title, body, actor_id, actor_name, actor_avatar, request_id)
    values (
        req.requester_id,
        'friend_declined',
        'Arkadaşlık isteğin yanıtlandı',
        req.receiver_name || ' arkadaşlık isteğini reddetti.',
        req.receiver_id,
        req.receiver_name,
        req.receiver_avatar,
        req.id
    );
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
