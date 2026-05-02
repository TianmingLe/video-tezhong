import fs from 'node:fs'
import path from 'node:path'
import type { MediaCrawlerTaskSpec } from './mediacrawlerTaskSpec'

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

export function resolveMediaCrawlerRoot(args?: { cwd?: string; resourcesPath?: string; isPackaged?: boolean }): string {
  const isPackaged = args?.isPackaged ?? false
  const resourcesPath = args?.resourcesPath ?? (process as any).resourcesPath ?? ''
  const cwd = args?.cwd ?? process.cwd()

  if (isPackaged && resourcesPath) return path.join(resourcesPath, 'MediaCrawler')

  const fromDesktop = path.resolve(cwd, '..', 'MediaCrawler')
  if (fs.existsSync(fromDesktop)) return fromDesktop
  const fromRepoRoot = path.resolve(cwd, 'MediaCrawler')
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot

  return fromDesktop
}

export function resolveMediaCrawlerRunnerScript(args?: { cwd?: string; resourcesPath?: string; isPackaged?: boolean }): string {
  const isPackaged = args?.isPackaged ?? false
  const resourcesPath = args?.resourcesPath ?? (process as any).resourcesPath ?? ''
  const cwd = args?.cwd ?? process.cwd()

  if (isPackaged && resourcesPath) return path.join(resourcesPath, 'resources', 'python', 'run_mediacrawler.py')
  return path.resolve(cwd, 'resources', 'python', 'run_mediacrawler.py')
}

export function writeTaskJson(args: { userDataPath: string; spec: MediaCrawlerTaskSpec }): string {
  const runDir = path.join(args.userDataPath, 'runs', args.spec.runId)
  ensureDir(runDir)
  const fp = path.join(runDir, 'task.json')
  fs.writeFileSync(fp, JSON.stringify(args.spec, null, 2), 'utf-8')
  return fp
}

