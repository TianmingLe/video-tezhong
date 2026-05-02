CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  script TEXT NOT NULL,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  duration INTEGER,
  task_spec_json TEXT,
  attempt INTEGER,
  max_attempts INTEGER
);

CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  script TEXT NOT NULL,
  scenario TEXT NOT NULL,
  gateway_ws TEXT,
  env TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  task_spec_json TEXT
);
