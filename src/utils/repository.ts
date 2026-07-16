import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { ActionLogEntry } from './qr';
import {
  type FaultSubmission,
  type ScoreSubmission
} from '../initialData';

interface KeyValueRow {
  value: string;
}

interface DevDbRow {
  value: string;
}

interface DevActionRow {
  id: number;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: string;
  created_at: string;
}

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

class AppRepository {
  private database: SQLiteDBConnection | null = null;
  private readyPromise: Promise<void> | null = null;
  private transactionQueue: Promise<void> = Promise.resolve();
  private useDevDatabase = false;

  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.initialize();
    return this.readyPromise;
  }

  private async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.useDevDatabase = await this.checkDevDatabase();
      return;
    }
    try {
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const consistency = await sqlite.checkConnectionsConsistency();
      const connected = (await sqlite.isConnection('mdiabolo', false)).result;
      this.database = consistency.result && connected
        ? await sqlite.retrieveConnection('mdiabolo', false)
        : await sqlite.createConnection('mdiabolo', false, 'no-encryption', 1, false);
      await this.database.open();
      await this.database.execute(`
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
          section TEXT,
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
      await this.database.execute("ALTER TABLE athletes ADD COLUMN section TEXT", false).catch(() => undefined);
      await this.seedNativeDatabaseIfNeeded();
    } catch (error) {
      console.warn('Native SQLite initialization failed; falling back to localStorage.', error);
      this.database = null;
    }
  }

  private async checkDevDatabase(): Promise<boolean> {
    if (!import.meta.env.DEV) return false;
    try {
      const response = await fetch('/api/dev-db/health');
      return response.ok;
    } catch {
      return false;
    }
  }

  private async loadFromDevDatabase<T>(key: string, fallback: T): Promise<T> {
    const response = await fetch(`/api/dev-db/state/${encodeURIComponent(key)}`);
    if (!response.ok) return fallback;
    const row = await response.json() as DevDbRow | null;
    return row?.value ? JSON.parse(row.value) as T : fallback;
  }

  private async saveToDevDatabase<T>(key: string, value: T): Promise<void> {
    const response = await fetch(`/api/dev-db/state/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) throw new Error(`Dev SQLite save failed: ${response.status}`);
  }

  private async recordAction(actionType: string, entityType: string, entityId: string | null, payload: unknown, transaction = true): Promise<void> {
    if (!this.database) return;
    await this.database.run(
      'INSERT INTO action_log (action_type, entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      [actionType, entityType, entityId, JSON.stringify(payload), new Date().toISOString()],
      transaction
    );
  }

  private recordLocalAction(actionType: string, entityType: string, entityId: string | null, payload: unknown): void {
    const actions = parseJsonField<ActionLogEntry[]>(localStorage.getItem('mdiabolo:v2:action_log'), []);
    actions.push({ actionType, entityType, entityId, payload, createdAt: new Date().toISOString() });
    localStorage.setItem('mdiabolo:v2:action_log', JSON.stringify(actions.slice(-500)));
  }

  private async runInTransaction(work: () => Promise<void>): Promise<void> {
    if (!this.database) {
      await work();
      return;
    }
    const run = async () => {
      await this.database!.beginTransaction();
      try {
        await work();
        await this.database!.commitTransaction();
      } catch (error) {
        await this.database!.rollbackTransaction().catch(() => undefined);
        throw error;
      }
    };
    const queued = this.transactionQueue.catch(() => undefined).then(run);
    this.transactionQueue = queued.then(() => undefined, () => undefined);
    await queued;
  }

  private buildChangeActions(key: string, previous: unknown, next: unknown): Array<{ actionType: string; entityType: string; entityId: string | null; payload: unknown }> {
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

  private async replaceNativeRows<T>(
    table: string,
    rows: T[],
    insertSql: string,
    mapRow: (row: T, updatedAt: string) => unknown[],
    transaction = true
  ): Promise<void> {
    if (!this.database) return;
    const updatedAt = new Date().toISOString();
    await this.database.execute(`DELETE FROM ${table}`, transaction);
    for (const row of rows) {
      await this.database.run(insertSql, mapRow(row, updatedAt), transaction);
    }
  }

  private async mirrorNativeState(key: string, value: unknown, transaction = true): Promise<void> {
    if (!this.database) return;
    if (key === 'events' && Array.isArray(value)) {
      await this.replaceNativeRows('events', value, `
        INSERT INTO events (id, name, name_zh, name_en, poster, background_theme, background_video, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, (event: any, updatedAt) => [event.id, event.name, event.nameZh ?? null, event.nameEn ?? null, event.poster ?? '', event.backgroundTheme ?? null, event.backgroundVideo ?? null, updatedAt], transaction);
    }
    if (key === 'competitions' && Array.isArray(value)) {
      await this.replaceNativeRows('competitions', value, `
        INSERT INTO competitions (id, event_id, name, name_zh, name_en, type, region, division, status, fault_deduction, chief_judge, recorder, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (competition: any, updatedAt) => [
        competition.id, competition.eventId, competition.name, competition.nameZh ?? null, competition.nameEn ?? null,
        competition.type, competition.region ?? '', competition.division ?? '', competition.status, competition.faultDeduction ?? 0,
        competition.chiefJudge ?? null, competition.recorder ?? null, updatedAt
      ], transaction);
      const rounds = value.flatMap((competition: any) => (competition.rounds ?? []).map((round: any) => ({ ...round, competitionId: competition.id })));
      await this.replaceNativeRows('competition_rounds', rounds, `
        INSERT INTO competition_rounds (id, competition_id, name, name_zh, name_en, sequence, status, advancing_count, athlete_ids, start_time, announcement_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (round: any, updatedAt) => [
        round.id, round.competitionId, round.name, round.nameZh ?? null, round.nameEn ?? null, round.sequence, round.status,
        round.advancingCount ?? null, JSON.stringify(round.athleteIds ?? []), round.startTime ?? null, round.announcementTime ?? null, updatedAt
      ], transaction);
    }
    if (key === 'athletes' && Array.isArray(value)) {
      await this.replaceNativeRows('athletes', value, `
        INSERT INTO athletes (id, display_order, name, name_zh, name_en, school, age, gender, section, country, team_name, competition_ids, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (athlete: any, updatedAt) => [
        athlete.id, athlete.order, athlete.name, athlete.nameZh ?? null, athlete.nameEn ?? null, athlete.school ?? '',
        athlete.age ?? null, athlete.gender ?? '', athlete.section ?? 'Open', athlete.country ?? '', athlete.teamName ?? null, JSON.stringify(athlete.competitionIds ?? []), updatedAt
      ], transaction);
    }
    if (key === 'judges' && Array.isArray(value)) {
      await this.replaceNativeRows('judges', value, `
        INSERT INTO judges (id, name, name_zh, name_en, role, competition_ids, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, (judge: any, updatedAt) => [judge.id, judge.name, judge.nameZh ?? null, judge.nameEn ?? null, judge.role, JSON.stringify(judge.competitionIds ?? []), updatedAt], transaction);
    }
    if (key === 'scores' && Array.isArray(value)) {
      await this.replaceNativeRows('scores', value, `
        INSERT INTO scores (id, competition_id, round_id, athlete_id, judge_id, judge_name, action_difficulty, stage_artistry, action_interaction, action_creativity, action_fluency, costume_styling, total_score, submitted_at, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (score: any, updatedAt) => [
        score.id, score.competitionId, score.roundId, score.athleteId, score.judgeId, score.judgeName,
        score.dimensions?.action_difficulty ?? null, score.dimensions?.stage_artistry ?? null, score.dimensions?.action_interaction ?? null,
        score.dimensions?.action_creativity ?? null, score.dimensions?.action_fluency ?? null, score.dimensions?.costume_styling ?? null,
        score.totalScore, score.submittedAt, score.syncStatus ?? null, updatedAt
      ], transaction);
    }
    if (key === 'faults' && Array.isArray(value)) {
      await this.replaceNativeRows('faults', value, `
        INSERT INTO faults (id, competition_id, round_id, athlete_id, judge_id, faults_count, deduction_per_fault, deduction_amount, submitted_at, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (fault: any, updatedAt) => [
        fault.id, fault.competitionId, fault.roundId, fault.athleteId, fault.judgeId, fault.faultsCount,
        fault.deductionPerFault, fault.deductionAmount, fault.submittedAt, fault.syncStatus ?? null, updatedAt
      ], transaction);
    }
    if (key === 'admins' && Array.isArray(value)) {
      await this.replaceNativeRows('admins', value, `
        INSERT INTO admins (id, name, salt, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, (admin: any, updatedAt) => [admin.id, admin.name, admin.salt, admin.passwordHash, admin.createdAt, updatedAt], transaction);
    }
    if (key === 'settings' && value && typeof value === 'object') {
      const settings = value as any;
      await this.database.run(`
        INSERT INTO settings (id, active_event_id, active_competition_id, custom_background, background_history, updated_at)
        VALUES ('app', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          active_event_id = excluded.active_event_id,
          active_competition_id = excluded.active_competition_id,
          custom_background = excluded.custom_background,
          background_history = excluded.background_history,
          updated_at = excluded.updated_at
      `, [
        settings.activeEventId ?? '',
        settings.activeCompetitionId ?? null,
        settings.customBackground ? JSON.stringify(settings.customBackground) : null,
        settings.backgroundHistory ? JSON.stringify(settings.backgroundHistory) : null,
        new Date().toISOString()
      ], transaction);
    }
  }

  private async readNativeRelationalState(key: string): Promise<unknown | undefined> {
    if (!this.database) return undefined;

    if (key === 'events') {
      const result = await this.database.query('SELECT * FROM events ORDER BY id');
      return (result.values ?? []).map((row: any) => ({
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
      const competitions = (await this.database.query('SELECT * FROM competitions ORDER BY id')).values ?? [];
      const rounds = (await this.database.query('SELECT * FROM competition_rounds ORDER BY competition_id, sequence')).values ?? [];
      return competitions.map((row: any) => ({
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
        rounds: rounds.filter((round: any) => round.competition_id === row.id).map((round: any) => ({
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
      const result = await this.database.query('SELECT * FROM athletes ORDER BY display_order, id');
      return (result.values ?? []).map((row: any) => ({
        id: row.id,
        order: row.display_order,
        name: row.name,
        nameZh: row.name_zh ?? undefined,
        nameEn: row.name_en ?? undefined,
        school: row.school ?? '',
        age: row.age ?? 0,
        gender: row.gender ?? 'Male',
        section: row.section ?? 'Open',
        country: row.country ?? '',
        teamName: row.team_name,
        competitionIds: parseJsonField<string[]>(row.competition_ids, [])
      }));
    }

    if (key === 'judges') {
      const result = await this.database.query('SELECT * FROM judges ORDER BY id');
      return (result.values ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        nameZh: row.name_zh ?? undefined,
        nameEn: row.name_en ?? undefined,
        role: row.role,
        competitionIds: parseJsonField<string[]>(row.competition_ids, [])
      }));
    }

    if (key === 'scores') {
      const result = await this.database.query('SELECT * FROM scores ORDER BY submitted_at DESC, id');
      return (result.values ?? []).map((row: any) => ({
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
      const result = await this.database.query('SELECT * FROM faults ORDER BY submitted_at DESC, id');
      return (result.values ?? []).map((row: any) => ({
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
      const result = await this.database.query('SELECT * FROM admins ORDER BY created_at');
      return (result.values ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        salt: row.salt,
        passwordHash: row.password_hash,
        createdAt: row.created_at
      }));
    }

    if (key === 'settings') {
      const result = await this.database.query("SELECT * FROM settings WHERE id = 'app' LIMIT 1");
      const row = result.values?.[0] as any | undefined;
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

  private async seedNativeDatabaseIfNeeded(): Promise<void> {
    if (!this.database) return;
    const counts = await Promise.all([
      this.database.query('SELECT COUNT(*) AS count FROM events'),
      this.database.query('SELECT COUNT(*) AS count FROM competitions'),
      this.database.query('SELECT COUNT(*) AS count FROM athletes'),
      this.database.query('SELECT COUNT(*) AS count FROM judges')
    ]);
    const hasCompleteBaseData = counts.every(result => Number((result.values?.[0] as { count?: number } | undefined)?.count ?? 0) > 0);
    if (hasCompleteBaseData) return;

    const readAppState = async <T,>(key: string, fallback: T): Promise<T> => {
      const result = await this.database?.query('SELECT value FROM app_state WHERE key = ? LIMIT 1', [key]);
      const row = result?.values?.[0] as KeyValueRow | undefined;
      if (!row?.value) return fallback;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return fallback;
      }
    };

    const seedEntries: [string, unknown][] = [
      ['events', await readAppState('events', [])],
      ['competitions', await readAppState('competitions', [])],
      ['athletes', await readAppState('athletes', [])],
      ['judges', await readAppState('judges', [])],
      ['scores', await readAppState('scores', [])],
      ['faults', await readAppState('faults', [])],
      ['admins', await readAppState('admins', [])],
      ['settings', await readAppState('settings', { activeEventId: '' })]
    ];
    for (const [key, value] of seedEntries) {
      await this.database.run(
        `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), new Date().toISOString()]
      );
      await this.mirrorNativeState(key, value);
    }
  }

  async load<T>(key: string, fallback: T): Promise<T> {
    await this.ready();
    if (this.useDevDatabase) {
      try {
        return await this.loadFromDevDatabase(key, fallback);
      } catch {
        return fallback;
      }
    }
    if (!this.database) {
      try {
        const value = localStorage.getItem(`mdiabolo:v2:${key}`);
        return value ? JSON.parse(value) as T : fallback;
      } catch {
        return fallback;
      }
    }
    try {
      const relational = await this.readNativeRelationalState(key);
      if (relational !== undefined) return relational as T;
    } catch (error) {
      console.warn(`Native relational read failed for ${key}; falling back to app_state.`, error);
    }
    try {
      const result = await this.database.query('SELECT value FROM app_state WHERE key = ? LIMIT 1', [key]);
      const row = result.values?.[0] as KeyValueRow | undefined;
      return row ? JSON.parse(row.value) as T : fallback;
    } catch (error) {
      console.warn(`Native app_state read failed for ${key}; using fallback.`, error);
      return fallback;
    }
  }

  async save<T>(key: string, value: T): Promise<void> {
    await this.ready();
    const json = JSON.stringify(value);
    if (this.useDevDatabase) {
      await this.saveToDevDatabase(key, value);
      return;
    }
    if (!this.database) {
      const previous = parseJsonField<T>(localStorage.getItem(`mdiabolo:v2:${key}`), undefined as T);
      localStorage.setItem(`mdiabolo:v2:${key}`, json);
      const actions = parseJsonField<ActionLogEntry[]>(localStorage.getItem('mdiabolo:v2:action_log'), []);
      this.buildChangeActions(key, previous, value).forEach(action => actions.push({ ...action, createdAt: new Date().toISOString() }));
      localStorage.setItem('mdiabolo:v2:action_log', JSON.stringify(actions.slice(-500)));
      return;
    }
    const previous = await this.load<T>(key, undefined as T).catch(error => {
      console.warn(`Previous value read failed for ${key}; saving without change diff.`, error);
      return undefined as T;
    });
    const actions = this.buildChangeActions(key, previous, value);
    await this.runInTransaction(async () => {
      await this.database!.run(
        `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, json, new Date().toISOString()],
        false
      );
      await this.mirrorNativeState(key, value, false);
      for (const action of actions) {
        await this.recordAction(action.actionType, action.entityType, action.entityId, action.payload, false);
      }
    });
  }

  async enqueue(entityType: 'score' | 'fault', entityId: string, payload: unknown): Promise<void> {
    await this.ready();
    if (this.useDevDatabase) {
      const response = await fetch('/api/dev-db/sync-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, payload })
      });
      if (!response.ok) throw new Error(`Dev SQLite enqueue failed: ${response.status}`);
      return;
    }
    if (!this.database) return;
    await this.database.run(
      'INSERT INTO sync_queue (entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
      [entityType, entityId, JSON.stringify(payload), new Date().toISOString()]
    );
  }

  async saveScoreRecord(score: ScoreSubmission): Promise<void> {
    await this.ready();
    if (this.useDevDatabase) {
      await this.saveToDevDatabase('scores', [score, ...await this.load<ScoreSubmission[]>('scores', []).then(items => items.filter(item => item.id !== score.id))]);
      return;
    }
    if (!this.database) {
      const scores = parseJsonField<ScoreSubmission[]>(localStorage.getItem('mdiabolo:v2:scores'), []);
      const next = [score, ...scores.filter(item => item.id !== score.id)];
      localStorage.setItem('mdiabolo:v2:scores', JSON.stringify(next));
      this.recordLocalAction('upsert', 'score', score.id, score);
      return;
    }
    const updatedAt = new Date().toISOString();
    await this.runInTransaction(async () => {
      await this.database!.run(`
        INSERT INTO scores (id, competition_id, round_id, athlete_id, judge_id, judge_name, action_difficulty, stage_artistry, action_interaction, action_creativity, action_fluency, costume_styling, total_score, submitted_at, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          competition_id = excluded.competition_id,
          round_id = excluded.round_id,
          athlete_id = excluded.athlete_id,
          judge_id = excluded.judge_id,
          judge_name = excluded.judge_name,
          action_difficulty = excluded.action_difficulty,
          stage_artistry = excluded.stage_artistry,
          action_interaction = excluded.action_interaction,
          action_creativity = excluded.action_creativity,
          action_fluency = excluded.action_fluency,
          costume_styling = excluded.costume_styling,
          total_score = excluded.total_score,
          submitted_at = excluded.submitted_at,
          sync_status = excluded.sync_status,
          updated_at = excluded.updated_at
      `, [
        score.id, score.competitionId, score.roundId, score.athleteId, score.judgeId, score.judgeName,
        score.dimensions?.action_difficulty ?? null, score.dimensions?.stage_artistry ?? null, score.dimensions?.action_interaction ?? null,
        score.dimensions?.action_creativity ?? null, score.dimensions?.action_fluency ?? null, score.dimensions?.costume_styling ?? null,
        score.totalScore, score.submittedAt, score.syncStatus ?? null, updatedAt
      ], false);
      await this.recordAction('upsert', 'score', score.id, score, false);
    });
  }

  async saveFaultRecord(fault: FaultSubmission): Promise<void> {
    await this.ready();
    if (this.useDevDatabase) {
      await this.saveToDevDatabase('faults', [fault, ...await this.load<FaultSubmission[]>('faults', []).then(items => items.filter(item => item.id !== fault.id))]);
      return;
    }
    if (!this.database) {
      const faults = parseJsonField<FaultSubmission[]>(localStorage.getItem('mdiabolo:v2:faults'), []);
      const next = [fault, ...faults.filter(item => item.id !== fault.id)];
      localStorage.setItem('mdiabolo:v2:faults', JSON.stringify(next));
      this.recordLocalAction('upsert', 'fault', fault.id, fault);
      return;
    }
    const updatedAt = new Date().toISOString();
    await this.runInTransaction(async () => {
      await this.database!.run(`
        INSERT INTO faults (id, competition_id, round_id, athlete_id, judge_id, faults_count, deduction_per_fault, deduction_amount, submitted_at, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          competition_id = excluded.competition_id,
          round_id = excluded.round_id,
          athlete_id = excluded.athlete_id,
          judge_id = excluded.judge_id,
          faults_count = excluded.faults_count,
          deduction_per_fault = excluded.deduction_per_fault,
          deduction_amount = excluded.deduction_amount,
          submitted_at = excluded.submitted_at,
          sync_status = excluded.sync_status,
          updated_at = excluded.updated_at
      `, [
        fault.id, fault.competitionId, fault.roundId, fault.athleteId, fault.judgeId, fault.faultsCount,
        fault.deductionPerFault, fault.deductionAmount, fault.submittedAt, fault.syncStatus ?? null, updatedAt
      ], false);
      await this.recordAction('upsert', 'fault', fault.id, fault, false);
    });
  }

  async loadActionLog(limit = 500): Promise<ActionLogEntry[]> {
    await this.ready();
    if (this.useDevDatabase) {
      const response = await fetch('/api/dev-db/tables/action_log');
      if (!response.ok) return [];
      const rows = await response.json() as DevActionRow[];
      return rows.slice(0, limit).map(row => ({
        id: row.id,
        actionType: row.action_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        payload: parseJsonField(row.payload, null),
        createdAt: row.created_at
      })).reverse();
    }
    if (!this.database) {
      return parseJsonField<ActionLogEntry[]>(localStorage.getItem('mdiabolo:v2:action_log'), []).slice(-limit);
    }
    const result = await this.database.query(
      'SELECT id, action_type, entity_type, entity_id, payload, created_at FROM action_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
    return (result.values ?? []).map((row: any) => ({
      id: row.id,
      actionType: row.action_type,
      entityType: row.entity_type,
      entityId: row.entity_id ?? null,
      payload: parseJsonField(row.payload, null),
      createdAt: row.created_at
    })).reverse();
  }
}

export const repository = new AppRepository();
