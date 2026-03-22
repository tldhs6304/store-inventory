-- ============================================================
-- Store Inventory Tracking System — Supabase Schema
-- ============================================================

-- Stores table
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,        -- e.g. 'DMB', 'LA3', 'WMT'
  name text not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Seed CA stores (CPFR 23 stores)
insert into stores (code, name) values
  ('DMB', 'Diamond Bar'), ('IVN', 'Irvine'), ('GDG', 'Garden Grove'),
  ('SDG', 'San Diego'), ('BNP', 'Buena Park'), ('LSA', 'Los Angeles'),
  ('TRC', 'Torrance'), ('LKW', 'Lakewood'), ('DAZ', 'Daly City'),
  ('ACD', 'Arcadia'), ('SJS', 'San Jose'), ('LA2', 'LA2'),
  ('BBA', 'Brea'), ('MSA', 'Mesa'), ('LA3', 'LA3'),
  ('SFC', 'San Francisco'), ('IV2', 'Irvine 2'), ('IV3', 'Irvine 3'),
  ('HNL', 'Honolulu'), ('PRC', 'Perris'), ('CHN', 'Chino'),
  ('LSV', 'Las Vegas'), ('WMT', 'Walmart')
on conflict (code) do nothing;

-- Products table (CPFR item list, replaceable via Excel upload)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  upc text unique not null,
  b1_code text,
  description text not null,
  description_kr text,
  unit text,
  pack numeric,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Weekly submissions: one per store per week
create table if not exists weekly_submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  year int not null,
  week int not null,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id),
  status text default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz default now(),
  unique(store_id, year, week)
);

-- Inventory entries: per product per submission
create table if not exists inventory_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references weekly_submissions(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  front_qty numeric default 0,
  back_qty numeric default 0,
  order_request numeric default 0,
  updated_at timestamptz default now(),
  unique(submission_id, product_id)
);

-- Store users: link auth users to stores with roles
create table if not exists store_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  role text default 'manager' check (role in ('manager', 'buyer', 'admin')),
  unique(user_id, store_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table stores enable row level security;
alter table products enable row level security;
alter table weekly_submissions enable row level security;
alter table inventory_entries enable row level security;
alter table store_users enable row level security;

-- stores: all authenticated users can read
create policy "stores_read" on stores for select to authenticated using (true);

-- products: all authenticated users can read active products
create policy "products_read" on products for select to authenticated using (active = true);

-- store_users: users can only see their own assignments
create policy "store_users_own" on store_users for select to authenticated
  using (user_id = auth.uid());

-- weekly_submissions: managers see their store, buyers see all
create policy "submissions_manager_read" on weekly_submissions for select to authenticated
  using (
    store_id in (
      select store_id from store_users where user_id = auth.uid()
    )
  );

create policy "submissions_manager_insert" on weekly_submissions for insert to authenticated
  with check (
    store_id in (
      select store_id from store_users where user_id = auth.uid()
    )
  );

create policy "submissions_manager_update" on weekly_submissions for update to authenticated
  using (
    store_id in (
      select store_id from store_users where user_id = auth.uid()
    )
  );

-- inventory_entries: linked to submission access
create policy "entries_read" on inventory_entries for select to authenticated
  using (
    submission_id in (
      select id from weekly_submissions where store_id in (
        select store_id from store_users where user_id = auth.uid()
      )
    )
  );

create policy "entries_write" on inventory_entries for all to authenticated
  using (
    submission_id in (
      select id from weekly_submissions where store_id in (
        select store_id from store_users where user_id = auth.uid()
      )
    )
  );

-- Buyers (role='buyer') can read all submissions and entries
create policy "buyer_submissions_read" on weekly_submissions for select to authenticated
  using (
    exists (
      select 1 from store_users
      where user_id = auth.uid() and role in ('buyer', 'admin')
    )
  );

create policy "buyer_entries_read" on inventory_entries for select to authenticated
  using (
    exists (
      select 1 from store_users
      where user_id = auth.uid() and role in ('buyer', 'admin')
    )
  );

-- products: buyers/admins can insert/update/delete
create policy "products_admin_write" on products for all to authenticated
  using (
    exists (
      select 1 from store_users
      where user_id = auth.uid() and role in ('buyer', 'admin')
    )
  );

-- ============================================================
-- Helper function: auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger entries_updated_at
  before update on inventory_entries
  for each row execute function update_updated_at();
