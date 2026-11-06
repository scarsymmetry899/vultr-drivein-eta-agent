-- ═══════════════════════════════════════════════════════════════════════════════
-- ONE Drive-in Automation — Supabase Schema
-- Run this in your Supabase SQL Editor to set up all tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Orders table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS one_drivein_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT NOT NULL UNIQUE,
  
  -- Customer details
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT,
  telegram_username     TEXT,
  telegram_chat_id      TEXT,
  
  -- Vehicle details
  car_plate             TEXT,
  car_model             TEXT,
  car_color             TEXT,
  
  -- Order details
  items                 JSONB,            -- Array of {name, qty, price, restaurant}
  special_notes         TEXT,
  
  -- Timing
  eta_time              TEXT,             -- Human-readable e.g. "7:30 PM"
  eta_timestamp         TIMESTAMPTZ,      -- ISO timestamp of expected arrival
  kitchen_start_at      TIMESTAMPTZ,      -- When kitchen should start cooking
  
  -- Billing
  subtotal              INTEGER DEFAULT 0,
  gst                   INTEGER DEFAULT 0,
  grand_total           INTEGER DEFAULT 0,
  payment_id            TEXT,
  payment_link          TEXT,
  
  -- Status
  -- Values: confirmed | cooking | ready | completed | no_show
  status                TEXT DEFAULT 'confirmed',
  
  -- Notification flags (prevent duplicate messages)
  kitchen_preview_sent  BOOLEAN DEFAULT FALSE,
  kitchen_start_sent    BOOLEAN DEFAULT FALSE,
  cooking_msg_sent      BOOLEAN DEFAULT FALSE,
  noshow_check_sent     BOOLEAN DEFAULT FALSE,
  noshow_alerted        BOOLEAN DEFAULT FALSE,
  
  -- GPS tracking
  last_lat              FLOAT,
  last_lng              FLOAT,
  last_seen_at          TIMESTAMPTZ,
  proximity_met         BOOLEAN DEFAULT FALSE,
  
  -- Completion tracking
  ready_notified_at     TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completed_by          TEXT,            -- Staff name or 'auto'
  tg_message_id         INTEGER,
  
  -- Order type
  -- Values: preorder | now
  order_type            TEXT DEFAULT 'preorder',
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Unavailable items table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS one_drivein_unavailable (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name   TEXT NOT NULL,
  restaurant  TEXT,
  flagged_by  TEXT,
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS Policies ──────────────────────────────────────────────────────────────
-- Allow all operations (fine for an internal tool; restrict per role for production)
ALTER TABLE one_drivein_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_drivein_unavailable ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_operations ON one_drivein_orders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY allow_all_operations ON one_drivein_unavailable
  FOR ALL USING (true) WITH CHECK (true);

-- ── Indexes for performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON one_drivein_orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_eta_timestamp
  ON one_drivein_orders (eta_timestamp);

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_start_at
  ON one_drivein_orders (kitchen_start_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_number
  ON one_drivein_orders (order_number);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON one_drivein_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
