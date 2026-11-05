import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config — loaded from Supabase secrets ─────────────────────────────────────
const TELEGRAM_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const KITCHEN_CHAT_ID = Deno.env.get('KITCHEN_CHAT_ID') ?? ''
const MANAGER_CHAT_ID = Deno.env.get('MANAGER_CHAT_ID') ?? ''
const DRIVEIN_LAT     = parseFloat(Deno.env.get('DRIVEIN_LAT') ?? '17.4318')
const DRIVEIN_LNG     = parseFloat(Deno.env.get('DRIVEIN_LNG') ?? '78.4082')
const PROXIMITY_KM    = parseFloat(Deno.env.get('PROXIMITY_KM') ?? '5')

const knownUsers: Record<string, string> = {
  // 'yourusername': 'your_chat_id',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveChatId(username: string): string {
  if (!username?.trim()) return ''
  if (/^-?\d+$/.test(username.trim())) return username.trim()
  return knownUsers[username.replace('@','').toLowerCase().trim()] || ''
}

async function sendTelegram(
  chatId: string,
  text: string,
  inlineButtons?: { text: string; callback_data: string }[][]
): Promise<number | null> {
  if (!chatId?.trim()) return null
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'Markdown' }
  if (inlineButtons) {
    body.reply_markup = { inline_keyboard: inlineButtons }
  }
  const res  = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return data.ok ? data.result.message_id : null
}

