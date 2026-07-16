import Database from 'better-sqlite3';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'mdiabolo.sqlite');
const port = Number(process.env.MDIABOLO_DB_PORT ?? 4317);

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    name_zh TEXT,
    name_en TEXT,
    poster TEXT,
    background_theme TEXT,
    background_video TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS competitions (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_zh TEXT,
    name_en TEXT,
    type TEXT NOT NULL,
    region TEXT,
    division TEXT,
    status TEXT NOT NULL,
    fault_deduction REAL NOT NULL,
    chief_judge TEXT,
    recorder TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS competition_rounds (
    id TEXT PRIMARY KEY NOT NULL,
    competition_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_zh TEXT,
    name_en TEXT,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    advancing_count INTEGER,
    athlete_ids TEXT NOT NULL,
    start_time TEXT,
    announcement_time TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS athletes (
    id TEXT PRIMARY KEY NOT NULL,
    display_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_zh TEXT,
    name_en TEXT,
    school TEXT,
    age INTEGER,
    gender TEXT,
    country TEXT,
    team_name TEXT,
    competition_ids TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS judges (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    name_zh TEXT,
    name_en TEXT,
    role TEXT NOT NULL,
    competition_ids TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY NOT NULL,
    competition_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    athlete_id TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    action_difficulty REAL,
    stage_artistry REAL,
    action_interaction REAL,
    action_creativity REAL,
    action_fluency REAL,
    costume_styling REAL,
    total_score REAL NOT NULL,
    submitted_at TEXT NOT NULL,
    sync_status TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faults (
    id TEXT PRIMARY KEY NOT NULL,
    competition_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    athlete_id TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    faults_count INTEGER NOT NULL,
    deduction_per_fault REAL NOT NULL,
    deduction_amount REAL NOT NULL,
    submitted_at TEXT NOT NULL,
    sync_status TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL DEFAULT 'app',
    active_event_id TEXT NOT NULL,
    active_competition_id TEXT,
    custom_background TEXT,
    background_history TEXT,
    updated_at TEXT NOT NULL
  );
`);

function replaceRows<T>(
  table: string,
  rows: T[],
  insertSql: string,
  mapRow: (row: T, updatedAt: string) => unknown[]
) {
  const updatedAt = new Date().toISOString();
  const transaction = db.transaction((items: T[]) => {
    db.prepare(`DELETE FROM ${table}`).run();
    const insert = db.prepare(insertSql);
    for (const item of items) insert.run(...mapRow(item, updatedAt));
  });
  transaction(rows);
}

function mirrorStateTable(key: string, value: unknown) {
  if (key === 'events' && Array.isArray(value)) {
    replaceRows('events', value, `
      INSERT INTO events (id, name, name_zh, name_en, poster, background_theme, background_video, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, (event: any, updatedAt) => [event.id, event.name, event.nameZh ?? null, event.nameEn ?? null, event.poster ?? '', event.backgroundTheme ?? null, event.backgroundVideo ?? null, updatedAt]);
  }

  if (key === 'competitions' && Array.isArray(value)) {
    replaceRows('competitions', value, `
      INSERT INTO competitions (id, event_id, name, name_zh, name_en, type, region, division, status, fault_deduction, chief_judge, recorder, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, (competition: any, updatedAt) => [
      competition.id, competition.eventId, competition.name, competition.nameZh ?? null, competition.nameEn ?? null,
      competition.type, competition.region ?? '', competition.division ?? '', competition.status, competition.faultDeduction ?? 0,
      competition.chiefJudge ?? null, competition.recorder ?? null, updatedAt
    ]);
    const rounds = value.flatMap((competition: any) => (competition.rounds ?? []).map((round: any) => ({ ...round, competitionId: competition.id })));
    replaceRows('competition_rounds', rounds, `
      INSERT INTO competition_rounds (id, competition_id, name, name_zh, name_en, sequence, status, advancing_count, athlete_ids, start_time, announcement_time, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, (round: any, updatedAt) => [
      round.id, round.competitionId, round.name, round.nameZh ?? null, round.nameEn ?? null, round.sequence, round.status,
      round.advancingCount ?? null, JSON.stringify(round.athleteIds ?? []), round.startTime ?? null, round.announcementTime ?? null, updatedAt
    ]);
  }

  if (key === 'athletes' && Array.isArray(value)) {
    replaceRows('athletes', value, `
      INSERT INTO athletes (id, display_order, name, name_zh, name_en, school, age, gender, country, team_name, competition_ids, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, (athlete: any, updatedAt) => [
      athlete.id, athlete.order, athlete.name, athlete.nameZh ?? null, athlete.nameEn ?? null, athlete.school ?? '',
      athlete.age ?? null, athlete.gender ?? '', athlete.country ?? '', athlete.teamName ?? null, JSON.stringify(athlete.competitionIds ?? []), updatedAt
    ]);
  }

  if (key === 'judges' && Array.isArray(value)) {
    replaceRows('judges', value, `
      INSERT INTO judges (id, name, name_zh, name_en, role, competition_ids, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, (judge: any, updatedAt) => [judge.id, judge.name, judge.nameZh ?? null, judge.nameEn ?? null, judge.role, JSON.stringify(judge.competitionIds ?? []), updatedAt]);
  }

  if (key === 'scores' && Array.isArray(value)) {
    replaceRows('scores', value, `
      INSERT INTO scores (id, competition_id, round_id, athlete_id, judge_id, judge_name, action_difficulty, stage_artistry, action_interaction, action_creativity, action_fluency, costume_styling, total_score, submitted_at, sync_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, (score: any, updatedAt) => [
      score.id, score.competitionId, score.roundId, score.athleteId, score.judgeId, score.judgeName,
      score.dimensions?.action_difficulty ?? null, score.dimensions?.stage_artistry ?? null, score.dimensions?.action_interaction ?? null,
      score.dimensions?.action_creativity ?? null, score.dimensions?.action_fluency ?? null, score.dimensions?.costume_styling ?? null,
      score.totalScore, score.submittedAt, score.syncStatus ?? null, updatedAt
    ]);
  }

  if (key === 'faults' && Array.isArray(value)) {
    replaceRows('faults', value, `
      INSERT INTO faults (id, competition_id, round_id, athlete_id, judge_id, faults_count, deduction_per_fault, deduction_amount, submitted_at, sync_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, (fault: any, updatedAt) => [
      fault.id, fault.competitionId, fault.roundId, fault.athleteId, fault.judgeId, fault.faultsCount,
      fault.deductionPerFault, fault.deductionAmount, fault.submittedAt, fault.syncStatus ?? null, updatedAt
    ]);
  }

  if (key === 'admins' && Array.isArray(value)) {
    replaceRows('admins', value, `
      INSERT INTO admins (id, name, salt, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, (admin: any, updatedAt) => [admin.id, admin.name, admin.salt, admin.passwordHash, admin.createdAt, updatedAt]);
  }

  if (key === 'settings' && value && typeof value === 'object') {
    const settings = value as any;
    db.prepare(`
      INSERT INTO settings (id, active_event_id, active_competition_id, custom_background, background_history, updated_at)
      VALUES ('app', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        active_event_id = excluded.active_event_id,
        active_competition_id = excluded.active_competition_id,
        custom_background = excluded.custom_background,
        background_history = excluded.background_history,
        updated_at = excluded.updated_at
    `).run(
      settings.activeEventId ?? '',
      settings.activeCompetitionId ?? null,
      settings.customBackground ? JSON.stringify(settings.customBackground) : null,
      settings.backgroundHistory ? JSON.stringify(settings.backgroundHistory) : null,
      new Date().toISOString()
    );
  }
}

function recordAction(actionType: string, entityType: string, entityId: string | null, payload: unknown) {
  db.prepare(`
    INSERT INTO action_log (action_type, entity_type, entity_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(actionType, entityType, entityId, JSON.stringify(payload), new Date().toISOString());
}

function seedDatabaseIfEmpty() {
  const eventCount = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
  const competitionCount = db.prepare('SELECT COUNT(*) AS count FROM competitions').get() as { count: number };
  const athleteCount = db.prepare('SELECT COUNT(*) AS count FROM athletes').get() as { count: number };
  const judgeCount = db.prepare('SELECT COUNT(*) AS count FROM judges').get() as { count: number };
  const hasCompleteBaseData = eventCount.count > 0 && competitionCount.count > 0 && athleteCount.count > 0 && judgeCount.count > 0;
  if (hasCompleteBaseData) return;

  const readAppState = <T>(key: string, fallback: T): T => {
    const row = db.prepare('SELECT value FROM app_state WHERE key = ? LIMIT 1').get(key) as { value?: string } | undefined;
    if (!row?.value) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  };

  mirrorStateTable('events', readAppState('events', []));
  mirrorStateTable('competitions', readAppState('competitions', []));
  mirrorStateTable('athletes', readAppState('athletes', []));
  mirrorStateTable('judges', readAppState('judges', []));
  if ((db.prepare('SELECT COUNT(*) AS count FROM scores').get() as { count: number }).count === 0) {
    mirrorStateTable('scores', readAppState('scores', []));
  }
  if ((db.prepare('SELECT COUNT(*) AS count FROM faults').get() as { count: number }).count === 0) {
    mirrorStateTable('faults', readAppState('faults', []));
  }
  mirrorStateTable('admins', readAppState('admins', []));
  mirrorStateTable('settings', readAppState('settings', { activeEventId: '' }));
}

seedDatabaseIfEmpty();

function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const singularEntity: Record<string, string> = {
  events: 'event',
  competitions: 'competition',
  athletes: 'athlete',
  judges: 'judge',
  scores: 'score',
  faults: 'fault',
  admins: 'admin',
  settings: 'settings'
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function itemId(value: unknown): string | null {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id
    : null;
}

function buildChangeActions(key: string, previous: unknown, next: unknown): Array<{ actionType: string; entityType: string; entityId: string | null; payload: unknown }> {
  const entityType = singularEntity[key] ?? key;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const previousById = new Map(previous.map(item => [itemId(item), item]).filter(([id]) => Boolean(id)) as [string, unknown][]);
    const nextById = new Map(next.map(item => [itemId(item), item]).filter(([id]) => Boolean(id)) as [string, unknown][]);
    const actions: Array<{ actionType: string; entityType: string; entityId: string | null; payload: unknown }> = [];
    for (const [id, item] of nextById) {
      const before = previousById.get(id);
      if (!before || stableJson(before) !== stableJson(item)) {
        actions.push({ actionType: 'upsert', entityType, entityId: id, payload: item });
      }
    }
    for (const [id, item] of previousById) {
      if (!nextById.has(id)) {
        actions.push({ actionType: 'delete', entityType, entityId: id, payload: item });
      }
    }
    return actions;
  }
  if (stableJson(previous) !== stableJson(next)) {
    return [{ actionType: 'upsert', entityType, entityId: key === 'settings' ? 'app' : itemId(next), payload: next }];
  }
  return [];
}

function readRelationalState(key: string): unknown | undefined {
  if (key === 'events') {
    const rows = db.prepare('SELECT * FROM events ORDER BY id').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      nameEn: row.name_en ?? undefined,
      poster: row.poster ?? '',
      backgroundVideo: row.background_video ?? undefined,
      backgroundTheme: row.background_theme ?? 'Ember'
    }));
  }

  if (key === 'competitions') {
    const competitions = db.prepare('SELECT * FROM competitions ORDER BY id').all() as any[];
    const rounds = db.prepare('SELECT * FROM competition_rounds ORDER BY competition_id, sequence').all() as any[];
    return competitions.map(row => ({
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      nameEn: row.name_en ?? undefined,
      type: row.type,
      region: row.region ?? '',
      division: row.division ?? '',
      status: row.status,
      faultDeduction: row.fault_deduction,
      chiefJudge: row.chief_judge ?? undefined,
      recorder: row.recorder ?? undefined,
      rounds: rounds.filter(round => round.competition_id === row.id).map(round => ({
        id: round.id,
        name: round.name,
        nameZh: round.name_zh ?? undefined,
        nameEn: round.name_en ?? undefined,
        sequence: round.sequence,
        status: round.status,
        athleteIds: parseJsonField<string[]>(round.athlete_ids, []),
        advancingCount: round.advancing_count,
        startTime: round.start_time ?? undefined,
        announcementTime: round.announcement_time ?? undefined
      }))
    }));
  }

  if (key === 'athletes') {
    const rows = db.prepare('SELECT * FROM athletes ORDER BY display_order, id').all() as any[];
    return rows.map(row => ({
      id: row.id,
      order: row.display_order,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      nameEn: row.name_en ?? undefined,
      school: row.school ?? '',
      age: row.age ?? 0,
      gender: row.gender ?? 'Male',
      country: row.country ?? '',
      teamName: row.team_name,
      competitionIds: parseJsonField<string[]>(row.competition_ids, [])
    }));
  }

  if (key === 'judges') {
    const rows = db.prepare('SELECT * FROM judges ORDER BY id').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      nameEn: row.name_en ?? undefined,
      role: row.role,
      competitionIds: parseJsonField<string[]>(row.competition_ids, [])
    }));
  }

  if (key === 'scores') {
    const rows = db.prepare('SELECT * FROM scores ORDER BY submitted_at DESC, id').all() as any[];
    return rows.map(row => ({
      id: row.id,
      competitionId: row.competition_id,
      roundId: row.round_id,
      athleteId: row.athlete_id,
      judgeId: row.judge_id,
      judgeName: row.judge_name,
      dimensions: {
        action_difficulty: row.action_difficulty,
        stage_artistry: row.stage_artistry ?? undefined,
        action_interaction: row.action_interaction ?? undefined,
        action_creativity: row.action_creativity,
        action_fluency: row.action_fluency ?? undefined,
        costume_styling: row.costume_styling ?? undefined
      },
      totalScore: row.total_score,
      submittedAt: row.submitted_at,
      syncStatus: row.sync_status ?? undefined
    }));
  }

  if (key === 'faults') {
    const rows = db.prepare('SELECT * FROM faults ORDER BY submitted_at DESC, id').all() as any[];
    return rows.map(row => ({
      id: row.id,
      competitionId: row.competition_id,
      roundId: row.round_id,
      athleteId: row.athlete_id,
      judgeId: row.judge_id,
      faultsCount: row.faults_count,
      deductionPerFault: row.deduction_per_fault,
      deductionAmount: row.deduction_amount,
      submittedAt: row.submitted_at,
      syncStatus: row.sync_status ?? undefined
    }));
  }

  if (key === 'admins') {
    const rows = db.prepare('SELECT * FROM admins ORDER BY created_at').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      salt: row.salt,
      passwordHash: row.password_hash,
      createdAt: row.created_at
    }));
  }

  if (key === 'settings') {
    const row = db.prepare("SELECT * FROM settings WHERE id = 'app' LIMIT 1").get() as any;
    if (!row) return undefined;
    return {
      activeEventId: row.active_event_id,
      activeCompetitionId: row.active_competition_id ?? undefined,
      customBackground: parseJsonField(row.custom_background, undefined),
      backgroundHistory: parseJsonField(row.background_history, undefined)
    };
  }

  return undefined;
}

