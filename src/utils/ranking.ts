import { REQUIRED_SCORING_JUDGES, type Athlete, type Competition, type FaultSubmission, type ScoreSubmission } from '../initialData';
import { withAthleteCompetitionOrder } from './athleteOrder';

export interface CalculatedRow {
  athlete: Athlete;
  scoresByJudge: Record<string, { score: number; rank: number }>;
  judgeScores: { judgeName: string; score: number }[];
  totalScore: number;
  averageScore: number;
  totalScoreRank: number;
  pairwisePoints: number;
  wins: number;
  ties: number;
  losses: number;
  completedJudges: number;
  requiredJudges: number;
  faultsCount: number;
  deduction: number;
  finalRank: number;
  complete: boolean;
}

export function calculatePlaceMethodRankings(
  competition: Competition,
  roundId: string,
  athletes: Athlete[],
  scores: ScoreSubmission[],
  faults: FaultSubmission[],
  judges: { id: string; name: string }[]
): CalculatedRow[] {
  const round = competition.rounds.find(item => item.id === roundId);
  if (!round) return [];
  const entrants = athletes
    .filter(athlete => round.athleteIds.includes(athlete.id))
    .map(athlete => withAthleteCompetitionOrder(athlete, competition.id));
  const roundScores = scores.filter(score => score.competitionId === competition.id && score.roundId === roundId);
  const roundFaults = faults.filter(fault => fault.competitionId === competition.id && fault.roundId === roundId);
  const scoreIndex = new Map(roundScores.map(score => [`${score.athleteId}:${score.judgeId}`, score]));
  const faultIndex = new Map(roundFaults.map(fault => [fault.athleteId, fault]));
  const scoringJudges = judges.slice(0, REQUIRED_SCORING_JUDGES);
  const judgeRanks: Record<string, Record<string, number>> = {};
  const finalScores: Record<string, Record<string, number>> = {};

  for (const athlete of entrants) {
    finalScores[athlete.id] = {};
    const deduction = faultIndex.get(athlete.id)?.deductionAmount ?? 0;
    for (const judge of scoringJudges) {
      const submission = scoreIndex.get(`${athlete.id}:${judge.id}`);
      if (submission) {
        finalScores[athlete.id][judge.id] = Math.max(0, submission.totalScore - deduction);
      }
    }
  }

  for (const judge of scoringJudges) {
    judgeRanks[judge.id] = {};
    const completed = entrants
      .filter(athlete => finalScores[athlete.id][judge.id] !== undefined)
      .map(athlete => ({ athleteId: athlete.id, score: finalScores[athlete.id][judge.id] }))
      .sort((a, b) => b.score - a.score || a.athleteId.localeCompare(b.athleteId));
    let position = 0;
    while (position < completed.length) {
      let tieEnd = position + 1;
      while (tieEnd < completed.length && completed[tieEnd].score === completed[position].score) tieEnd++;
      const averageRank = ((position + 1) + tieEnd) / 2;
      for (let index = position; index < tieEnd; index++) {
        judgeRanks[judge.id][completed[index].athleteId] = averageRank;
      }
      position = tieEnd;
    }
  }

  const rows: CalculatedRow[] = entrants.map(athlete => {
    const scoresByJudge: Record<string, { score: number; rank: number }> = {};
    let totalScore = 0;
    for (const judge of scoringJudges) {
      const score = finalScores[athlete.id][judge.id];
      const rank = judgeRanks[judge.id][athlete.id];
      if (score !== undefined && rank !== undefined) {
        scoresByJudge[judge.id] = { score, rank };
        totalScore += score;
      }
    }
    const completedJudges = Object.keys(scoresByJudge).length;
    const fault = faultIndex.get(athlete.id);
    return {
      athlete,
      scoresByJudge,
      judgeScores: scoringJudges
        .filter(judge => scoresByJudge[judge.id])
        .map(judge => ({ judgeName: judge.name, score: scoresByJudge[judge.id].score })),
      totalScore,
      averageScore: completedJudges ? totalScore / completedJudges : 0,
      totalScoreRank: 0,
      pairwisePoints: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      completedJudges,
      requiredJudges: REQUIRED_SCORING_JUDGES,
      faultsCount: fault?.faultsCount ?? 0,
      deduction: fault?.deductionAmount ?? 0,
      finalRank: 0,
      complete: scoringJudges.length === REQUIRED_SCORING_JUDGES && completedJudges === REQUIRED_SCORING_JUDGES
    };
  });

  for (let left = 0; left < rows.length; left++) {
    for (let right = left + 1; right < rows.length; right++) {
      let leftVotes = 0;
      let rightVotes = 0;
      for (const judge of scoringJudges) {
        const leftRank = judgeRanks[judge.id][rows[left].athlete.id];
        const rightRank = judgeRanks[judge.id][rows[right].athlete.id];
        if (leftRank === undefined || rightRank === undefined) continue;
        if (leftRank < rightRank) leftVotes++;
        else if (rightRank < leftRank) rightVotes++;
        else {
          leftVotes += 0.5;
          rightVotes += 0.5;
        }
      }
      const threshold = REQUIRED_SCORING_JUDGES / 2;
      if (leftVotes > threshold) {
        rows[left].pairwisePoints++;
        rows[left].wins++;
        rows[right].losses++;
      } else if (rightVotes > threshold) {
        rows[right].pairwisePoints++;
        rows[right].wins++;
        rows[left].losses++;
      } else {
        rows[left].pairwisePoints += 0.5;
        rows[right].pairwisePoints += 0.5;
        rows[left].ties++;
        rows[right].ties++;
      }
    }
  }

  rows.sort((a, b) =>
    Number(b.complete) - Number(a.complete) ||
    b.pairwisePoints - a.pairwisePoints ||
    a.athlete.order - b.athlete.order
  );
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.finalRank = previous &&
      row.complete === previous.complete &&
      row.pairwisePoints === previous.pairwisePoints
      ? previous.finalRank
      : index + 1;
  });

  const byAverage = [...rows]
    .filter(row => row.complete)
    .sort((a, b) => b.averageScore - a.averageScore || a.athlete.order - b.athlete.order);
  byAverage.forEach((row, index) => {
    const previous = byAverage[index - 1];
    row.totalScoreRank = previous && row.averageScore === previous.averageScore
      ? previous.totalScoreRank
      : index + 1;
  });
  return rows;
}
