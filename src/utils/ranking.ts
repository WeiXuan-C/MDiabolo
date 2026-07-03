import { Athlete, ScoreSubmission, FaultSubmission, Competition } from '../initialData';

export interface CalculatedRow {
  athlete: Athlete;
  scoresByJudge: { [judgeId: string]: { score: number; rank: number } };
  totalScore: number; // sum of final scores across all judges
  totalPlaces: number; // sum of ranks/places across all judges
  faultsCount: number;
  deduction: number;
  finalRank: number;
}

/**
 * Calculates the places (ranks) for each athlete under each judge, 
 * computes the sum of places (席次和), and ranks athletes based on the Place Method.
 */
export function calculatePlaceMethodRankings(
  competition: Competition,
  athletes: Athlete[],
  scores: ScoreSubmission[],
  faults: FaultSubmission[],
  judgesList: { id: string; name: string }[]
): CalculatedRow[] {
  // Filter scores and faults for this competition
  const compScores = scores.filter(s => s.competitionId === competition.id);
  const compFaults = faults.filter(f => f.competitionId === competition.id);

  // 1. Calculate final score for each athlete under each judge
  // Final Score = Judge's Dimension Sum - Technical Faults Deduction (0.5 pts per fault)
  const finalScores: { [athleteId: string]: { [judgeId: string]: number } } = {};
  
  // Also track overall faults per athlete
  const athleteFaults: { [athleteId: string]: number } = {};
  athletes.forEach(ath => {
    const fRecord = compFaults.find(f => f.athleteId === ath.id);
    athleteFaults[ath.id] = fRecord ? fRecord.faultsCount : 0;
  });

  athletes.forEach(ath => {
    finalScores[ath.id] = {};
    const deduction = athleteFaults[ath.id] * 0.5;

    judgesList.forEach(judge => {
      const scoreRecord = compScores.find(s => s.athleteId === ath.id && s.judgeId === judge.id);
      if (scoreRecord) {
        // Dimension sum minus faults deduction
        finalScores[ath.id][judge.id] = Math.max(0, scoreRecord.totalScore - deduction);
      } else {
        // If not scored yet, default to null or 0. Let's make it 0 for ranking purposes but keep track of unscored status if needed
        finalScores[ath.id][judge.id] = 0;
      }
    });
  });

  // 2. Rank athletes under EACH judge
  // For each judge, sort athlete scores descending and assign places/ranks
  const judgeRanks: { [judgeId: string]: { [athleteId: string]: number } } = {};

  judgesList.forEach(judge => {
    judgeRanks[judge.id] = {};
    
    // Gather all athletes and their scores under this judge
    const judgeScores = athletes.map(ath => ({
      athleteId: ath.id,
      score: finalScores[ath.id][judge.id],
      // Check if actually scored
      hasScore: compScores.some(s => s.athleteId === ath.id && s.judgeId === judge.id)
    }));

    // Sort by score descending
    judgeScores.sort((a, b) => b.score - a.score);

    // Assign fractional ranks (average rank for ties)
    // For example, if scores are 90, 90, 80: ranks are 1.5, 1.5, 3
    let i = 0;
    while (i < judgeScores.length) {
      let j = i;
      while (j < judgeScores.length && judgeScores[j].score === judgeScores[i].score) {
        j++;
      }
      // Ties exist from i to j-1
      // Sum of positions from i+1 to j
      let positionSum = 0;
      for (let p = i + 1; p <= j; p++) {
        positionSum += p;
      }
      const avgRank = positionSum / (j - i);

      for (let k = i; k < j; k++) {
        // If an athlete is not scored at all, let's rank them last or assign 0.
        // Usually, unscored athletes shouldn't corrupt the leaderboard, they just have 0 score.
        judgeRanks[judge.id][judgeScores[k].athleteId] = judgeScores[k].hasScore ? avgRank : athletes.length;
      }
      i = j;
    }
  });

  // 3. Assemble the intermediate data and compute Total Places (席次和) and Total Score
  const rows: CalculatedRow[] = athletes.map(ath => {
    const scoresByJudge: { [judgeId: string]: { score: number; rank: number } } = {};
    let totalScore = 0;
    let totalPlaces = 0;
    let scoredJudgesCount = 0;

    judgesList.forEach(judge => {
      const score = finalScores[ath.id][judge.id];
      const rank = judgeRanks[judge.id][ath.id];
      const hasScore = compScores.some(s => s.athleteId === ath.id && s.judgeId === judge.id);

      scoresByJudge[judge.id] = { score, rank };
      
      if (hasScore) {
        totalScore += score;
        totalPlaces += rank;
        scoredJudgesCount++;
      } else {
        // Unscored judge adds a placeholder high rank so they don't cheat
        totalPlaces += athletes.length;
      }
    });

    const faultsCount = athleteFaults[ath.id];
    const deduction = faultsCount * 0.5;

    return {
      athlete: ath,
      scoresByJudge,
      totalScore,
      totalPlaces,
      faultsCount,
      deduction,
      finalRank: 0 // Will compute below
    };
  });

  // 4. Sort the overall rows based on the Place Method
  // Rules:
  // - Primary: Lower Total Places is better
  // - Tiebreaker 1: Higher Total Score is better
  // - Tiebreaker 2: Lower Faults count is better
  // - Tiebreaker 3: Athlete ID alphabetical (fallback)
  rows.sort((a, b) => {
    if (a.totalPlaces !== b.totalPlaces) {
      return a.totalPlaces - b.totalPlaces;
    }
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (a.faultsCount !== b.faultsCount) {
      return a.faultsCount - b.faultsCount;
    }
    return a.athlete.name.localeCompare(b.athlete.name);
  });

  // 5. Assign overall final ranks (handling ties if absolutely necessary, but usually standard sorting ranks are dense)
  let currentRank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && 
        rows[i].totalPlaces === rows[i-1].totalPlaces && 
        rows[i].totalScore === rows[i-1].totalScore && 
        rows[i].faultsCount === rows[i-1].faultsCount) {
      // Perfect tie shares the same rank
      rows[i].finalRank = rows[i-1].finalRank;
    } else {
      rows[i].finalRank = i + 1;
    }
  }

  return rows;
}
