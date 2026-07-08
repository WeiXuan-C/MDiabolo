import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateCompetitions } from '../src/utils/bilingual';
import type { Competition } from '../src/initialData';

const legacy: Competition = {
  id: 'C1',
  eventId: 'E1',
  name: '个人舞台赛',
  type: 'Individual Stage',
  region: 'Taiwan',
  division: 'Open',
  status: 'Active',
  faultDeduction: 0.5,
  rounds: [{
    id: 'R1',
    name: '预赛',
    sequence: 1,
    status: 'Active',
    athleteIds: [],
    advancingCount: null
  }]
};

const bilingual: Competition = {
  ...legacy,
  nameZh: '个人舞台赛',
  nameEn: 'Individual Stage',
  rounds: [{ ...legacy.rounds[0], nameZh: '预赛', nameEn: 'Qualifier' }]
};

test('migrates legacy competition and round names from seeded translations', () => {
  const [result] = migrateCompetitions([legacy], [bilingual]);
  assert.equal(result.nameZh, '个人舞台赛');
  assert.equal(result.nameEn, 'Individual Stage');
  assert.equal(result.rounds[0].nameEn, 'Qualifier');
});

test('preserves user-entered translations during migration', () => {
  const custom = { ...legacy, nameZh: '自订比赛', nameEn: 'Custom Competition' };
  const [result] = migrateCompetitions([custom], [bilingual]);
  assert.equal(result.nameZh, '自订比赛');
  assert.equal(result.nameEn, 'Custom Competition');
});
