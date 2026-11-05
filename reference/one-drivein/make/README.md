# Make.com Scenarios

This folder contains the blueprint JSON files for both Make.com automation scenarios.

## Scenario A — Order Receipt (Webhook → Supabase Edge Function)

**File:** `scenario-a-order-receipt.json`

**Trigger:** Webhook (receives POST from customer frontend)

**Flow:**
1. Webhook module receives order payload from the frontend
2. HTTP POST to `process-order` Edge Function
3. Webhook Response back to frontend

**Setup:**
1. Import the blueprint into Make.com
2. Replace `YOUR_WEBHOOK_URL` in the blueprint with your actual webhook URL
3. Replace `YOUR_SUPABASE_PROJECT_REF` with your Supabase project reference
4. Activate the scenario

---

## Scenario B+C — Kitchen Scheduler + No-show Checker

**File:** `scenario-bc-scheduler.json`

**Trigger:** Every 15 minutes (scheduled)

**Flow:**
1. Call `scheduler` Edge Function with `action=kitchenScheduler`
2. Call `scheduler` Edge Function with `action=noshowChecker`
3. Call `scheduler` Edge Function with `action=unavailabilityChecker`

**Setup:**
1. Import the blueprint into Make.com
2. Replace `YOUR_SUPABASE_PROJECT_REF` with your Supabase project reference
3. Set scheduling to every 15 minutes (900 seconds)
4. Activate the scenario

---

## Environment Variables Required in Make.com

No secrets are stored in the blueprints. All sensitive configuration is in Supabase Edge Function secrets:
- `TELEGRAM_BOT_TOKEN`
- `KITCHEN_CHAT_ID`
- `MANAGER_CHAT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Set these in: **Supabase Dashboard → Edge Functions → Your Function → Secrets**

---

## Telegram Bot Webhook Registration

Register the scheduler Edge Function as the Telegram bot webhook so inline button callbacks are received:

```bash
curl "https://api.telegram.org/bot{YOUR_BOT_TOKEN}/setWebhook?url=https://{YOUR_PROJECT_REF}.supabase.co/functions/v1/scheduler"
```
