export type OrderStatus = "confirmed" | "cooking" | "ready" | "completed" | "no_show";
export type OrderType = "preorder" | "now";

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price_cents: number;
  prep_minutes: number;
  station: string;
  allergens: string[];
}

/** In-memory mirror of a drivein_orders row. Money is USD cents. */
export interface DriveInOrder {
  id: string;
  order_number: string;
  customer_name: string;
  car_plate: string;
  car_model: string;
  car_color: string;
  items: OrderItem[];
  special_notes: string;
  eta_time: string;
  eta_timestamp: string;
  kitchen_start_at: string | null;
  ready_by: string | null;
  prep_minutes: number | null;
  buffer_minutes: number | null;
  subtotal_cents: number;
  sales_tax_cents: number;
  grand_total_cents: number;
  currency: "USD";
  status: OrderStatus;
  order_type: OrderType;
  guest_here: boolean;
  arrived_at: string | null;
  schedule_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnavailableItem {
  sku: string;
  name: string;
  station: string;
  reason: string;
  flagged_by: string;
  created_at: string;
}

export interface NewOrderInput {
  customer_name: string;
  car_plate: string;
  car_model: string;
  car_color: string;
  items: OrderItem[];
  special_notes: string;
  eta_timestamp: string;
  eta_time: string;
  subtotal_cents: number;
  sales_tax_cents: number;
  order_type: OrderType;
}
