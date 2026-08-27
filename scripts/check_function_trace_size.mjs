import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const tracesRoot = path.join(projectRoot, '.next', 'server', 'app', 'api')
const limitMb = Number(process.env.FUNCTION_TRACE_LIMIT_MB || '240')
const limitBytes = limitMb * 1024 * 1024

if (!Number.isFinite(limitMb) || limitMb <= 0) {
  throw new Error('FUNCTION_TRACE_LIMIT_MB must be a positive number.')
}

if (!existsSync(tracesRoot)) {
  throw new Error(`No API build traces found at ${tracesRoot}. Run npm run build first.`)
}

const trackedFiles = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: projectRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/')),
)

function collectTraceFiles(directory) {
  const traces = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      traces.push(...collectTraceFiles(absolutePath))
    } else if (entry.name === 'route.js.nft.json') {
      traces.push(absolutePath)
    }
  }

  return traces
}

function isDeployableFile(absolutePath) {
  const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/')

  if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    return true
  }

  return (
    relativePath.startsWith('.next/') ||
    relativePath.startsWith('node_modules/') ||
    trackedFiles.has(relativePath)
  )
}

const reports = collectTraceFiles(tracesRoot).map((tracePath) => {
  const trace = JSON.parse(readFileSync(tracePath, 'utf8'))
  const uniqueFiles = new Set()

  for (const file of trace.files ?? []) {
    const absolutePath = path.resolve(path.dirname(tracePath), file)
    if (existsSync(absolutePath) && isDeployableFile(absolutePath)) {
      uniqueFiles.add(absolutePath)
    }
  }

  const bytes = [...uniqueFiles].reduce((total, file) => total + statSync(file).size, 0)
  const route = path
    .relative(path.join(projectRoot, '.next', 'server', 'app'), tracePath)
    .replaceAll('\\', '/')
    .replace(/\/route\.js\.nft\.json$/, '')

  return { route, bytes, fileCount: uniqueFiles.size }
})

reports.sort((left, right) => right.bytes - left.bytes)

console.log(`Serverless function trace limit: ${limitMb.toFixed(0)} MB`)
for (const report of reports.slice(0, 10)) {
  console.log(
    `${(report.bytes / 1024 / 1024).toFixed(2).padStart(8)} MB  ${String(report.fileCount).padStart(5)} files  ${report.route}`,
  )
}

const oversized = reports.filter((report) => report.bytes > limitBytes)
if (oversized.length > 0) {
  console.error('\nOversized serverless function traces:')
  for (const report of oversized) {
    console.error(`- ${report.route}: ${(report.bytes / 1024 / 1024).toFixed(2)} MB`)
  }
  process.exitCode = 1
} else {
  console.log(`All ${reports.length} API function traces are within the ${limitMb.toFixed(0)} MB guardrail.`)
}
