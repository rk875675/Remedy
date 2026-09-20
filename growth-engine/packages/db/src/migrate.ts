import Database from "better-sqlite3";
import { DB_PATH } from "./index.js";

/** Idempotent schema creation — mirrors src/schema.ts. */
const DDL = `
CREATE TABLE IF NOT EXISTS hook_formulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  seeded INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS hooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  formula_id INTEGER REFERENCES hook_formulas(id),
  category TEXT NOT NULL DEFAULT 'problem_solution',
  source TEXT NOT NULL DEFAULT 'generated',
  parent_hook_id INTEGER,
  status TEXT NOT NULL DEFAULT 'candidate',
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_id INTEGER NOT NULL REFERENCES hooks(id),
  template_id TEXT NOT NULL,
  variation TEXT NOT NULL,
  caption TEXT NOT NULL,
  tiktok_title TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '',
  platforms TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  confidence REAL NOT NULL DEFAULT 50,
  scheduled_at TEXT,
  published_at TEXT,
  platform_posts TEXT,
  diagnosis TEXT,
  diagnosed_at TEXT,
  followers_at_publish INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  sub TEXT NOT NULL DEFAULT '',
  screenshot TEXT,
  file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  platform TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  followers INTEGER NOT NULL DEFAULT 0,
  follower_delta REAL,
  views INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT,
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dimension TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'avoid',
  content TEXT NOT NULL,
  data TEXT,
  score REAL NOT NULL DEFAULT 1,
  post_id INTEGER REFERENCES posts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS dimension_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dimension TEXT NOT NULL,
  category TEXT NOT NULL,
  direction TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  target INTEGER NOT NULL DEFAULT 12,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  concluded_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS asset_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dimension TEXT NOT NULL,
  key TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 50,
  samples INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_a_id INTEGER NOT NULL REFERENCES posts(id),
  post_b_id INTEGER NOT NULL REFERENCES posts(id),
  dimension TEXT NOT NULL,
  variable_detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  winner TEXT,
  lift_pct REAL,
  result_data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  concluded_at TEXT
);

CREATE TABLE IF NOT EXISTS ugc_creators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ugc_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL REFERENCES ugc_creators(id),
  r2_key TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  byte_size INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  scheduled_at TEXT,
  published_at TEXT,
  platform_posts TEXT,
  diagnosis TEXT,
  diagnosed_at TEXT,
  reject_reason TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ugc_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ugc_video_id INTEGER NOT NULL REFERENCES ugc_videos(id),
  platform TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(DDL);

// Incremental migrations for existing databases.
try {
  const cols = db.prepare("PRAGMA table_info(posts)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "platform_posts")) {
    db.exec("ALTER TABLE posts ADD COLUMN platform_posts TEXT");
    console.log("Migrated: added posts.platform_posts");
  }
  if (!cols.some((c) => c.name === "followers_at_publish")) {
    db.exec("ALTER TABLE posts ADD COLUMN followers_at_publish INTEGER NOT NULL DEFAULT 0");
    console.log("Migrated: added posts.followers_at_publish");
  }
} catch (err) {
  console.warn("Migration check failed:", err);
}

try {
  const analyticsCols = db.prepare("PRAGMA table_info(analytics)").all() as Array<{ name: string }>;
  if (!analyticsCols.some((c) => c.name === "followers")) {
    db.exec("ALTER TABLE analytics ADD COLUMN followers INTEGER NOT NULL DEFAULT 0");
    console.log("Migrated: added analytics.followers");
  }
} catch (err) {
  console.warn("Analytics column migration failed:", err);
}

// One-time transfer of legacy learnings rows into structured signals.
// Idempotent: skipped once any source='migration' signal exists.
try {
  const already = db.prepare("SELECT COUNT(*) AS n FROM signals WHERE source = 'migration'").get() as { n: number };
  if (already.n === 0) {
    const legacy = db
      .prepare("SELECT id, kind, content, data, score, created_at FROM learnings")
      .all() as Array<{ id: number; kind: string; content: string; data: string | null; score: number; created_at: string }>;

    const inferRuleDimension = (content: string): string => {
      const c = content.toLowerCase();
      if (/overlap|headline|sub |layout|footer|vertical|wordmark|ring|plate/.test(c)) return "layout";
      if (/screenshot|crop|svg|illustration/.test(c)) return "asset";
      if (/template/.test(c)) return "template";
      if (/hour|time|posted|publish/.test(c)) return "timing";
      return "hook";
    };

    const mapRow = (row: (typeof legacy)[number]): { dimension: string; category: string; direction: string } => {
      switch (row.kind) {
        case "best_time":
          return { dimension: "timing", category: "best_hour", direction: "prefer" };
        case "best_template":
          return { dimension: "template", category: "winning_template", direction: "prefer" };
        case "best_screenshot":
          return { dimension: "asset", category: "winning_screenshot", direction: "prefer" };
        case "failure":
          return { dimension: "hook", category: "legacy_failure", direction: "avoid" };
        default:
          return { dimension: inferRuleDimension(row.content), category: "legacy_rule", direction: "prefer" };
      }
    };

    const insert = db.prepare(
      `INSERT INTO signals (dimension, category, source, direction, content, data, score, created_at)
       VALUES (?, ?, 'migration', ?, ?, ?, ?, ?)`,
    );
    let migrated = 0;
    for (const row of legacy) {
      const m = mapRow(row);
      insert.run(m.dimension, m.category, m.direction, row.content, row.data, row.score, row.created_at);
      migrated++;
    }
    if (migrated > 0) console.log(`Migrated: ${migrated} legacy learnings -> signals`);
  }
} catch (err) {
  console.warn("Legacy learnings migration failed:", err);
}

const sohan = db.prepare("SELECT id FROM ugc_creators WHERE slug = 'sohan'").get() as { id: number } | undefined;
if (!sohan) {
  db.prepare("INSERT INTO ugc_creators (slug, display_name, email) VALUES ('sohan', 'Sohan', '')").run();
  console.log("Seeded: ugc creator Sohan");
}
const ai = db.prepare("SELECT id FROM ugc_creators WHERE slug = 'ai'").get() as { id: number } | undefined;
if (!ai) {
  db.prepare("INSERT INTO ugc_creators (slug, display_name, email) VALUES ('ai', 'AI', '')").run();
  console.log("Seeded: ugc creator AI");
}

console.log(`Schema ready at ${DB_PATH}`);
db.close();
