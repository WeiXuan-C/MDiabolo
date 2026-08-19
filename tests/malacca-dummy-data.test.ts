import assert from 'node:assert/strict';
import test from 'node:test';
import { MALACCA_DUMMY_ATHLETES, MALACCA_DUMMY_COMPETITIONS, MALACCA_DUMMY_JUDGES } from '../src/malaccaDummyData';

test('Malacca dummy data covers every reviewed competition and judge panel', () => {
  assert.equal(MALACCA_DUMMY_COMPETITIONS.length, 20);
  assert.ok(MALACCA_DUMMY_ATHLETES.length >= 40);
  const scoringJudges = MALACCA_DUMMY_JUDGES.filter(judge => judge.role === 'Scoring');
  for (const competition of MALACCA_DUMMY_COMPETITIONS) {
    assert.equal(competition.rounds.length, 1);
    assert.ok(competition.rounds[0].athleteIds.length >= 6);
    assert.equal(scoringJudges.filter(judge => judge.competitionIds.includes(competition.id)).length, 3);
  }
});

test('Malacca athlete assignments match competition rounds', () => {
  const athleteIds = new Set(MALACCA_DUMMY_ATHLETES.map(athlete => athlete.id));
  for (const competition of MALACCA_DUMMY_COMPETITIONS) {
    for (const athleteId of competition.rounds[0].athleteIds) {
      assert.ok(athleteIds.has(athleteId));
      assert.ok(MALACCA_DUMMY_ATHLETES.find(item => item.id === athleteId)?.competitionIds.includes(competition.id));
    }
  }
});
