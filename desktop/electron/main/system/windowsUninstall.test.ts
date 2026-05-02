import { describe, it, expect } from 'vitest'
import { findUninstallerInDir, parseRegQueryForProduct, parseUninstallString } from './windowsUninstall'

describe('windowsUninstall', () => {
  it('parseUninstallString parses quoted exe with args', () => {
    const r = parseUninstallString('"C:\\\\App\\\\Uninstall OmniScraper Desktop.exe" /S')
    expect(r?.command.toLowerCase()).toContain('uninstall omniscraper desktop.exe')
    expect(r?.args).toEqual(['/S'])
  })

  it('findUninstallerInDir prefers productName uninstall', () => {
    const files = ['Uninstall.exe', 'Uninstall OmniScraper Desktop.exe']
    const r = findUninstallerInDir('C:\\App', files, 'OmniScraper Desktop')
    expect(r?.toLowerCase()).toContain('uninstall omniscraper desktop.exe')
  })

  it('parseRegQueryForProduct picks uninstallString by displayName', () => {
    const out = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Test
    DisplayName    REG_SZ    OmniScraper Desktop
    UninstallString    REG_SZ    "C:\\App\\Uninstall OmniScraper Desktop.exe"
`
    const r = parseRegQueryForProduct(out, 'OmniScraper Desktop')
    expect(r).toContain('Uninstall OmniScraper Desktop.exe')
  })
})

