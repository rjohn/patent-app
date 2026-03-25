import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { matchDocket, PatentCandidate } from '@/lib/invoice-matching'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── GET: list all invoices grouped by law firm ────────────────────────────────

export async function GET() {
  try {
    const invoices = await prisma.legalInvoice.findMany({
      orderBy: { invoiceDate: 'desc' },
      include: {
        lineItems: {
          select: {
            id: true,
            docketNumber: true,
            description: true,
            amount: true,
            matchConfidence: true,
            patentId: true,
            patent: { select: { applicationNumber: true, patentNumber: true, title: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    return NextResponse.json({ invoices })
  } catch (e) {
    console.error('[legal-invoices] GET error:', e)
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  }
}

// ── POST: upload PDF invoice, parse with Claude, store ────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const base64 = buf.toString('base64')

    // Load all portfolio patents for docket matching
    const allPatents = await prisma.patent.findMany({
      select: { id: true, applicationNumber: true, patentNumber: true, docketNumber: true, title: true },
    })
    const candidates: PatentCandidate[] = allPatents

    // Parse invoice with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const parsePrompt = `You are a legal billing analyst. Extract structured data from this law firm invoice.

Return ONLY valid JSON matching this exact shape (no markdown, no explanation):
{
  "lawFirm": "string",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "totalAmount": number or null,
  "currency": "USD",
  "lineItems": [
    {
      "docketNumber": "string or null",
      "description": "string",
      "serviceDate": "YYYY-MM-DD or null",
      "hours": number or null,
      "rate": number or null,
      "amount": number or null
    }
  ]
}

Rules:
- Extract every line item. Include subtotals/totals only if they are the only amount.
- docketNumber: the client matter number or docket reference for this line (often looks like a patent app number or a firm code like P-1234 or ABC-US-001).
- If you cannot find the law firm name, use "Unknown".
- Dates must be YYYY-MM-DD format.
- Numbers must be numeric (no currency symbols).`

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            { type: 'text', text: parsePrompt },
          ],
        },
      ],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Extract JSON from response
    let parsed: any
    try {
      // Strip any markdown code fences
      const jsonStr = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[legal-invoices] Claude parse failed, raw:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse invoice data from PDF' }, { status: 422 })
    }

    // Run docket matching for each line item
    const lineItemsData = (parsed.lineItems ?? []).map((item: any) => {
      const match = matchDocket(item.docketNumber, candidates, item.description)
      return {
        docketNumber: item.docketNumber ?? null,
        description: item.description ?? null,
        serviceDate: item.serviceDate ? new Date(item.serviceDate) : null,
        hours: item.hours ?? null,
        rate: item.rate ?? null,
        amount: item.amount ?? null,
        matchConfidence: match.confidence,
        patentId: match.patentId,
      }
    })

    const parseStatus = parsed.lineItems?.length > 0 ? 'PARSED' : 'PARTIAL'

    const invoice = await prisma.legalInvoice.create({
      data: {
        lawFirm: parsed.lawFirm ?? 'Unknown',
        invoiceNumber: parsed.invoiceNumber ?? null,
        invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
        totalAmount: parsed.totalAmount ?? null,
        currency: parsed.currency ?? 'USD',
        parseStatus,
        rawText: rawText,
        pdfData: buf,
        pdfName: file.name,
        lineItems: { create: lineItemsData },
      },
      include: { lineItems: true },
    })

    return NextResponse.json({ invoice })
  } catch (e: any) {
    console.error('[legal-invoices] POST error:', e?.message ?? e)
    const msg = e?.message ?? 'Invoice processing failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
