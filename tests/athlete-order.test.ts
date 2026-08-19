import assert from 'node:assert/strict';
import test from 'node:test';
import type { Athlete } from '../src/initialData';
import {
  getAthleteCompetitionOrder,
  normalizeAthleteCompetitionOrders,
  removeAthleteCompetitionOrder,
  setAthleteCompetitionOrder
} from '../src/utils/athleteOrder';

const athlete = (
  id: string,
  order: number,
  competitionIds: string[],
  competitionOrders?: Record<string, number>
): Athlete => ({
  id,
  order,
  competitionOrders,
  name: id,
  school: '',
  age: 18,
  gender: 'Male',
  country: '',
  teamName: null,
  competitionIds
});

test('legacy global orders are renumbered independently from 1 for each competition', () => {
  const normalized = normalizeAthleteCompetitionOrders([
    athlete('A', 10, ['C1', 'C2']),
    athlete('B', 20, ['C1']),
    athlete('C', 30, ['C2'])
  ]);
  const byId = new Map(normalized.map(item => [item.id, item]));

  assert.equal(getAthleteCompetitionOrder(byId.get('A')!, 'C1'), 1);
  assert.equal(getAthleteCompetitionOrder(byId.get('B')!, 'C1'), 2);
  assert.equal(getAthleteCompetitionOrder(byId.get('A')!, 'C2'), 1);
  assert.equal(getAthleteCompetitionOrder(byId.get('C')!, 'C2'), 2);
});

test('competition-specific order can differ for the same athlete', () => {
  const normalized = normalizeAthleteCompetitionOrders([
    athlete('A', 1, ['C1', 'C2'], { C1: 2, C2: 1 }),
    athlete('B', 2, ['C1', 'C2'], { C1: 1, C2: 2 })
  ]);
  const byId = new Map(normalized.map(item => [item.id, item]));

  assert.deepEqual(byId.get('A')!.competitionOrders, { C1: 2, C2: 1 });
  assert.deepEqual(byId.get('B')!.competitionOrders, { C1: 1, C2: 2 });
});

test('assigning and removing a competition order does not alter other competitions', () => {
  const assigned = setAthleteCompetitionOrder(athlete('A', 8, ['C1', 'C2'], { C1: 1 }), 'C2', 3);
  assert.deepEqual(assigned.competitionOrders, { C1: 1, C2: 3 });

  const removed = removeAthleteCompetitionOrder(assigned, 'C1');
  assert.deepEqual(removed.competitionOrders, { C2: 3 });
});
