import fs from 'node:fs'
import path from 'node:path'
import type { MediaCrawlerTaskSpec } from './mediacrawlerTaskSpec'

export function resolveMediaCrawlerRoot(args: { isPackaged: boolean; resourcesPath: string; devRoot: string }): string {
  if (args.isPackaged) return path.join(args.resourcesPath, 'MediaCrawler')
  return path.join(args.devRoot, 'MediaCrawler')
}

export function resolveRunnerDir(args: { isPackaged: boolean; resourcesPath: string; devRoot: string }): string {
  if (args.isPackaged) return path.join(args.resourcesPath, 'resources', 'python')
  return path.join(args.devRoot, 'desktop', 'resources', 'python')
}

function assertSafeRunId(runId: string): void {
  if (!runId) throw new Error('runId is required')
  if (runId.includes('..') || runId.includes('/') || runId.includes('\\')) throw new Error('invalid runId')
}

export function writeTaskJson(args: {
  userDataPath: string
  mediaCrawlerRoot: string
  spec: MediaCrawlerTaskSpec
}): { runDir: string; taskJsonPath: string } {
  assertSafeRunId(args.spec.runId)
  const runDir = path.join(args.userDataPath, 'results', 'runs', args.spec.runId)
  fs.mkdirSync(runDir, { recursive: true })
  const taskJsonPath = path.join(runDir, 'task.json')
  const payload = { ...args.spec, mediaCrawlerRoot: args.mediaCrawlerRoot, runDir }
  fs.writeFileSync(taskJsonPath, JSON.stringify(payload, null, 2), 'utf-8')
  return { runDir, taskJsonPath }
}