async function answerCallback(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// ── Telegram callback handler ─────────────────────────────────────────────────
async function handleCallback(body: Record<string, unknown>) {
  const cq         = body.callback_query as Record<string, unknown>
  const data       = cq?.data as string
  const from       = cq?.from as Record<string, unknown>
  const cbId       = cq?.id as string
  const personName = ((from?.first_name as string) || '') + ' ' + ((from?.last_name as string) || '')

  if (!data) return

  if (data.startsWith('collected:') || data.startsWith('noshow:')) {
    const [action, orderNum] = data.split(':')
    const isCollected        = action === 'collected'

    await supabase.from('one_drivein_orders').update({
      status:        isCollected ? 'completed' : 'no_show',
      completed_at:  new Date().toISOString(),
      completed_by:  isCollected ? personName.trim() : 'confirmed_noshow',
    }).eq('order_number', orderNum)

    await answerCallback(cbId, isCollected ? '✅ Marked as collected!' : '❌ Marked as no-show')

    const statusMsg = isCollected
      ? `✅ *Order #${orderNum} COLLECTED* by ${personName.trim()}`
      : `❌ *Order #${orderNum}* confirmed as NO-SHOW`
    await sendTelegram(MANAGER_CHAT_ID, statusMsg)
  }
}

// ── Kitchen scheduler ─────────────────────────────────────────────────────────
async function runKitchenScheduler() {
  const now = new Date()
  const { data: orders } = await supabase
    .from('one_drivein_orders')
    .select('*')
    .eq('status', 'confirmed')
    .eq('kitchen_start_sent', false)
    .lte('kitchen_start_at', now.toISOString())

  for (const order of orders || []) {
    // Check GPS proximity
    const gpsStale = !order.last_seen_at ||
      (now.getTime() - new Date(order.last_seen_at).getTime()) > 10 * 60 * 1000
    const isNear   = !gpsStale && order.last_lat && order.last_lng &&
      distanceKm(order.last_lat, order.last_lng, DRIVEIN_LAT, DRIVEIN_LNG) <= PROXIMITY_KM

    // Always start on timer — GPS is a bonus signal, not a gate
    const startMsg = order.kitchen_start_msg ||
      `🔥 *START NOW — ORDER ${order.order_number}*\nCar: *${order.car_plate}*`

    const buttons = [[
      { text: '✅ Mark as Collected', callback_data: `collected:${order.order_number}` },
    ]]
    await sendTelegram(KITCHEN_CHAT_ID, startMsg, buttons)

    // Customer notification
    const custChatId = resolveChatId(order.telegram_username || '')
    if (custChatId) {
      const custButtons = [[
        { text: '✅ I\'ve collected my order', callback_data: `collected:${order.order_number}` },
      ]]
      await sendTelegram(
        custChatId,
        `🔥 *We are cooking your order now!*\n\nOrder: *#${order.order_number}*\nDrive straight to the collection counter.\n\nCar on file: *${order.car_plate}*\n\nSee you soon! 🚗`,
        custButtons
      )
    }

    // Manager note if customer is far away
    if (!isNear && !gpsStale) {
      await sendTelegram(
        MANAGER_CHAT_ID,
        `⚠️ *${order.order_number}* — Started cooking but customer appears >5km away.\nCar: *${order.car_plate}*`
      )
    }

    await supabase.from('one_drivein_orders').update({
      status:             'cooking',
      kitchen_start_sent: true,
      kitchen_start_at:   order.kitchen_start_at || now.toISOString(),
      cooking_msg_sent:   true,
    }).eq('id', order.id)
  }
}

// ── No-show checker ───────────────────────────────────────────────────────────
async function runNoshowChecker() {
  const now = new Date()

  const { data: orders } = await supabase
    .from('one_drivein_orders')
    .select('*')
    .in('status', ['confirmed', 'cooking'])
    .lt('eta_timestamp', now.toISOString())

  for (const order of orders || []) {
    const eta     = new Date(order.eta_timestamp)
    const minsOver = (now.getTime() - eta.getTime()) / 60000

    // ETA+15 — first check
    if (minsOver >= 15 && minsOver < 30 && !order.noshow_check_sent) {
      const custChatId = resolveChatId(order.telegram_username || '')
      const buttons    = [[
        { text: '✅ Yes, collected!', callback_data: `collected:${order.order_number}` },
        { text: '❌ No, still coming', callback_data: `noshow:${order.order_number}` },
      ]]
      if (custChatId) {
        await sendTelegram(
          custChatId,
          `🧐 *Order #${order.order_number}* — Have you collected your food?`,
          buttons
        )
      }
      await sendTelegram(
        KITCHEN_CHAT_ID,
        `⏰ *${order.order_number}* — 15 min past ETA. Has car *${order.car_plate}* collected?`,
        [[{ text: '✅ Mark as Collected', callback_data: `collected:${order.order_number}` }]]
      )
      await supabase.from('one_drivein_orders')
        .update({ noshow_check_sent: true })
        .eq('id', order.id)
    }

    // ETA+30 — manager alert
    if (minsOver >= 30 && minsOver < 45 && !order.noshow_alerted) {
      await sendTelegram(
        MANAGER_CHAT_ID,
        `⚠️ *POSSIBLE NO-SHOW — ${order.order_number}*\nCar: *${order.car_plate}*\n30 min past ETA. Please verify.`,
        [[
          { text: '✅ Collected', callback_data: `collected:${order.order_number}` },
          { text: '❌ No-show', callback_data: `noshow:${order.order_number}` },
        ]]
      )
      await supabase.from('one_drivein_orders')
        .update({ noshow_alerted: true })
        .eq('id', order.id)
    }

    // ETA+45 — auto-close as no_show
    if (minsOver >= 45 && !['completed', 'no_show'].includes(order.status)) {
      await supabase.from('one_drivein_orders').update({
        status:       'no_show',
        completed_at: now.toISOString(),
        completed_by: 'auto',
      }).eq('id', order.id)
      await sendTelegram(
        MANAGER_CHAT_ID,
        `🚫 *${order.order_number}* auto-closed as NO-SHOW (45+ min past ETA)\nCar: *${order.car_plate}*`
      )
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = req.method === 'POST' ? await req.json() : {}

    // Telegram callback_query (inline button taps)
    if (body.callback_query) {
      await handleCallback(body)
      return new Response('ok', { headers: cors })
    }

    // Scheduled run from Make.com (every 15 min)
    const action = new URL(req.url).searchParams.get('action') || body.action

    if (!action || action === 'kitchenScheduler') await runKitchenScheduler()
    if (!action || action === 'noshowChecker')    await runNoshowChecker()

    return new Response(
      JSON.stringify({ success: true, ran_at: new Date().toISOString() }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('scheduler error:', String(err))
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
