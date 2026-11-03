-- Per-user menu preferences. menu_hidden is a JSON list of the main-menu areas the user has switched off
-- (so a new area is on by default). The Dashboard can never be switched off.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY,
  menu_hidden TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
