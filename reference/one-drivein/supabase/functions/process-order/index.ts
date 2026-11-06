import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config — loaded from Supabase secrets (never hardcode) ────────────────────
const TELEGRAM_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const KITCHEN_CHAT_ID = Deno.env.get('KITCHEN_CHAT_ID') ?? ''
const MANAGER_CHAT_ID = Deno.env.get('MANAGER_CHAT_ID') ?? ''

// Known Telegram username → chat_id mappings (extend as needed)
const knownUsers: Record<string, string> = {
  // 'yourusername': 'your_chat_id',
}

function resolveChatId(username: string): string {
  if (!username?.trim()) return ''
  if (/^-?\d+$/.test(username.trim())) return username.trim()
  return knownUsers[username.replace('@', '').toLowerCase().trim()] || ''
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!chatId?.trim()) return false
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    }
  )
  const data = await res.json()
  console.log(`TG → ${chatId}: ${data.ok ? '✓' : JSON.stringify(data)}`)
  return data.ok
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    let p: Record<string, string> = {}
    if (req.method === 'POST') p = await req.json()
    else new URL(req.url).searchParams.forEach((v, k) => { p[k] = v })

    const isNow = p.order_type === 'now'
    console.log(`Order: ${p.order_number} | Type: ${p.order_type} | Customer: ${p.customer_name}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const orderNumber = p.order_number || ('ONE' + Math.floor(10000 + Math.random() * 90000))

    // Insert order into database
    const { error } = await supabase.from('one_drivein_orders').insert({
      order_number:       orderNumber,
      customer_name:      p.customer_name    || '',
      customer_phone:     p.customer_phone   || '',
      car_plate:          p.car_plate        || '',
      car_model:          p.car_model        || '',
      car_color:          p.car_color        || '',
      telegram_username:  p.telegram_username || '',
      special_notes:      p.special_notes    || '',
      eta_time:           p.eta_time         || '',
      eta_timestamp:      p.eta_timestamp    || new Date().toISOString(),
      kitchen_start_at:   p.kitchen_start_at || new Date().toISOString(),
      subtotal:           parseInt(p.subtotal)    || 0,
      gst:                parseInt(p.gst)         || 0,
      grand_total:        parseInt(p.grand_total) || 0,
      // Order Now: start cooking immediately; Pre-order: wait for scheduler
      status:             isNow ? 'cooking' : 'confirmed',
      kitchen_start_sent: isNow,
      cooking_msg_sent:   isNow,
    })

    if (error) {
      console.error('DB error:', error.message)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Order inserted:', orderNumber, '| type:', p.order_type)

    // Send customer confirmation via Telegram (if username provided)
    const custChatId = resolveChatId(p.telegram_username || '')
    if (custChatId) {
      await sendTelegram(custChatId, p.cust_confirm_msg || `✅ Order #${orderNumber} confirmed!`)
    }

    // Send kitchen message
    await sendTelegram(KITCHEN_CHAT_ID, p.kitchen_preview_msg || `📋 ORDER ${orderNumber} | Car: ${p.car_plate}`)

    // Order Now: also notify manager immediately
    if (isNow) {
      await sendTelegram(
        MANAGER_CHAT_ID,
        `⚡ *ORDER NOW — ${orderNumber}* received and sent to kitchen.\nCar: *${p.car_plate}* | Total: ₹${p.grand_total}`
      )
    }

    return new Response(
      JSON.stringify({ success: true, order_number: orderNumber, order_type: p.order_type }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('process-order error:', String(err))
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
