import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MALACCA_DUMMY_ATHLETES, MALACCA_DUMMY_COMPETITIONS, MALACCA_DUMMY_EVENT, MALACCA_DUMMY_JUDGES } from '../src/malaccaDummyData';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'mdiabolo.sqlite');
const backupDir = path.join(dataDir, 'backups');
const now = new Date().toISOString();
fs.mkdirSync(backupDir, { recursive: true });
if (fs.existsSync(dbPath)) {
  const stamp = now.replaceAll(':', '-').replaceAll('.', '-');
  fs.copyFileSync(dbPath, path.join(backupDir, `mdiabolo-before-malacca-${stamp}.sqlite`));
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
const competitionColumns = new Set((db.pragma('table_info(competitions)') as Array<{ name: string }>).map(column => column.name));
if (!competitionColumns.has('scoring_rule_version')) {
  db.exec('ALTER TABLE competitions ADD COLUMN scoring_rule_version TEXT');
}
const events = [MALACCA_DUMMY_EVENT];
const competitions = MALACCA_DUMMY_COMPETITIONS;
const athletes = MALACCA_DUMMY_ATHLETES;
const judges = MALACCA_DUMMY_JUDGES;
const settings = { activeEventId: MALACCA_DUMMY_EVENT.id };
const putState = db.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);

db.transaction(() => {
  for (const [key, value] of Object.entries({ events, competitions, athletes, judges, scores: [], faults: [], settings })) {
    putState.run(key, JSON.stringify(value), now);
  }
  for (const table of ['events', 'competition_rounds', 'competitions', 'athletes', 'judges', 'scores', 'faults', 'settings']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  const insertEvent = db.prepare(`INSERT INTO events (id, name, name_zh, name_en, poster, background_theme, background_video, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  events.forEach(event => insertEvent.run(event.id, event.name, event.nameZh, event.nameEn, event.poster, event.backgroundTheme, event.backgroundVideo ?? null, now));

  const insertCompetition = db.prepare(`INSERT INTO competitions (id, event_id, name, name_zh, name_en, type, region, division, status, fault_deduction, scoring_rule_version, chief_judge, recorder, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertRound = db.prepare(`INSERT INTO competition_rounds (id, competition_id, name, name_zh, name_en, sequence, status, advancing_count, athlete_ids, start_time, announcement_time, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const competition of competitions) {
    insertCompetition.run(competition.id, competition.eventId, competition.name, competition.nameZh, competition.nameEn, competition.type, competition.region, competition.division, competition.status, competition.faultDeduction, competition.scoringRuleVersion, competition.chiefJudge ?? null, competition.recorder ?? null, now);
    for (const round of competition.rounds) {
      insertRound.run(round.id, competition.id, round.name, round.nameZh, round.nameEn, round.sequence, round.status, round.advancingCount, JSON.stringify(round.athleteIds), round.startTime ?? null, round.announcementTime ?? null, now);
    }
  }

  const insertAthlete = db.prepare(`INSERT INTO athletes (id, display_order, name, name_zh, name_en, school, age, gender, country, team_name, competition_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  athletes.forEach(athlete => insertAthlete.run(athlete.id, athlete.order, athlete.name, athlete.nameZh, athlete.nameEn, athlete.school, athlete.age, athlete.gender, athlete.country, athlete.teamName, JSON.stringify(athlete.competitionIds), now));

  const insertJudge = db.prepare(`INSERT INTO judges (id, name, name_zh, name_en, role, competition_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  judges.forEach(judge => insertJudge.run(judge.id, judge.name, judge.nameZh, judge.nameEn, judge.role, JSON.stringify(judge.competitionIds), now));
  db.prepare(`INSERT INTO settings (id, active_event_id, active_competition_id, custom_background, background_history, updated_at) VALUES ('app', ?, NULL, NULL, NULL, ?)`)
    .run(settings.activeEventId, now);
})();

db.close();
console.log(`Seeded ${events.length} event, ${competitions.length} competitions, ${athletes.length} athletes, and ${judges.length} judges.`);
