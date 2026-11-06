-- Running store for Route 66 Drive-In.
-- Portable shape of db/schema.sql. The API opens this file with Node's built-in SQLite.
-- Money is integer USD cents. kitchen_start_at is the solver's fire time.

CREATE TABLE IF NOT EXISTS drivein_orders (
  id                 TEXT PRIMARY KEY,
  order_number       TEXT NOT NULL UNIQUE,
  customer_name      TEXT NOT NULL,
  car_plate          TEXT NOT NULL,
  car_model          TEXT NOT NULL DEFAULT '',
  car_color          TEXT NOT NULL DEFAULT '',
  items              TEXT NOT NULL,
  special_notes      TEXT NOT NULL DEFAULT '',
  eta_time           TEXT NOT NULL DEFAULT '',
  eta_timestamp      TEXT NOT NULL,
  kitchen_start_at   TEXT,
  ready_by           TEXT,
  prep_minutes       INTEGER,
  buffer_minutes     INTEGER,
  subtotal_cents     INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  sales_tax_cents    INTEGER NOT NULL CHECK (sales_tax_cents >= 0),
  grand_total_cents  INTEGER NOT NULL CHECK (grand_total_cents >= 0),
  currency           TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status             TEXT NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('confirmed', 'cooking', 'ready', 'completed', 'no_show')),
  order_type         TEXT NOT NULL DEFAULT 'preorder'
                       CHECK (order_type IN ('preorder', 'now')),
  guest_here         INTEGER NOT NULL DEFAULT 0 CHECK (guest_here IN (0, 1)),
  arrived_at         TEXT,
  schedule_reason    TEXT,
  decision_trail     TEXT,
  fire_hold          INTEGER NOT NULL DEFAULT 0 CHECK (fire_hold IN (0, 1)),
  arrival_opt_in     INTEGER NOT NULL DEFAULT 0 CHECK (arrival_opt_in IN (0, 1)),
  payment_state      TEXT NOT NULL DEFAULT 'pay_at_window'
                       CHECK (payment_state IN ('pay_at_window', 'demo_unpaid', 'demo_marked')),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (grand_total_cents = subtotal_cents + sales_tax_cents)
);

CREATE TABLE IF NOT EXISTS drivein_unavailable (
  sku         TEXT PRIMARY KEY,
  item_name   TEXT NOT NULL,
  station     TEXT,
  reason      TEXT,
  flagged_by  TEXT,
  resolved    INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drivein_orders_status ON drivein_orders (status);
CREATE INDEX IF NOT EXISTS idx_drivein_orders_eta ON drivein_orders (eta_timestamp);
CREATE INDEX IF NOT EXISTS idx_drivein_orders_fire ON drivein_orders (kitchen_start_at);
CREATE INDEX IF NOT EXISTS idx_drivein_orders_plate ON drivein_orders (order_number, car_plate);
