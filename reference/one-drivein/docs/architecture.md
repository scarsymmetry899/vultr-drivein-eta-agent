# Architecture Deep Dive

## Order Flow — Pre-order

```
1. Customer opens app → selects Pre-order
2. Browses 10 counters → adds items to cart
3. Fills: Name, Phone, Car Plate, Arrival Time, Telegram
4. Taps Pay → frontend builds payload
5. POST to /process-order Edge Function
   ├── Inserts order to Supabase (status: confirmed)
   ├── Sends kitchen PREVIEW message via Telegram
   └── Sends customer CONFIRMATION via Telegram
6. Customer browser starts GPS watchPosition()
7. Every 3 min → POST /update-location with lat/lng
8. Every 15 min → Make.com triggers /scheduler
9. Scheduler checks: kitchen_start_at <= now?
   └── YES → sends START message to kitchen + customer
10. Customer taps "✅ Collected" → scheduler handles callback
    ├── Updates Supabase status=completed
    └── Notifies manager
```

## Order Flow — Order Now

```
1. Customer selects Order Now (already at drive-in)
2. Adds items → fills Name, Phone, Car Plate
3. Taps Pay → frontend sets:
   - eta_time = "Now"
   - kitchen_start_at = now + 1min
   - order_type = "now"
4. POST to /process-order Edge Function
   ├── Inserts order (status: cooking, kitchen_start_sent: true)
   ├── Sends "🔥 ORDER NOW — START IMMEDIATELY" to kitchen
   ├── Sends "Your order is in progress, ready in ~X minutes" to customer
   └── Notifies manager
5. No GPS tracking (customer is already there)
```

## GPS Timing Logic

The scheduler uses a combined GPS + timer approach:

```
Timer fired (kitchen_start_at <= now)?
  YES → ALWAYS start cooking (timer is the guarantee)
    Customer also nearby (<5km, GPS fresh)?
      YES → Ideal — start cooking, customer arriving soon
      NO + GPS data exists → Start + nudge customer + warn manager
      NO + no GPS data → Start, timer decides (customer may have closed browser)
  NO → Don't start yet
    Customer already close? → Mark proximity_met=true, wait for timer
```

**Why timer is always the override:**
GPS tracking can fail (browser closed, permission denied, poor signal). The timer ensures food is always started at the right time. GPS is a bonus signal that enables "start early if customer is already close" — but never a blocker.

## Telegram Architecture

```
Telegram Bot
├── Kitchen Group (KITCHEN_CHAT_ID)
│   ├── Preview message on order received
│   ├── START NOW message (with inline button)
│   └── No-show check at ETA+15
│
├── Manager Personal (MANAGER_CHAT_ID)
│   ├── Order Now notification
│   ├── GPS warning (customer far when cooking starts)
│   ├── No-show alert at ETA+30
│   └── Auto-close notification at ETA+45
│
└── Customer (resolved from telegram_username)
    ├── Order confirmation
    ├── "We're cooking now!" + collected button
    └── "Have you collected?" check at ETA+15
```

## Database Design Decisions

**Single table for orders:**
All order state lives in `one_drivein_orders`. No separate tables for order_items, events, or history. This keeps queries simple for a single-outlet system.

**JSONB for items:**
Items are stored as JSONB `[{name, qty, price, restaurant}]` rather than a normalised order_items table. The item list is append-only after order placement, so normalisation adds complexity without benefit at this scale.

**Boolean notification flags:**
Fields like `kitchen_start_sent`, `noshow_alerted` prevent duplicate messages. The scheduler checks these flags before sending any Telegram message.

**GPS columns directly on order:**
`last_lat`, `last_lng`, `last_seen_at`, `proximity_met` are denormalised onto the order row. GPS is polled every 3 minutes per order — at 50 concurrent orders that's still only one update per second. Separate GPS table not needed at this scale.
