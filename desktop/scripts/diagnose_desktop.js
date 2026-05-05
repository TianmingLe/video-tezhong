import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(childProcess.exec)

const MIN_NODE_MAJOR = 20
const MIN_FREE_BYTES = 1 * 1024 * 1024 * 1024

function ok(name, detail) {
  return { name, status: 'ok', detail }
}

function warning(name, detail, suggestion) {
  return { name, status: 'warning', detail, suggestion }
}

function error(name, detail, suggestion) {
  return { name, status: 'error', detail, suggestion }
}

async function checkNodeVersion() {
  const version = process.versions.node
  const [major] = version.split('.').map(Number)
  if (major >= MIN_NODE_MAJOR) {
    return ok('node_version', `v${version}`)
  }
  return error('node_version', `v${version}`, `升级 Node.js 到 ${MIN_NODE_MAJOR}+`)
}

async function checkNpmDependencies(projectRoot) {
  const nodeModules = path.join(projectRoot, 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    return error('npm_dependencies', 'node_modules not found', '运行 npm install')
  }
  try {
    const { stdout } = await exec('npm ls --json --depth=0', { cwd: projectRoot, timeout: 30000 })
    const parsed = JSON.parse(stdout)
    const problems = parsed.problems || []
    if (problems.length === 0) {
      return ok('npm_dependencies', 'all resolved')
    }
    return warning('npm_dependencies', problems.join('; '), '运行 npm install 修复依赖')
  } catch (e) {
    const stderr = String(e?.stderr || e?.message || '')
    if (stderr.includes('extraneous') || stderr.includes('missing') || stderr.includes('peer dep')) {
      return warning('npm_dependencies', 'dependency issues detected', '运行 npm install 修复依赖')
    }
    return warning('npm_dependencies', 'unable to verify', '运行 npm install 修复依赖')
  }
}

async function checkSQLite(userDataPath) {
  const dbPath = path.join(userDataPath, 'db.sqlite3')
  try {
    if (!fs.existsSync(dbPath)) {
      return warning('sqlite', 'db.sqlite3 not found', '启动应用后会自动创建')
    }
    const fd = fs.openSync(dbPath, 'r+')
    fs.closeSync(fd)
    const stat = fs.statSync(dbPath)
    return ok('sqlite', `accessible (${stat.size} bytes)`)
  } catch (e) {
    return error('sqlite', String(e?.message || e), '检查数据库文件权限')
  }
}

async function checkUserDataDir(userDataPath) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    const testFile = path.join(userDataPath, '.write_test')
    fs.writeFileSync(testFile, 'ok')
    fs.unlinkSync(testFile)
    return ok('user_data_dir', `${userDataPath} writable`)
  } catch (e) {
    return error('user_data_dir', String(e?.message || e), '检查用户数据目录权限')
  }
}

async function checkElectronBuilder(projectRoot) {
  const configPath = path.join(projectRoot, 'electron-builder.yml')
  if (!fs.existsSync(configPath)) {
    return warning('electron_builder', 'electron-builder.yml not found', '确保打包配置文件存在')
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    if (!content.includes('appId:')) {
      return warning('electron_builder', 'missing appId', '在配置中补充 appId')
    }
    if (!content.includes('productName:')) {
      return warning('electron_builder', 'missing productName', '在配置中补充 productName')
    }
    return ok('electron_builder', 'config valid')
  } catch (e) {
    return error('electron_builder', String(e?.message || e), '检查配置文件')
  }
}

async function checkDiskSpace(projectRoot) {
  try {
    const stat = await fs.promises.statfs(projectRoot)
    const free = stat.bfree * stat.bsize
    const freeGb = free / (1024 ** 3)
    if (free >= MIN_FREE_BYTES) {
      return ok('disk_space', `${freeGb.toFixed(2)} GB free`)
    }
    return error('disk_space', `${freeGb.toFixed(2)} GB free`, '释放磁盘空间，至少保留 1GB')
  } catch (e) {
    return warning('disk_space', `unable to check: ${e?.message || e}`, '确保项目目录可访问')
  }
}

export async function runDesktopDiagnostics({ userDataPath, projectRoot }) {
  const checks = await Promise.all([
    checkNodeVersion(),
    checkNpmDependencies(projectRoot),
    checkSQLite(userDataPath),
    checkUserDataDir(userDataPath),
    checkElectronBuilder(projectRoot),
    checkDiskSpace(projectRoot),
  ])

  const statuses = new Set(checks.map((c) => c.status))
  let overall = 'ok'
  if (statuses.has('error')) overall = 'error'
  else if (statuses.has('warning')) overall = 'warning'

  const errors = checks.filter((c) => c.status === 'error').length
  const warnings = checks.filter((c) => c.status === 'warning').length
  const parts = []
  if (errors) parts.push(`${errors} error${errors > 1 ? 's' : ''}`)
  if (warnings) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`)
  const summary = parts.length ? `${parts.join(', ')} found` : 'all checks passed'

  return {
    overall_status: overall,
    checks,
    summary,
  }
}

async function main() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const projectRoot = path.resolve(__dirname, '..')
  const userDataPath = process.env.OMNI_USER_DATA_PATH || path.join(projectRoot, 'test-user-data')
  const report = await runDesktopDiagnostics({ userDataPath, projectRoot })
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.overall_status === 'ok' ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
