// One-time trademark backfill scan.
//
// Streams the USPTO annual trademark backfile (TRTYRAP) plus every daily file
// (TRTDXFAP) since, and writes each matching <case-file> block to a JSONL file.
// Feed the output to scripts/trademark-import.ts to load it into the database.
//
//   npx tsx --env-file=.env.local scripts/trademark-scan.ts --out tm-matches.jsonl
//   npx tsx --env-file=.env.local scripts/trademark-scan.ts --out x.jsonl --serial 85943865 --serial 87475893
//
// Options:
//   --out <file>       output JSONL (required). A <file>.progress sidecar makes reruns resume.
//   --owner <regex>    case-insensitive regex matched against each record (default: Plasmology4 names/marks)
//   --serial <n>       also match this serial number (repeatable)
//   --concurrency <n>  parallel downloads (default 4)
//   --daily-only       skip the annual backfile

import fs from 'node:fs'
import {
  ANNUAL_PRODUCT, DAILY_PRODUCT, BulkFile, listBulkFiles, scanBulkZip, blockSerial, blockTransactionDate,
} from '../lib/trademark-bulk'

const DEFAULT_OWNER = 'plasmology|plaz4|cold plasma medical'

function parseArgs() {
  const a = process.argv.slice(2)
  const opts = { out: '', owner: DEFAULT_OWNER, serials: [] as string[], concurrency: 4, dailyOnly: false }
  for (let i = 0; i < a.length; i++) {
    switch (a[i]) {
      case '--out':         opts.out = a[++i]; break
      case '--owner':       opts.owner = a[++i]; break
      case '--serial':      opts.serials.push(a[++i].replace(/\D/g, '')); break
      case '--concurrency': opts.concurrency = parseInt(a[++i], 10) || 4; break
      case '--daily-only':  opts.dailyOnly = true; break
      default: throw new Error(`Unknown option ${a[i]}`)
    }
  }
  if (!opts.out) throw new Error('--out <file> is required')
  return opts
}

/** Latest annual backfile set, e.g. all apc18840407-20251231-NN.zip. */
async function latestAnnualSet(): Promise<{ files: BulkFile[]; through: string }> {
  const all = await listBulkFiles(ANNUAL_PRODUCT)
  const ends = all.map(f => f.fileName.match(/^apc\d{8}-(\d{8})-/)?.[1]).filter(Boolean) as string[]
  const through = ends.sort().at(-1)!
  return { files: all.filter(f => f.fileName.includes(`-${through}-`)), through }
}

async function main() {
  const opts = parseArgs()
  const ownerRe = new RegExp(opts.owner, 'i')
  const serialTags = opts.serials.map(s => `<serial-number>${s}</serial-number>`)
  const match = (block: string) => ownerRe.test(block) || serialTags.some(t => block.includes(t))

  const files: BulkFile[] = []
  let dailyFrom = '2025-01-01'
  if (!opts.dailyOnly) {
    const { files: annual, through } = await latestAnnualSet()
    files.push(...annual)
    const d = new Date(`${through.slice(0, 4)}-${through.slice(4, 6)}-${through.slice(6, 8)}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    dailyFrom = d.toISOString().slice(0, 10)
    console.log(`Annual backfile through ${through}: ${annual.length} files`)
  }
  const today = new Date().toISOString().slice(0, 10)
  const daily = await listBulkFiles(DAILY_PRODUCT, dailyFrom, today)
  files.push(...daily)
  console.log(`Daily files ${dailyFrom} → ${today}: ${daily.length} files`)

  const progressPath = `${opts.out}.progress`
  const done = new Set(fs.existsSync(progressPath) ? fs.readFileSync(progressPath, 'utf8').split('\n').filter(Boolean) : [])
  const todo = files.filter(f => !done.has(f.fileName))
  const totalBytes = todo.reduce((s, f) => s + (f.fileSize ?? 0), 0)
  console.log(`${done.size} already scanned, ${todo.length} to go (${(totalBytes / 1e9).toFixed(1)} GB)`)

  let next = 0, finished = 0, matched = 0, bytes = 0
  const started = Date.now()

  async function worker() {
    while (next < todo.length) {
      const f = todo[next++]
      for (let attempt = 1; ; attempt++) {
        try {
          const blocks = await scanBulkZip(f.fileDownloadURI, match)
          for (const xml of blocks) {
            fs.appendFileSync(opts.out, JSON.stringify({
              serial: blockSerial(xml), transactionDate: blockTransactionDate(xml), file: f.fileName, xml,
            }) + '\n')
          }
          fs.appendFileSync(progressPath, f.fileName + '\n')
          matched += blocks.length
          break
        } catch (e) {
          if (attempt >= 3) { console.error(`FAILED ${f.fileName}: ${(e as Error).message}`); break }
          await new Promise(r => setTimeout(r, 5000 * attempt))
        }
      }
      finished++
      bytes += f.fileSize ?? 0
      const mins = (Date.now() - started) / 60000
      console.log(`[${finished}/${todo.length}] ${f.fileName} · ${matched} matches · ${(bytes / 1e9).toFixed(1)}/${(totalBytes / 1e9).toFixed(1)} GB · ${mins.toFixed(1)} min`)
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, worker))
  console.log(`Done. ${matched} matching records written to ${opts.out}`)
}

main().catch(e => { console.error(e); process.exit(1) })
