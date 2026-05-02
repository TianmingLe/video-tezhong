import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import yaml from 'js-yaml'

const desktopDir = process.cwd()
const repoRoot = path.resolve(desktopDir, '..')

const workflowDir = path.join(repoRoot, '.github', 'workflows')
const workflowFiles = fs.existsSync(workflowDir)
  ? fs
      .readdirSync(workflowDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => path.join(workflowDir, f))
  : []

const files = [path.join(desktopDir, 'electron-builder.yml'), ...workflowFiles]

for (const filePath of files) {
  const raw = fs.readFileSync(filePath, 'utf8')
  yaml.load(raw)
}

process.stdout.write(`validated ${files.length} yaml files\n`)
