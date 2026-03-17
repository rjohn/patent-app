import { NextResponse } from 'next/server'

function mask(val: string | undefined): { set: boolean; value: string } {
  if (!val) return { set: false, value: '' }
  if (val.length <= 8) return { set: true, value: '••••••••' }
  return { set: true, value: val.slice(0, 12) + '…' + val.slice(-4) }
}

export async function GET() {
  return NextResponse.json({
    DATABASE_URL:                  mask(process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL:      mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    USPTO_API_KEY:                 mask(process.env.USPTO_API_KEY),
    EPO_OPS_KEY:                   mask(process.env.EPO_OPS_KEY),
    EPO_OPS_SECRET:                mask(process.env.EPO_OPS_SECRET),
    NEXT_PUBLIC_APP_URL:           mask(process.env.NEXT_PUBLIC_APP_URL),
  })
}
