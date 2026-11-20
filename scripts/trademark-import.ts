// Loads the output of scripts/trademark-scan.ts into the Trademark table.
//
//   npx tsx --env-file=.env.local scripts/trademark-import.ts --in tm-matches.jsonl --list
//   npx tsx --env-file=.env.local scripts/trademark-import.ts --in tm-matches.jsonl
//
// Options:
//   --in <file>      JSONL from trademark-scan (required)
//   --list           print every candidate (latest record per serial) and exit without writing
//   --owner <regex>  import marks whose CURRENT owner matches (default: TRADEMARK_OWNER_PATTERN env or "plasmology4")
//   --serial <n>     also import this serial regardless of owner (repeatable)

import fs from 'node:fs'
import readline from 'node:readline'
import { prisma } from '../lib/prisma'
import { parseCaseFile, currentOwners, upsertTrademarkRecord, recordToColumns } from '../lib/trademarks'
import { ownerPattern } from '../lib/trademark-refresh'

async function main() {
  const a = process.argv.slice(2)
  let input = '', list = false, owner = ownerPattern().source
  const serials: string[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--in') input = a[++i]
    else if (a[i] === '--list') list = true
    else if (a[i] === '--owner') owner = a[++i]
    else if (a[i] === '--serial') serials.push(a[++i].replace(/\D/g, ''))
    else throw new Error(`Unknown option ${a[i]}`)
  }
  if (!input) throw new Error('--in <file> is required')
  const ownerRe = new RegExp(owner, 'i')

  // Latest record per serial (by transaction date).
  const latest = new Map<string, { transactionDate: string; xml: string }>()
  const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    const prev = latest.get(r.serial)
    if (!prev || r.transactionDate >= prev.transactionDate) latest.set(r.serial, r)
  }

  const records = await Promise.all(Array.from(latest.values()).map(r => parseCaseFile(r.xml)))
  records.sort((x, y) => (x.header['filing-date'] ?? '').localeCompare(y.header['filing-date'] ?? ''))

  const selected = records.filter(r =>
    serials.includes(r.serialNumber) || currentOwners(r).some(o => ownerRe.test(o.name)))

  if (list) {
    for (const r of records) {
      const c = recordToColumns(r)
      const mark = selected.includes(r) ? '✓' : ' '
      console.log(`${mark} ${r.serialNumber}  reg ${(c.registrationNumber ?? '—').padEnd(8)} ${(c.status).padEnd(10)} ${(c.markText ?? '(design)').slice(0, 40).padEnd(40)}  ${c.owner}`)
    }
    console.log(`\n${records.length} candidates, ${selected.length} selected (✓) by owner /${owner}/i${serials.length ? ' or --serial' : ''}`)
    return
  }

  const tally: Record<string, number> = {}
  for (const r of selected) {
    const res = await upsertTrademarkRecord(r, 'IMPORTED')
    tally[res] = (tally[res] ?? 0) + 1
    console.log(`${res.padEnd(9)} ${r.serialNumber} ${r.header['mark-identification'] ?? '(design)'}`)
  }
  await prisma.$disconnect()
  console.log(tally)
}

main().catch(e => { console.error(e); process.exit(1) })
