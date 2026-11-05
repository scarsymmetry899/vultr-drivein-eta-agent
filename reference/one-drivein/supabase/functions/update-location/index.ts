import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DRIVEIN_LAT  = parseFloat(Deno.env.get('DRIVEIN_LAT')  ?? '17.4318')
const DRIVEIN_LNG  = parseFloat(Deno.env.get('DRIVEIN_LNG')  ?? '78.4082')
const PROXIMITY_KM = parseFloat(Deno.env.get('PROXIMITY_KM') ?? '5')

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { order_number, lat, lng } = await req.json()
    if (!order_number || !lat || !lng) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_number, lat, lng required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const dist        = distanceKm(lat, lng, DRIVEIN_LAT, DRIVEIN_LNG)
    const proximityMet = dist <= PROXIMITY_KM

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await supabase.from('one_drivein_orders').update({
      last_lat:      lat,
      last_lng:      lng,
      last_seen_at:  new Date().toISOString(),
      proximity_met: proximityMet,
    }).eq('order_number', order_number)

    return new Response(
      JSON.stringify({
        success: true,
        distance_km: Math.round(dist * 10) / 10,
        proximity_met: proximityMet,
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('update-location error:', String(err))
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
