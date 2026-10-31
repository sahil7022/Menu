-- Navrang stall database (Supabase / Postgres). Run once in the Supabase SQL editor on a new project.
-- Then set your staff PIN (last statement) and the same PIN as ADMIN_PIN in Vercel.
create extension if not exists pgcrypto with schema extensions;

-- Private schema: not exposed through the Supabase REST API. Only the functions below are public.
create schema if not exists navrang;
revoke all on schema navrang from public, anon, authenticated;

create table navrang.config (k text primary key, v text not null);
create table navrang.menu_items (id text primary key, name text not null, price integer not null check (price >= 0));
create table navrang.pin_failures (at timestamptz not null default now());
create table navrang.orders (
  id text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  no bigint generated always as identity,
  name text not null check (length(name) between 1 and 40),
  note text not null default '' check (length(note) <= 140),
  items jsonb not null,
  total integer not null check (total >= 0),
  status text not null default 'new' check (status in ('new','preparing','ready','done','cancelled')),
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
alter table navrang.config enable row level security;
alter table navrang.menu_items enable row level security;
alter table navrang.pin_failures enable row level security;
alter table navrang.orders enable row level security;

create function navrang.to_json(o navrang.orders) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'no', o.no, 'name', o.name, 'note', o.note, 'items', o.items,
    'total', o.total, 'status', o.status, 'paid', o.paid, 'createdAt', o.created_at)
$$;

-- True if the PIN is right. Wrong guesses are recorded; after 20 in 10 minutes everything is refused.
create function navrang.pin_ok(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from navrang.pin_failures where at < now() - interval '10 minutes';
  if (select count(*) from navrang.pin_failures) >= 20 then return false; end if;
  if encode(extensions.digest(coalesce(p_pin, ''), 'sha256'), 'hex') = (select v from navrang.config where k = 'pin_sha256') then
    return true;
  end if;
  insert into navrang.pin_failures default values;
  return false;
end $$;

-- Customer: place an order. Prices and names come from navrang.menu_items, never from the caller.
create function public.navrang_create_order(p_name text, p_note text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_items jsonb; v_total integer; r navrang.orders;
begin
  p_name := left(btrim(coalesce(p_name, '')), 40);
  if p_name = '' then return jsonb_build_object('error', 'Please enter your name'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price, 'qty', x.qty) order by x.ord), '[]'::jsonb),
         coalesce(sum(m.price * x.qty), 0)
    into v_items, v_total
    from (select e->>'id' as id, least(50, greatest(0, coalesce((e->>'qty')::int, 0))) as qty, ord
            from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality as t(e, ord)) x
    join navrang.menu_items m on m.id = x.id
   where x.qty > 0;
  if jsonb_array_length(v_items) = 0 then return jsonb_build_object('error', 'Your cart is empty'); end if;
  insert into navrang.orders (name, note, items, total) values (p_name, left(btrim(coalesce(p_note, '')), 140), v_items, v_total) returning * into r;
  return navrang.to_json(r);
end $$;

-- Customer: check own order by its random id.
create function public.navrang_get_order(p_id text)
returns jsonb language sql security definer set search_path = '' as $$
  select navrang.to_json(o) from navrang.orders o where o.id = p_id
$$;

-- Staff functions (need the PIN)
create function public.navrang_list_orders(p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not navrang.pin_ok(p_pin) then return jsonb_build_object('error', 'forbidden'); end if;
  return coalesce((select jsonb_agg(navrang.to_json(o) order by o.no) from navrang.orders o), '[]'::jsonb);
end $$;

create function public.navrang_set_status(p_pin text, p_id text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r navrang.orders;
begin
  if not navrang.pin_ok(p_pin) then return jsonb_build_object('error', 'forbidden'); end if;
  if p_status not in ('new','preparing','ready','done','cancelled') then return jsonb_build_object('error', 'Bad status'); end if;
  update navrang.orders set status = p_status where id = p_id returning * into r;
  if not found then return jsonb_build_object('error', 'Not found'); end if;
  return navrang.to_json(r);
end $$;

create function public.navrang_set_paid(p_pin text, p_id text, p_paid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r navrang.orders;
begin
  if not navrang.pin_ok(p_pin) then return jsonb_build_object('error', 'forbidden'); end if;
  update navrang.orders set paid = coalesce(p_paid, false) where id = p_id returning * into r;
  if not found then return jsonb_build_object('error', 'Not found'); end if;
  return navrang.to_json(r);
end $$;

create function public.navrang_clear_orders(p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not navrang.pin_ok(p_pin) then return jsonb_build_object('error', 'forbidden'); end if;
  truncate navrang.orders restart identity;
  return jsonb_build_object('ok', true);
end $$;

-- Keeps the DB menu in step with menu.json (the server calls this with the staff PIN after each deploy).
create function public.navrang_sync_menu(p_pin text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not navrang.pin_ok(p_pin) then return jsonb_build_object('error', 'forbidden'); end if;
  insert into navrang.menu_items (id, name, price)
    select e->>'id', e->>'name', (e->>'price')::int from jsonb_array_elements(p_items) e
  on conflict (id) do update set name = excluded.name, price = excluded.price;
  delete from navrang.menu_items where id not in (select e->>'id' from jsonb_array_elements(p_items) e);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function navrang.pin_ok(text) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['navrang_create_order(text,text,jsonb)', 'navrang_get_order(text)', 'navrang_list_orders(text)',
                           'navrang_set_status(text,text,text)', 'navrang_set_paid(text,text,boolean)', 'navrang_clear_orders(text)', 'navrang_sync_menu(text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;

-- Set your staff PIN here (replace 123456), then use the same value for ADMIN_PIN in Vercel:
insert into navrang.config values ('pin_sha256', encode(extensions.digest('123456', 'sha256'), 'hex'));
