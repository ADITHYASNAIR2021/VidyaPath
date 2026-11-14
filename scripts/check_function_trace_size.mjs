import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const tracesRoot = path.join(projectRoot, '.next', 'server', 'app')
const limitMb = Number(process.env.FUNCTION_TRACE_LIMIT_MB || '240')
const limitBytes = limitMb * 1024 * 1024
const requiredContext = [
  'chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'chapter_index.json.gz',
  'textbook_chapter_index.json.gz', 'retrieval_index.json.gz',
  'retrieval_manifest.json',
].map((file) => `lib/context/${file}`)
const sizeCache = new Map()

if (!Number.isFinite(limitMb) || limitMb <= 0) {
  throw new Error('FUNCTION_TRACE_LIMIT_MB must be a positive number.')
}

if (!existsSync(tracesRoot)) {
  throw new Error(`No page/API build traces found at ${tracesRoot}. Run npm run build first.`)
}

function collectTraceFiles(directory) {
  const traces = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      traces.push(...collectTraceFiles(absolutePath))
    } else if (entry.name === 'route.js.nft.json' || entry.name === 'page.js.nft.json') {
      traces.push(absolutePath)
    }
  }

  return traces
}

const reports = collectTraceFiles(tracesRoot).map((tracePath) => {
  const trace = JSON.parse(readFileSync(tracePath, 'utf8'))
  const uniqueFiles = new Set()

  for (const file of trace.files ?? []) {
    const absolutePath = path.resolve(path.dirname(tracePath), file)
    if (existsSync(absolutePath)) {
      uniqueFiles.add(absolutePath)
    }
  }

  const tracedPaths = new Set((trace.files ?? []).map((file) => path.resolve(path.dirname(tracePath), file)))
  for (const absolutePath of tracedPaths) {
    const relative = path.relative(projectRoot, absolutePath).replaceAll('\\', '/')
    if (/^(?:dataset|\.cache|\.git|services)\//.test(relative) || /^\.env/.test(relative) || /^lib\/context\/(?:images\/|chunk_vectors\.jsonl(?:\.gz)?$)/.test(relative)) {
      throw new Error(`Private/offline artifact leaked into ${tracePath}: ${relative}`)
    }
  }
  for (const file of requiredContext) {
    if (!tracedPaths.has(path.join(projectRoot, file))) throw new Error(`Missing deployment corpus in ${tracePath}: ${file}`)
  }
  const bytes = [...uniqueFiles].reduce((total, file) => {
    if (!sizeCache.has(file)) sizeCache.set(file, statSync(file).size)
    return total + sizeCache.get(file)
  }, 0)
  const route = path
    .relative(path.join(projectRoot, '.next', 'server', 'app'), tracePath)
    .replaceAll('\\', '/')
    .replace(/\/(?:route|page)\.js\.nft\.json$/, '')

  return { route, bytes, fileCount: uniqueFiles.size }
})

reports.sort((left, right) => right.bytes - left.bytes)

console.log(`Serverless function trace limit: ${limitMb.toFixed(0)} MiB`)
for (const report of reports.slice(0, 10)) {
  console.log(
    `${(report.bytes / 1024 / 1024).toFixed(2).padStart(8)} MiB  ${String(report.fileCount).padStart(5)} files  ${report.route}`,
  )
}

const oversized = reports.filter((report) => report.bytes > limitBytes)
if (oversized.length > 0) {
  console.error('\nOversized serverless function traces:')
  for (const report of oversized) {
    console.error(`- ${report.route}: ${(report.bytes / 1024 / 1024).toFixed(2)} MiB`)
  }
  process.exitCode = 1
} else {
  console.log(`All ${reports.length} page/API traces are within the ${limitMb.toFixed(0)} MiB guardrail; no offline/private artifacts traced.`)
}
