// Menu preferences: which main-menu areas a user has switched off (Profile > Menu & Report Settings).
// The Dashboard is not in this list because it can never be switched off.
export const SWITCHABLE_SECTIONS = ['companies', 'accounts', 'stocks', 'options', 'daily-trade', 'utilities', 'reports'] as const

// Keep only known areas, once each, in menu order. Anything else (including 'dashboard') is dropped.
export function cleanHidden(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return SWITCHABLE_SECTIONS.filter((s) => input.includes(s))
}

export async function getHiddenSections(DB: any, userId: number): Promise<string[]> {
  try {
    const row = (await DB.prepare('SELECT menu_hidden FROM user_preferences WHERE user_id = ?').bind(userId).first()) as any
    if (!row || typeof row.menu_hidden !== 'string') return []
    return cleanHidden(JSON.parse(row.menu_hidden))
  } catch {
    return []
  }
}

export async function saveHiddenSections(DB: any, userId: number, hidden: string[]): Promise<void> {
  await DB.prepare(`
    INSERT INTO user_preferences (user_id, menu_hidden, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET menu_hidden = excluded.menu_hidden, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, JSON.stringify(cleanHidden(hidden))).run()
}

// Which kinds of trading the reports should include. Everything is on unless the user switched it off.
export async function getFeatures(DB: any, userId: number): Promise<{ stocks: boolean; options: boolean; daily: boolean }> {
  const hidden = await getHiddenSections(DB, userId)
  return { stocks: !hidden.includes('stocks'), options: !hidden.includes('options'), daily: !hidden.includes('daily-trade') }
}
