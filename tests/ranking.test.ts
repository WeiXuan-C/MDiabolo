import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePlaceMethodRankings } from '../src/utils/ranking';
import type { Athlete, Competition, ScoreSubmission } from '../src/initialData';

const athletes: Athlete[] = ['A', 'B', 'C'].map((id, index) => ({
  id, order: index + 1, name: id, school: 'Test', age: 18, gender: 'Male', country: 'Test', teamName: null, competitionIds: ['C1']
}));
const competition: Competition = {
  id: 'C1', eventId: 'E1', name: 'Test', type: 'Challenge', region: 'Test', division: 'Open',
  status: 'Active', faultDeduction: 0.5,
  rounds: [{ id: 'R1', name: 'Final', sequence: 1, status: 'Active', athleteIds: athletes.map(item => item.id), advancingCount: null }]
};
const judges = ['J1', 'J2', 'J3', 'J4'].map(id => ({ id, name: id }));
const score = (athleteId: string, judgeId: string, totalScore: number): ScoreSubmission => ({
  id: `C1_R1_${athleteId}_${judgeId}`, competitionId: 'C1', roundId: 'R1', athleteId, judgeId,
  judgeName: judgeId, dimensions: { action_difficulty: totalScore, action_creativity: 0, action_fluency: 0 },
  totalScore, submittedAt: '2026-07-04T00:00:00Z'
});

test('uses strict majority pairwise points instead of summed places', () => {
  const scores = [
    score('A', 'J1', 10), score('B', 'J1', 9), score('C', 'J1', 8),
    score('A', 'J2', 10), score('B', 'J2', 9), score('C', 'J2', 8),
    score('A', 'J3', 10), score('B', 'J3', 9), score('C', 'J3', 8),
    score('B', 'J4', 10), score('A', 'J4', 9), score('C', 'J4', 8)
  ];
  const rows = calculatePlaceMethodRankings(competition, 'R1', athletes, scores, [], judges);
  assert.equal(rows[0].athlete.id, 'A');
  assert.equal(rows[0].pairwisePoints, 2);
  assert.equal(rows[0].wins, 2);
});

test('gives both athletes 0.5 for an evenly split comparison', () => {
  const scores = [
    score('A', 'J1', 10), score('B', 'J1', 9), score('A', 'J2', 10), score('B', 'J2', 9),
    score('B', 'J3', 10), score('A', 'J3', 9), score('B', 'J4', 10), score('A', 'J4', 9)
  ];
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, [], judges);
  assert.deepEqual(rows.map(row => row.pairwisePoints), [0.5, 0.5]);
});

test('marks incomplete score sets as provisional', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, [score('A', 'J1', 10), score('B', 'J1', 9)], [], judges);
  assert.equal(rows.every(row => !row.complete), true);
  assert.equal(rows[0].completedJudges, 1);
});

test('matches the official A/B/C place-method example', () => {
  const officialScores = [
    score('A', 'J1', 94), score('A', 'J2', 94), score('A', 'J3', 92), score('A', 'J4', 94),
    score('B', 'J1', 90), score('B', 'J2', 94), score('B', 'J3', 92), score('B', 'J4', 95),
    score('C', 'J1', 91), score('C', 'J2', 95), score('C', 'J3', 91), score('C', 'J4', 96)
  ];
  const rows = calculatePlaceMethodRankings(competition, 'R1', athletes, officialScores, [], judges);
  assert.deepEqual(
    rows.map(row => ({ athlete: row.athlete.id, points: row.pairwisePoints, rank: row.finalRank })),
    [
      { athlete: 'C', points: 1.5, rank: 1 },
      { athlete: 'A', points: 1, rank: 2 },
      { athlete: 'B', points: 0.5, rank: 3 }
    ]
  );
});

test('uses average judge score only to resolve equal total performance points', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const scores = [
    score('A', 'J1', 10), score('B', 'J1', 9),
    score('B', 'J2', 12), score('A', 'J2', 10),
    score('A', 'J3', 10), score('B', 'J3', 9),
    score('B', 'J4', 12), score('A', 'J4', 10)
  ];
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, [], judges);
  assert.equal(rows[0].athlete.id, 'B');
  assert.equal(rows[0].pairwisePoints, 0.5);
  assert.equal(rows[0].finalRank, 1);
});

test('shares the rank when performance points and average scores are both equal', () => {
  const limited = { ...competition, rounds: [{ ...competition.rounds[0], athleteIds: ['A', 'B'] }] };
  const scores = [
    score('A', 'J1', 11), score('B', 'J1', 9),
    score('B', 'J2', 11), score('A', 'J2', 9),
    score('A', 'J3', 11), score('B', 'J3', 9),
    score('B', 'J4', 11), score('A', 'J4', 9)
  ];
  const rows = calculatePlaceMethodRankings(limited, 'R1', athletes, scores, [], judges);
  assert.deepEqual(rows.map(row => row.pairwisePoints), [0.5, 0.5]);
  assert.deepEqual(rows.map(row => row.averageScore), [10, 10]);
  assert.deepEqual(rows.map(row => row.finalRank), [1, 1]);
});
