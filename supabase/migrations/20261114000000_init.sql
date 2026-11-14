-- Sorta schema. Every table is scoped by shop_id ('main' = real shop, 'demo' = demo shop).

create table shops (
  id text primary key,
  name text not null,
  cash numeric not null default 0,
  seeded_at timestamptz
);
insert into shops (id, name) values ('main', 'My shop'), ('demo', 'Demo shop');

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references shops (id),
  name text not null,
  aliases text[] not null default '{}',
  quantity numeric not null default 0,
  unit text not null default 'unit',
  buy_price numeric not null default 0,
  mrp numeric not null default 0,
  expiry date,
  shelf text,
  low_stock_threshold numeric not null default 0,
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references shops (id),
  product_id uuid not null references products (id),
  type text not null check (type in ('sale', 'purchase')),
  quantity numeric not null,
  price numeric not null, -- per unit, what the money actually changed hands at
  cost numeric not null,  -- per unit wholesale cost at the time (for realised profit)
  created_at timestamptz not null default now()
);
create index on stock_movements (shop_id, created_at desc);

create table debts (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references shops (id),
  person text not null,
  amount numeric not null,
  direction text not null check (direction in ('i_owe', 'they_owe')),
  due_date date,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create table cash_log (
  id bigserial primary key,
  shop_id text not null references shops (id),
  delta numeric not null,
  balance_after numeric not null,
  reason text,
  created_at timestamptz not null default now()
);

create table action_log (
  seq bigserial primary key,
  id uuid not null unique default gen_random_uuid(),
  shop_id text not null references shops (id),
  kind text not null,
  summary text,
  ops jsonb not null,  -- what was applied
  undo jsonb not null, -- exact inverse ops
  undone boolean not null default false,
  created_at timestamptz not null default now()
);

create table messages (
  seq bigserial primary key,
  shop_id text not null references shops (id),
  role text not null check (role in ('user', 'agent')),
  text text not null,
  action_id uuid,
  created_at timestamptz not null default now()
);

-- No auth yet: open policies for the anon key. Known limitation, see README.
do $$
declare t text;
begin
  foreach t in array array['shops','products','stock_movements','debts','cash_log','action_log','messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy open_all on %I for all using (true) with check (true)', t);
    execute format('grant all on %I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Applies a list of primitive ops atomically and returns the exact inverse ops (in reverse order).
-- ops: {op:'stock', id, delta} | {op:'cash', delta | set, reason}
--    | {op:'insert', table, row} | {op:'delete', table, id} | {op:'update', table, id, patch}
create or replace function apply_ops(p_shop text, p_ops jsonb) returns jsonb
language plpgsql as $$
declare
  op jsonb; inv jsonb := '[]'::jsonb; one jsonb;
  t text; v_delta numeric; v_cash numeric; v_row jsonb; v_cols text;
begin
  for op in select * from jsonb_array_elements(p_ops) loop
    t := op->>'table';
    if t is not null and t not in ('products', 'stock_movements', 'debts') then
      raise exception 'table % not allowed', t;
    end if;
    case op->>'op'
    when 'stock' then
      v_delta := (op->>'delta')::numeric;
      update products set quantity = quantity + v_delta where id = (op->>'id')::uuid and shop_id = p_shop;
      if not found then raise exception 'product not found'; end if;
      one := jsonb_build_object('op', 'stock', 'id', op->'id', 'delta', -v_delta);
    when 'cash' then
      select cash into v_cash from shops where id = p_shop for update;
      if not found then raise exception 'shop not found'; end if;
      v_delta := coalesce((op->>'set')::numeric - v_cash, (op->>'delta')::numeric);
      update shops set cash = cash + v_delta where id = p_shop;
      insert into cash_log (shop_id, delta, balance_after, reason)
        values (p_shop, v_delta, v_cash + v_delta, op->>'reason');
      one := jsonb_build_object('op', 'cash', 'delta', -v_delta, 'reason', 'undo: ' || coalesce(op->>'reason', ''));
    when 'insert' then
      v_row := (op->'row') || jsonb_build_object('shop_id', p_shop);
      execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', t, t) using v_row;
      one := jsonb_build_object('op', 'delete', 'table', t, 'id', v_row->'id');
    when 'delete' then
      execute format('delete from %I x where id = $1 and shop_id = $2 returning to_jsonb(x)', t)
        into v_row using (op->>'id')::uuid, p_shop;
      if v_row is null then raise exception 'row not found'; end if;
      one := jsonb_build_object('op', 'insert', 'table', t, 'row', v_row);
    when 'update' then
      if (op->'patch') ?| array['id', 'shop_id'] then raise exception 'cannot change id'; end if;
      execute format('select to_jsonb(x) from %I x where id = $1 and shop_id = $2 for update', t)
        into v_row using (op->>'id')::uuid, p_shop;
      if v_row is null then raise exception 'row not found'; end if;
      select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(op->'patch') k;
      execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2',
        t, v_cols, v_cols, t) using op->'patch', (op->>'id')::uuid;
      one := jsonb_build_object('op', 'update', 'table', t, 'id', op->'id', 'patch',
        (select jsonb_object_agg(k, v_row->k) from jsonb_object_keys(op->'patch') k));
    else
      raise exception 'unknown op %', op->>'op';
    end case;
    inv := jsonb_build_array(one) || inv;
  end loop;
  return inv;
end $$;

create or replace function do_action(p_shop text, p_kind text, p_summary text, p_ops jsonb) returns action_log
language plpgsql as $$
declare a action_log;
begin
  insert into action_log (shop_id, kind, summary, ops, undo)
    values (p_shop, p_kind, p_summary, p_ops, apply_ops(p_shop, p_ops)) returning * into a;
  return a;
end $$;

-- Undo one action (or the most recent not-yet-undone one when p_action is null).
create or replace function undo_action(p_shop text, p_action uuid default null) returns action_log
language plpgsql as $$
declare a action_log;
begin
  select * into a from action_log
    where shop_id = p_shop and not undone and (p_action is null or id = p_action)
    order by seq desc limit 1 for update;
  if not found then raise exception 'nothing to undo'; end if;
  perform apply_ops(p_shop, a.undo);
  update action_log set undone = true where seq = a.seq returning * into a;
  return a;
end $$;

-- Wipes and reseeds the demo shop. Dates are relative to now so the demo is always "live".
create or replace function reset_demo() returns void
language plpgsql as $$
begin
  delete from messages where shop_id = 'demo';
  delete from action_log where shop_id = 'demo';
  delete from cash_log where shop_id = 'demo';
  delete from stock_movements where shop_id = 'demo';
  delete from debts where shop_id = 'demo';
  delete from products where shop_id = 'demo';

  insert into products (shop_id, name, aliases, quantity, unit, buy_price, mrp, expiry, shelf, low_stock_threshold) values
    ('demo', 'Rice',          array['chawal','chaval','चावल','biyyam','బియ్యం'],                 42, 'kg',     48,  60,  current_date + 240, '1', 10),
    ('demo', 'Wheat Flour',   array['atta','aata','आटा','godhuma pindi','గోధుమ పిండి'],          30, 'kg',     38,  46,  current_date + 90,  '1', 8),
    ('demo', 'Sugar',         array['cheeni','chini','चीनी','shakkar','chakkera','చక్కెర','panchadara','పంచదార'], 4, 'kg', 40, 46, current_date + 300, '1', 10),
    ('demo', 'Salt',          array['namak','नमक','uppu','ఉప్పు'],                                25, 'packet', 18,  25,  current_date + 500, '2', 5),
    ('demo', 'Toor Dal',      array['dal','arhar dal','daal','दाल','अरहर दाल','kandi pappu','pappu','కంది పప్పు','పప్పు'], 18, 'kg', 130, 160, current_date + 200, '2', 5),
    ('demo', 'Tea',           array['chai','chai patti','चाय','चाय पत्ती','tea powder','టీ','టీ పొడి'], 60, 'packet', 8, 10, current_date + 150, '3', 15),
    ('demo', 'Milk',          array['doodh','dudh','दूध','paalu','palu','పాలు'],                  3,  'packet', 26,  30,  current_date + 1,   '6', 8),
    ('demo', 'Curd',          array['dahi','दही','perugu','పెరుగు'],                              6,  'packet', 22,  28,  current_date - 1,   '6', 4),
    ('demo', 'Bread',         array['double roti','ब्रेड','डबल रोटी','బ్రెడ్'],                    7,  'packet', 32,  40,  current_date + 2,   '6', 4),
    ('demo', 'Eggs',          array['egg','anda','ande','अंडा','अंडे','guddu','guddlu','గుడ్డు','గుడ్లు'], 9, 'dozen', 66, 84, current_date + 12, '6', 3),
    ('demo', 'Sunflower Oil', array['oil','tel','तेल','nune','noone','నూనె'],                     14, 'litre',  128, 150, current_date + 210, '4', 5),
    ('demo', 'Biscuits',      array['biscuit','biskut','बिस्कुट','parle g','బిస్కెట్','బిస్కెట్లు'],   80, 'packet', 8,   10,  current_date + 75,  '3', 20),
    ('demo', 'Soap',          array['sabun','साबुन','sabbu','సబ్బు'],                             22, 'unit',   28,  38,  current_date + 600, '5', 6),
    ('demo', 'Detergent',     array['washing powder','surf','सर्फ','डिटर्जेंट','సర్ఫ్'],            2,  'packet', 52,  65,  current_date + 400, '5', 5),
    ('demo', 'Maggi Noodles', array['maggi','noodles','मैगी','నూడుల్స్','మ్యాగీ'],                 36, 'packet', 12,  15,  current_date + 5,   '3', 12),
    ('demo', 'Turmeric',      array['haldi','हल्दी','pasupu','పసుపు'],                            15, 'packet', 22,  30,  current_date + 320, '2', 4),
    ('demo', 'Chilli Powder', array['mirchi','lal mirch','मिर्च','लाल मिर्च','karam','కారం'],       12, 'packet', 30,  42,  current_date + 280, '2', 4),
    ('demo', 'Onion',         array['onions','pyaz','pyaaz','प्याज','ullipaya','ullipayalu','ఉల్లిపాయ','ఉల్లిపాయలు'], 35, 'kg', 28, 40, null, '7', 10),
    ('demo', 'Potato',        array['potatoes','aloo','alu','आलू','bangaladumpa','బంగాళదుంప'],    28, 'kg',     22,  32,  null,               '7', 10),
    ('demo', 'Toothpaste',    array['colgate','टूथपेस्ट','టూత్‌పేస్ట్','paste'],                    11, 'unit',   78,  95,  current_date + 450, '5', 3);

  -- Two weeks of sales, deterministic pseudo-random per product per day.
  insert into stock_movements (shop_id, product_id, type, quantity, price, cost, created_at)
  select 'demo', p.id, 'sale',
         1 + abs(hashtext(p.name || 'q' || d)) % 4, p.mrp, p.buy_price,
         least(date_trunc('day', now()) - d * interval '1 day' + interval '4 hours'
                 + (abs(hashtext(p.name || 't' || d)) % 600) * interval '1 minute',
               now() - (5 + abs(hashtext(p.name || 't' || d)) % 90) * interval '1 minute')
  from products p, generate_series(0, 13) d
  where p.shop_id = 'demo' and abs(hashtext(p.name || 's' || d)) % 4 <> 0;

  insert into debts (shop_id, person, amount, direction, due_date, settled, created_at) values
    ('demo', 'Ramesh Traders', 2400, 'i_owe',    current_date + 1, false, now() - interval '9 days'),
    ('demo', 'Anil Dairy',     900,  'i_owe',    current_date + 9, false, now() - interval '3 days'),
    ('demo', 'Suresh',         500,  'they_owe', current_date + 5, false, now() - interval '4 days'),
    ('demo', 'Lakshmi',        180,  'they_owe', current_date - 2, false, now() - interval '12 days'),
    ('demo', 'Priya',          350,  'they_owe', current_date - 6, true,  now() - interval '15 days');

  update shops set cash = 6350, seeded_at = now() where id = 'demo';
  insert into cash_log (shop_id, delta, balance_after, reason) values ('demo', 6350, 6350, 'opening balance');
end $$;

grant execute on function apply_ops, do_action, undo_action, reset_demo to anon, authenticated;

select reset_demo();
