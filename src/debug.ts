/**
 * Inosuke debug logger — structured output controllable via environment flag.
 *
 * Enable:  process.env.INOSUKE_DEBUG="true"  or  globalThis.__INOSUKE_DEBUG__ = true
 * Silence: set INOSUKE_DEBUG_LEVEL to one of "debug" | "info" | "warn" | "error" (default: "info")
 */

type Level = "debug" | "info" | "warn" | "error"

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const isEnabled = (): boolean => {
  try {
    if ((process as any)?.env?.INOSUKE_DEBUG === "true") return true
    if ((process as any)?.env?.INOSUKE_DEBUG === "1") return true
  } catch {}
  try {
    const g = globalThis as any
    if (g.__INOSUKE_DEBUG__ === true) return true
    if (typeof window !== "undefined" && (window as any).__INOSUKE_DEBUG__ === true) return true
  } catch {}
  return false
}

const getMinLevel = (): Level => {
  try {
    const v = (process as any)?.env?.INOSUKE_DEBUG_LEVEL
    if (v && v in LEVELS) return v as Level
  } catch {}
  try {
    const g = globalThis as any
    if (g.__INOSUKE_DEBUG_LEVEL__ && g.__INOSUKE_DEBUG_LEVEL__ in LEVELS) return g.__INOSUKE_DEBUG_LEVEL__
    if (typeof window !== "undefined" && (window as any).__INOSUKE_DEBUG_LEVEL__ in LEVELS)
      return (window as any).__INOSUKE_DEBUG_LEVEL__
  } catch {}
  return "info"
}

export function debug(message: string | (() => string), level: Level = "info"): void {
  if (!isEnabled()) return
  if (LEVELS[level] < LEVELS[getMinLevel()]) return

  const text = typeof message === "function" ? message() : message
  const fn =
    level === "debug" ? console.log :
    level === "warn" ? console.warn :
    level === "error" ? console.error :
    console.info

  fn(`[inosuke] ${text}`)
}

export function isDebugEnabled(): boolean {
  return isEnabled()
}
