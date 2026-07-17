import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { token?: string; pages?: number }
  const { token, pages = 0 } = body

  const allowedTokens = (process.env.ALLOWED_TOKENS ?? '')
    .split(',').map(t => t.trim()).filter(Boolean)

  if (!token || !allowedTokens.includes(token)) {
    return NextResponse.json(
      { allowed: false, reason: 'invalid_token' },
      { status: 403, headers: CORS }
    )
  }

  const limit = Number(process.env.PAGE_LIMIT ?? '100')
  const key = `pages:${token}`

  try {
    const used: number = (await kv.get<number>(key)) ?? 0

    if (used + pages > limit) {
      return NextResponse.json(
        { allowed: false, reason: 'limit_reached', pagesUsed: used, pagesLimit: limit },
        { headers: CORS }
      )
    }

    if (pages > 0) await kv.incrby(key, pages)

    return NextResponse.json(
      { allowed: true, pagesUsed: used + pages, pagesLimit: limit },
      { headers: CORS }
    )
  } catch {
    // KV not configured yet — allow but don't track pages
    return NextResponse.json(
      { allowed: true, pagesUsed: 0, pagesLimit: limit },
      { headers: CORS }
    )
  }
}
