import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Minimal .env loader for standalone scripts.
 *
 * Next.js loads these files itself; scripts run outside it, and a script that
 * mints a session with a different AUTH_SECRET than the server silently
 * produces tokens the server rejects. Loading the same files avoids that.
 */
export function loadEnv(files = ['.env.local', '.env']): void {
  for (const file of files) {
    let contents: string
    try {
      contents = readFileSync(path.join(process.cwd(), file), 'utf8')
    } catch {
      continue
    }
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key!] !== undefined) continue
      process.env[key!] = rawValue!.replace(/^["']|["']$/g, '')
    }
  }
}
