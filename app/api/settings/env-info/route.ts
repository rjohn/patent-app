import { NextResponse } from 'next/server'

function entry(val: string | undefined): { set: boolean; value: string } {
  return { set: !!val, value: val ?? '' }
}

export async function GET() {
  return NextResponse.json({
    DATABASE_URL:                  entry(process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL:      entry(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: entry(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    USPTO_API_KEY:                 entry(process.env.USPTO_API_KEY),
    EPO_OPS_KEY:                   entry(process.env.EPO_OPS_KEY),
    EPO_OPS_SECRET:                entry(process.env.EPO_OPS_SECRET),
    NEXT_PUBLIC_APP_URL:           entry(process.env.NEXT_PUBLIC_APP_URL),
  })
}
