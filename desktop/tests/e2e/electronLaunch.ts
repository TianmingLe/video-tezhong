import fs from 'node:fs'
import path from 'node:path'
import type { ElectronApplication } from 'playwright'
import { _electron as electron } from 'playwright'

export async function launchDesktopElectron(args: { desktopRoot: string }): Promise<ElectronApplication> {
  const dist = path.join(args.desktopRoot, 'node_modules', 'electron', 'dist')
  const bin = path.join(dist, process.platform === 'win32' ? 'electron.exe' : 'electron')
  process.env.ELECTRON_OVERRIDE_DIST_PATH = dist
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }

  if (!fs.existsSync(bin)) {
    throw new Error(`electron binary not found: ${bin}`)
  }

  return await electron.launch({ args: ['.'], cwd: args.desktopRoot, env })
}
