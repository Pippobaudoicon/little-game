-- One row per player per mode, holding their best run.
CREATE TABLE IF NOT EXISTS scores (
  mode   TEXT    NOT NULL,
  player TEXT    NOT NULL,  -- random id kept in the player's browser
  name   TEXT    NOT NULL,
  score  INTEGER NOT NULL,  -- average ms, lower is better
  sd     INTEGER NOT NULL,  -- standard deviation ms
  best   INTEGER NOT NULL,  -- fastest single round ms
  times  TEXT    NOT NULL,  -- JSON array of round times
  at     INTEGER NOT NULL,  -- epoch ms
  PRIMARY KEY (mode, player)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (mode, score, at);

-- Every started run per player per mode, and which attempt set their best.
CREATE TABLE IF NOT EXISTS attempts (
  mode    TEXT    NOT NULL,
  player  TEXT    NOT NULL,
  n       INTEGER NOT NULL,  -- runs started
  pb_try  INTEGER,           -- attempt number of the run held in scores
  PRIMARY KEY (mode, player)
);