const app = express();
app.use(express.json({ limit: '80mb' }));

app.get('/api/dev-db/health', (_request, response) => {
  response.json({ ok: true, dbPath });
});

app.get('/api/dev-db/state/:key', (request, response) => {
  const relational = readRelationalState(request.params.key);
  if (relational !== undefined) {
    response.json({ value: JSON.stringify(relational), source: 'relational' });
    return;
  }
  const row = db.prepare('SELECT value, updated_at FROM app_state WHERE key = ? LIMIT 1').get(request.params.key);
  response.json(row ?? null);
});

app.put('/api/dev-db/state/:key', (request, response) => {
  const rawValue = request.body.value;
  const value = JSON.stringify(rawValue);
  const updatedAt = new Date().toISOString();
  const key = request.params.key;
  const previous = readRelationalState(key) ?? parseJsonField(
    (db.prepare('SELECT value FROM app_state WHERE key = ? LIMIT 1').get(key) as { value?: string } | undefined)?.value,
    undefined
  );
  const actions = buildChangeActions(key, previous, rawValue);
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, updatedAt);
    mirrorStateTable(key, rawValue);
    for (const action of actions) {
      recordAction(action.actionType, action.entityType, action.entityId, action.payload);
    }
  });
  transaction();
  response.json({ ok: true, updatedAt });
});

