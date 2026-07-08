import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

interface KeyValueRow {
  value: string;
}

interface DevDbRow {
  value: string;
}

class AppRepository {
  private database: SQLiteDBConnection | null = null;
  private readyPromise: Promise<void> | null = null;
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
    await fetch(`/api/dev-db/state/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
  }

  private async replaceNativeRows<T>(
    table: string,
    rows: T[],
    insertSql: string,
    mapRow: (row: T, updatedAt: string) => unknown[]
  ): Promise<void> {
    if (!this.database) return;
    const updatedAt = new Date().toISOString();
    await this.database.execute(`DELETE FROM ${table}`);
    for (const row of rows) {
      await this.database.run(insertSql, mapRow(row, updatedAt));
    }
  }

  private async mirrorNativeState(key: string, value: unknown): Promise<void> {
    if (!this.database) return;
    if (key === 'events' && Array.isArray(value)) {
      await this.replaceNativeRows('events', value, `
        INSERT INTO events (id, name, name_zh, name_en, poster, background_theme, background_video, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, (event: any, updatedAt) => [event.id, event.name, event.nameZh ?? null, event.nameEn ?? null, event.poster ?? '', event.backgroundTheme ?? null, event.backgroundVideo ?? null, updatedAt]);
    }
    if (key === 'competitions' && Array.isArray(value)) {
      await this.replaceNativeRows('competitions', value, `
        INSERT INTO competitions (id, event_id, name, name_zh, name_en, type, region, division, status, fault_deduction, chief_judge, recorder, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (competition: any, updatedAt) => [
        competition.id, competition.eventId, competition.name, competition.nameZh ?? null, competition.nameEn ?? null,
        competition.type, competition.region ?? '', competition.division ?? '', competition.status, competition.faultDeduction ?? 0,
        competition.chiefJudge ?? null, competition.recorder ?? null, updatedAt
      ]);
      const rounds = value.flatMap((competition: any) => (competition.rounds ?? []).map((round: any) => ({ ...round, competitionId: competition.id })));
      await this.replaceNativeRows('competition_rounds', rounds, `
        INSERT INTO competition_rounds (id, competition_id, name, name_zh, name_en, sequence, status, advancing_count, athlete_ids, start_time, announcement_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (round: any, updatedAt) => [
        round.id, round.competitionId, round.name, round.nameZh ?? null, round.nameEn ?? null, round.sequence, round.status,
        round.advancingCount ?? null, JSON.stringify(round.athleteIds ?? []), round.startTime ?? null, round.announcementTime ?? null, updatedAt
      ]);
    }
    if (key === 'athletes' && Array.isArray(value)) {
      await this.replaceNativeRows('athletes', value, `
        INSERT INTO athletes (id, display_order, name, name_zh, name_en, school, age, gender, country, team_name, competition_ids, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (athlete: any, updatedAt) => [
        athlete.id, athlete.order, athlete.name, athlete.nameZh ?? null, athlete.nameEn ?? null, athlete.school ?? '',
        athlete.age ?? null, athlete.gender ?? '', athlete.country ?? '', athlete.teamName ?? null, JSON.stringify(athlete.competitionIds ?? []), updatedAt
      ]);
    }
    if (key === 'judges' && Array.isArray(value)) {
      await this.replaceNativeRows('judges', value, `
        INSERT INTO judges (id, name, name_zh, name_en, role, competition_ids, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, (judge: any, updatedAt) => [judge.id, judge.name, judge.nameZh ?? null, judge.nameEn ?? null, judge.role, JSON.stringify(judge.competitionIds ?? []), updatedAt]);
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
      ]);
    }
    if (key === 'faults' && Array.isArray(value)) {
      await this.replaceNativeRows('faults', value, `
        INSERT INTO faults (id, competition_id, round_id, athlete_id, judge_id, faults_count, deduction_per_fault, deduction_amount, submitted_at, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, (fault: any, updatedAt) => [
        fault.id, fault.competitionId, fault.roundId, fault.athleteId, fault.judgeId, fault.faultsCount,
        fault.deductionPerFault, fault.deductionAmount, fault.submittedAt, fault.syncStatus ?? null, updatedAt
      ]);
    }
    if (key === 'admins' && Array.isArray(value)) {
      await this.replaceNativeRows('admins', value, `
        INSERT INTO admins (id, name, salt, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, (admin: any, updatedAt) => [admin.id, admin.name, admin.salt, admin.passwordHash, admin.createdAt, updatedAt]);
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
      ]);
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
    const result = await this.database.query('SELECT value FROM app_state WHERE key = ? LIMIT 1', [key]);
    const row = result.values?.[0] as KeyValueRow | undefined;
    return row ? JSON.parse(row.value) as T : fallback;
  }

  async save<T>(key: string, value: T): Promise<void> {
    await this.ready();
    const json = JSON.stringify(value);
    if (this.useDevDatabase) {
      await this.saveToDevDatabase(key, value);
      return;
    }
    if (!this.database) {
      localStorage.setItem(`mdiabolo:v2:${key}`, json);
      return;
    }
    await this.database.run(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, json, new Date().toISOString()]
    );
    await this.mirrorNativeState(key, value);
  }

  async enqueue(entityType: 'score' | 'fault', entityId: string, payload: unknown): Promise<void> {
    await this.ready();
    if (this.useDevDatabase) {
      await fetch('/api/dev-db/sync-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, payload })
      });
      return;
    }
    if (!this.database) return;
    await this.database.run(
      'INSERT INTO sync_queue (entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
      [entityType, entityId, JSON.stringify(payload), new Date().toISOString()]
    );
  }
}

export const repository = new AppRepository();
