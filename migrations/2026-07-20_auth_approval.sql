-- ============================================================================
--  Google sign-in + owner approval gate.
--
--  Flow: user signs in with Google -> a trigger creates their app_access row as
--  'pending' -> the owner approves from the dashboard's admin panel -> the user
--  gets in. The owner's own email is auto-approved so he can never lock himself
--  out (auth.users is empty today, so his first login seeds the first admin).
--
--  This migration is ADDITIVE and changes nothing about who can read the data
--  today: the existing permissive policies stay untouched, so the dashboard and
--  the weekly imports keep working while the UI is rolled out behind the
--  VITE_AUTH_ENABLED flag. The actual lockdown (approval-gated SELECT,
--  service-role-only writes, revoking anon EXECUTE on the chat RPCs) is a
--  separate migration, applied once Google is configured and a service-role key
--  exists for the importers and n8n.
-- ============================================================================

create table if not exists public.app_access (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    email        text not null,
    full_name    text,
    avatar_url   text,
    status       text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
    role         text not null default 'viewer'  check (role in ('viewer', 'admin')),
    requested_at timestamptz not null default now(),
    decided_at   timestamptz,
    decided_by   uuid references auth.users(id),
    last_seen_at timestamptz
);

create index if not exists idx_app_access_status on public.app_access(status);
create index if not exists idx_app_access_email  on public.app_access(email);

comment on table public.app_access is
    'One row per Google-authenticated user. status=approved is required to read any dashboard data.';

-- ── Owner bootstrap ─────────────────────────────────────────────────────────
-- Emails auto-approved as admin on first sign-in. Keep in sync with is_owner().
create or replace function public.is_owner_email(addr text)
returns boolean
language sql immutable
as $$ select lower(coalesce(addr, '')) in ('janosbuzasibz@gmail.com') $$;

-- ── New-user trigger: every Google sign-in lands here ───────────────────────
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.app_access (user_id, email, full_name, avatar_url, status, role, decided_at)
    values (
        new.id,
        coalesce(new.email, ''),
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'avatar_url',
        case when public.is_owner_email(new.email) then 'approved' else 'pending' end,
        case when public.is_owner_email(new.email) then 'admin'    else 'viewer'  end,
        case when public.is_owner_email(new.email) then now()      else null      end
    )
    on conflict (user_id) do update
        set email      = excluded.email,
            full_name  = coalesce(excluded.full_name, public.app_access.full_name),
            avatar_url = coalesce(excluded.avatar_url, public.app_access.avatar_url);
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ── Helpers used by the (later) data-table policies ─────────────────────────
-- SECURITY DEFINER + pinned search_path: this is what stops infinite recursion
-- when app_access itself is RLS-protected and a policy calls back into it.
create or replace function public.is_approved()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.app_access
        where user_id = auth.uid() and status = 'approved'
    )
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.app_access
        where user_id = auth.uid() and status = 'approved' and role = 'admin'
    )
$$;

revoke execute on function public.is_approved()      from anon, public;
revoke execute on function public.is_admin()         from anon, public;
grant  execute on function public.is_approved()      to authenticated;
grant  execute on function public.is_admin()         to authenticated;

-- ── Admin action: approve / revoke, callable only by an admin ───────────────
create or replace function public.set_user_access(target uuid, new_status text, new_role text default null)
returns public.app_access
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
    row public.app_access;
begin
    if not public.is_admin() then
        raise exception 'not authorised';
    end if;
    if new_status not in ('pending', 'approved', 'revoked') then
        raise exception 'invalid status %', new_status;
    end if;
    if target = auth.uid() and new_status <> 'approved' then
        raise exception 'refusing to lock yourself out';
    end if;

    update public.app_access
       set status     = new_status,
           role       = coalesce(new_role, role),
           decided_at = now(),
           decided_by = auth.uid()
     where user_id = target
     returning * into row;

    return row;
end;
$$;

revoke execute on function public.set_user_access(uuid, text, text) from anon, public;
grant  execute on function public.set_user_access(uuid, text, text) to authenticated;

-- ── RLS on app_access itself ───────────────────────────────────────────────
alter table public.app_access enable row level security;

drop policy if exists app_access_self_read  on public.app_access;
drop policy if exists app_access_admin_read on public.app_access;
drop policy if exists app_access_touch      on public.app_access;

-- A user always sees their own row (so the UI can say "pending"); admins see all.
create policy app_access_self_read on public.app_access
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- Users may only stamp their own last_seen_at; status/role changes go through
-- set_user_access(), so nobody can self-approve.
create policy app_access_touch on public.app_access
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

grant select on public.app_access to authenticated;
grant update (last_seen_at) on public.app_access to authenticated;
revoke all on public.app_access from anon;
