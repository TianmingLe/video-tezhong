import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = path.resolve(process.cwd())
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const playwrightBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
)

const argv = process.argv.slice(2)

const dist = path.join(projectRoot, 'node_modules', 'electron', 'dist')
const pathTxt = path.join(projectRoot, 'node_modules', 'electron', 'path.txt')
const electronBin = path.join(dist, process.platform === 'win32' ? 'electron.exe' : 'electron')

const env = { ...process.env }
if (!fs.existsSync(pathTxt) && fs.existsSync(electronBin)) {
  env.ELECTRON_OVERRIDE_DIST_PATH = dist
}

const run = (cmd, args) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env })
  process.exit(typeof res.status === 'number' ? res.status : 1)
}

const runSync = (cmd, args) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env })
  return typeof res.status === 'number' ? res.status : 1
}

const electronBuilderBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
)

if (fs.existsSync(electronBuilderBin)) {
  const code = runSync(electronBuilderBin, ['install-app-deps'])
  if (code !== 0) process.exit(code)
}

if (process.platform === 'linux' && !env.DISPLAY) {
  const xvfb = '/usr/bin/xvfb-run'
  if (fs.existsSync(xvfb)) {
    const code = runSync(xvfb, ['-a', playwrightBin, 'test', ...argv])
    runSync(npmBin, ['rebuild', 'better-sqlite3'])
    process.exit(code)
  }
}

const code = runSync(playwrightBin, ['test', ...argv])
runSync(npmBin, ['rebuild', 'better-sqlite3'])
process.exit(code)
