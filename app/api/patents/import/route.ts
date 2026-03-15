import { NextRequest, NextResponse } from 'next/server'
import { parseUSPTOXml, parseUSPTOJson } from '@/lib/uspto-parser'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'
import { PatentStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const content = await file.text()
    const isXml = file.name.endsWith('.xml')
    const isJson = file.name.endsWith('.json')

    if (!isXml && !isJson) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    // Parse the file
    let parseResult
    if (isXml) {
      parseResult = await parseUSPTOXml(content)
    } else {
      const jsonData = JSON.parse(content)
      parseResult = parseUSPTOJson(jsonData)
    }

    // Record the upload
    // Note: In production, get userId from session
    // const upload = await prisma.dataUpload.create({ ... })

    // Import parsed patents
    let imported = 0
    const errors = [...parseResult.errors]

    for (const patent of parseResult.patents) {
      try {
        // Upsert patent — update if exists (by patent number or application number)
        const existing = await prisma.patent.findFirst({
          where: {
            OR: [
              patent.patentNumber ? { patentNumber: patent.patentNumber } : {},
              patent.applicationNumber ? { applicationNumber: patent.applicationNumber } : {},
            ].filter(c => Object.keys(c).length > 0),
          },
        })

        const patentData = {
          title: patent.title,
          abstract: patent.abstract,
          status: patent.status,
          type: patent.type,
          filingDate: patent.filingDate,
          publicationDate: patent.publicationDate,
          grantDate: patent.grantDate,
          expirationDate: patent.expirationDate,
          priorityDate: patent.priorityDate,
          inventors: patent.inventors,
          assignee: patent.assignee,
          cpcCodes: patent.cpcCodes,
          uspcCodes: patent.uspcCodes,
          continuationType: patent.continuationType,
          rawXmlData: patent.rawXmlData,
        }

        let savedPatent
        if (existing) {
          savedPatent = await prisma.patent.update({
            where: { id: existing.id },
            data: patentData,
          })
        } else {
          savedPatent = await prisma.patent.create({
            data: {
              ...patentData,
              patentNumber: patent.patentNumber,
              applicationNumber: patent.applicationNumber,
              publicationNumber: patent.publicationNumber,
            },
          })
        }

        // Auto-generate maintenance fees for granted utility patents
        if (
          savedPatent.status === PatentStatus.GRANTED && 
          savedPatent.grantDate &&
          savedPatent.type === 'UTILITY'
        ) {
          const fees = calculateMaintenanceFees(savedPatent.grantDate)
          for (const fee of fees) {
            await prisma.maintenanceFee.upsert({
              where: {
                // Use a compound unique — in production add @unique to schema
                id: `${savedPatent.id}-${fee.feeType}`,
              },
              create: {
                patentId: savedPatent.id,
                feeType: fee.feeType as any,
                dueDate: fee.dueDate,
                gracePeriodEnd: fee.gracePeriodEnd,
              },
              update: {
                dueDate: fee.dueDate,
                gracePeriodEnd: fee.gracePeriodEnd,
              },
            }).catch(() => {
              // Skip duplicate fee errors
            })
          }
        }

        imported++
      } catch (e) {
        errors.push(`Failed to save "${patent.title}": ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }

    return NextResponse.json({
      total: parseResult.totalFound,
      imported,
      failed: parseResult.totalFound - imported,
      errors,
    })

  } catch (e) {
    console.error('Import error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Import failed' },
      { status: 500 }
    )
  }
}
