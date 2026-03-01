const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')

// dist-electron をクリア（古いコンパイル済みファイルの競合を防ぐ）
const distElectron = path.join(root, 'dist-electron')
if (fs.existsSync(distElectron)) {
  fs.rmSync(distElectron, { recursive: true, force: true })
  console.log('[dev] Cleared dist-electron/')
}

// TypeScript コンパイル（エラーがあっても続行）
try {
  execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit', cwd: root })
  console.log('[dev] TypeScript compiled successfully')
} catch {
  console.warn('[dev] TypeScript had errors, launching Electron anyway...')
}

// Electron 起動
const electron = require('electron')
const child = spawn(String(electron), ['.'], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development' }
})

child.on('close', code => process.exit(code ?? 0))
