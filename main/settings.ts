import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { AppSettings, DEFAULT_SETTINGS } from './types'

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}
