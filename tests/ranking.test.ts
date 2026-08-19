import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCurrentScoringRules,
  getDefaultFaultDeduction,
  getDimensionsConfig,
  type Athlete,
  type Competition,
  type FaultSubmission,
  type ScoreSubmission
} from '../src/initialData';
import { calculatePlaceMethodRankings } from '../src/utils/ranking';

const athletes: Athlete[] = ['A', 'B', 'C'].map((id, index) => ({
  id, order: index + 1, name: id, school: 'Test', age: 18, gender: 'Male', country: 'Test', teamName: null, competitionIds: ['C1']
}));
const competition: Competition = {
  id: 'C1', eventId: 'E1', name: 'Test', type: 'Challenge', region: 'Test', division: 'Open',
  status: 'Active', faultDeduction: 2,
  rounds: [{ id: 'R1', name: 'Final', sequence: 1, status: 'Active', athleteIds: athletes.map(item => item.id), advancingCount: null }]
};
const judges = ['J1', 'J2', 'J3'].map(id => ({ id, name: id }));
const score = (athleteId: string, judgeId: string, totalScore: number): ScoreSubmission => ({
  id: `C1_R1_${athleteId}_${judgeId}`, competitionId: 'C1', roundId: 'R1', athleteId, judgeId,
  judgeName: judgeId, dimensions: { action_difficulty: totalScore, action_creativity: 0, action_fluency: 0 },
  totalScore, submittedAt: '2026-07-04T00:00:00Z'
});

test('uses the client 2026 100-point dimension limits and fault defaults', () => {
  assert.deepEqual(getDimensionsConfig('Challenge').map(item => item.max), [50, 30, 20]);
  assert.deepEqual(getDimensionsConfig('Individual Stage').map(item => item.max), [30, 25, 20, 15, 10]);
  assert.deepEqual(getDimensionsConfig('Duo/Team Stage').map(item => item.max), [35, 25, 15, 15, 10]);
  assert.equal(getDefaultFaultDeduction('Challenge'), 2);
  assert.equal(getDefaultFaultDeduction('Individual Stage'), 2);
  assert.equal(getDefaultFaultDeduction('Duo/Team Stage'), 3);
});

test('migrates existing competitions to the client 2026 deduction rule once', () => {
  const migrated = applyCurrentScoringRules({ ...competition, faultDeduction: 0.5, scoringRuleVersion: undefined });
  assert.equal(migrated.faultDeduction, 2);
  assert.equal(migrated.scoringRuleVersion, 'client-2026-v1');

  const customized = applyCurrentScoringRules({ ...migrated, faultDeduction: 2.5 });
  assert.equal(customized.faultDeduction, 2.5);
});

test('matches the three-judge template place-method calculation', () => {
  const officialScores = [
    score('A', 'J1', 94), score('A', 'J2', 94), score('A', 'J3', 92),
    score('B', 'J1', 90), score('B', 'J2', 94), score('B', 'J3', 92),
    score('C', 'J1', 91), score('C', 'J2', 95), score('C', 'J3', 91)
  ];
  const rows = calculatePlaceMethodRankings(competition, 'R1', athletes, officialScores, [], judges);
  assert.deepEqual(
    rows.map(row => ({ athlete: row.athlete.id, points: row.pairwisePoints, rank: row.finalRank })),
    [
      { athlete: 'A', points: 2, rank: 1 },
      { athlete: 'C', points: 1, rank: 2 },
      { athlete: 'B', points: 0, rank: 3 }
    ]
  );
});

test('awards 0.5 each when neither athlete has a strict majority', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const scores = [
    score('A', 'J1', 10), score('B', 'J1', 9),
    score('B', 'J2', 12), score('A', 'J2', 10),
    score('A', 'J3', 10), score('B', 'J3', 10)
  ];
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, [], judges);
  assert.deepEqual(rows.map(row => row.pairwisePoints), [0.5, 0.5]);
});

test('does not use average score to break equal place-method points', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const scores = [
    score('A', 'J1', 10), score('B', 'J1', 9),
    score('B', 'J2', 12), score('A', 'J2', 10),
    score('A', 'J3', 10), score('B', 'J3', 10)
  ];
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, [], judges);
  const byId = new Map(rows.map(row => [row.athlete.id, row]));
  assert.equal(byId.get('A')?.finalRank, 1);
  assert.equal(byId.get('B')?.finalRank, 1);
  assert.equal(byId.get('B')?.totalScoreRank, 1);
  assert.equal(byId.get('A')?.totalScoreRank, 2);
});

test('treats zero and deduction-to-zero submissions as completed scores', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const faults: FaultSubmission[] = [{
    id: 'F-A', competitionId: 'C1', roundId: 'R1', athleteId: 'A', judgeId: 'TECH',
    faultsCount: 1, deductionPerFault: 2, deductionAmount: 2, submittedAt: '2026-07-04T00:00:00Z'
  }];
  const scores = [
    score('A', 'J1', 2), score('A', 'J2', 10), score('A', 'J3', 10),
    score('B', 'J1', 0), score('B', 'J2', 10), score('B', 'J3', 10)
  ];
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, faults, judges);
  assert.equal(rows.every(row => row.complete), true);
  assert.deepEqual(rows.map(row => row.completedJudges), [3, 3]);
  assert.equal(rows.every(row => row.scoresByJudge.J1.score === 0), true);
});

test('treats submitted scores below 30 as completed scores', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A'] }] };
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, [
    score('A', 'J1', 29), score('A', 'J2', 16), score('A', 'J3', 1)
  ], [], judges);
  assert.equal(rows[0].complete, true);
  assert.equal(rows[0].completedJudges, 3);
  assert.deepEqual(rows[0].judgeScores.map(item => item.score), [29, 16, 1]);
});

test('requires exactly three effective judge scores for a final rank', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, [
    score('A', 'J1', 10), score('A', 'J2', 10), score('B', 'J1', 9), score('B', 'J2', 9)
  ], [], judges);
  assert.equal(rows.every(row => !row.complete), true);
  assert.equal(rows.every(row => row.requiredJudges === 3), true);
});