app.post('/api/dev-db/sync-queue', (request, response) => {
  const { entityType, entityId, payload } = request.body as {
    entityType?: string;
    entityId?: string;
    payload?: unknown;
  };
  if (!entityType || !entityId) {
    response.status(400).json({ error: 'entityType and entityId are required' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO sync_queue (entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?)'
  ).run(entityType, entityId, JSON.stringify(payload), new Date().toISOString());
  recordAction('enqueue', entityType, entityId, payload);
  response.json({ ok: true, id: result.lastInsertRowid });
});

app.post('/api/dev-db/rebuild-relational', (_request, response) => {
  const rows = db.prepare('SELECT key, value FROM app_state').all() as { key: string; value: string }[];
  const transaction = db.transaction(() => {
    for (const row of rows) mirrorStateTable(row.key, JSON.parse(row.value));
  });
  transaction();
  response.json({ ok: true, rebuiltKeys: rows.map(row => row.key) });
});

app.get('/api/dev-db/tables/:table', (request, response) => {
  const allowedTables = [
    'app_state',
    'sync_queue',
    'action_log',
    'events',
    'competitions',
    'competition_rounds',
    'athletes',
    'judges',
    'scores',
    'faults',
    'admins',
    'settings'
  ];
  if (!allowedTables.includes(request.params.table)) {
    response.status(404).json({ error: 'Unknown table' });
    return;
  }
  const rows = db.prepare(`SELECT * FROM ${request.params.table} ORDER BY rowid DESC LIMIT 500`).all();
  response.json(rows);
});

app.listen(port, () => {
  console.log(`MDiabolo dev SQLite DB: ${dbPath}`);
  console.log(`MDiabolo dev DB server: http://localhost:${port}/api/dev-db/health`);
});
