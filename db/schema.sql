-- Route 66 Drive-In (Austin, TX) — order schema
-- Conceptual port of reference/one-drivein/supabase/migrations/001_initial_schema.sql
--
-- This file is the Postgres shape for a later database on the Vultr VM.
-- The scaffold API keeps orders in memory and does not open a database connection.
-- PostgreSQL 13+ (gen_random_uuid is built in).
--
-- Money is integer USD cents. Tax is sales_tax_cents.
-- kitchen_start_at is the fire time the sandbox solver writes. Clients do not send it.
-- drivein_unavailable is the 86 list (kitchen term for sold out).

CREATE TABLE IF NOT EXISTS drivein_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT NOT NULL UNIQUE,

  customer_name         TEXT NOT NULL,
  car_plate             TEXT NOT NULL,
  car_model             TEXT NOT NULL DEFAULT '',
  car_color             TEXT NOT NULL DEFAULT '',

  -- [{sku, name, qty, price_cents, prep_minutes, station, allergens}]
  items                 JSONB NOT NULL,
  special_notes         TEXT NOT NULL DEFAULT '',

  eta_time              TEXT NOT NULL DEFAULT '',
  eta_timestamp         TIMESTAMPTZ NOT NULL,
  kitchen_start_at      TIMESTAMPTZ,
  ready_by              TIMESTAMPTZ,
  prep_minutes          INTEGER,
  buffer_minutes        INTEGER,

  subtotal_cents        INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  sales_tax_cents       INTEGER NOT NULL DEFAULT 0 CHECK (sales_tax_cents >= 0),
  grand_total_cents     INTEGER NOT NULL DEFAULT 0 CHECK (grand_total_cents >= 0),
  currency              TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),

  -- confirmed | cooking | ready | completed | no_show
  -- The kitchen board maps these to waiting (confirmed), firing (cooking), ready.
  status                TEXT NOT NULL DEFAULT 'confirmed'
                          CHECK (status IN ('confirmed', 'cooking', 'ready', 'completed', 'no_show')),

  -- preorder: guest is on the way. now: guest is at the stall.
  order_type            TEXT NOT NULL DEFAULT 'preorder'
                          CHECK (order_type IN ('preorder', 'now')),

  guest_here            BOOLEAN NOT NULL DEFAULT FALSE,
  arrived_at            TIMESTAMPTZ,
  schedule_reason       TEXT,

  -- Unused by this scaffold. Continuous GPS from the Hyderabad app is not ported.
  last_lat              DOUBLE PRECISION,
  last_lng              DOUBLE PRECISION,
  last_seen_at          TIMESTAMPTZ,
  proximity_met         BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT drivein_orders_total_chk
    CHECK (grand_total_cents = subtotal_cents + sales_tax_cents),
  CONSTRAINT drivein_orders_prep_chk
    CHECK (prep_minutes IS NULL OR prep_minutes > 0)
);

-- 86 list. resolved = false means the item is off the menu right now.
CREATE TABLE IF NOT EXISTS drivein_unavailable (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_sku    TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  station     TEXT,
  reason      TEXT,
  flagged_by  TEXT,
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deny by default. Add a service-role policy when a database is attached.
ALTER TABLE drivein_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivein_unavailable  ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_drivein_orders_status
  ON drivein_orders (status);

CREATE INDEX IF NOT EXISTS idx_drivein_orders_eta_timestamp
  ON drivein_orders (eta_timestamp);

CREATE INDEX IF NOT EXISTS idx_drivein_orders_kitchen_start_at
  ON drivein_orders (kitchen_start_at);

CREATE INDEX IF NOT EXISTS idx_drivein_orders_order_number
  ON drivein_orders (order_number);

CREATE INDEX IF NOT EXISTS idx_drivein_unavailable_open
  ON drivein_unavailable (item_sku)
  WHERE resolved = FALSE;

CREATE OR REPLACE FUNCTION drivein_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS drivein_orders_set_updated_at ON drivein_orders;
CREATE TRIGGER drivein_orders_set_updated_at
  BEFORE UPDATE ON drivein_orders
  FOR EACH ROW EXECUTE PROCEDURE drivein_set_updated_at();
