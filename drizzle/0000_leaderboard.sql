CREATE TABLE leaderboard_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation INTEGER NOT NULL DEFAULT 1,
  cleared_at INTEGER
);
--> statement-breakpoint
CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  generation INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX runs_started_at_idx ON runs (started_at);
--> statement-breakpoint
CREATE TABLE leaderboard (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  tips INTEGER NOT NULL,
  breakdown TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX leaderboard_rank_idx ON leaderboard (score DESC, created_at ASC, id ASC);
