import type { Athlete } from '../initialData';

function validOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1;
}

export function getAthleteCompetitionOrder(athlete: Athlete, competitionId: string): number {
  const competitionOrder = athlete.competitionOrders?.[competitionId];
  return validOrder(competitionOrder) ? competitionOrder : Math.max(1, athlete.order || 1);
}

export function setAthleteCompetitionOrder(
  athlete: Athlete,
  competitionId: string,
  order: number
): Athlete {
  return {
    ...athlete,
    competitionOrders: {
      ...athlete.competitionOrders,
      [competitionId]: Math.max(1, Math.floor(order))
    }
  };
}

export function removeAthleteCompetitionOrder(athlete: Athlete, competitionId: string): Athlete {
  if (!athlete.competitionOrders?.[competitionId]) return athlete;
  const competitionOrders = { ...athlete.competitionOrders };
  delete competitionOrders[competitionId];
  return {
    ...athlete,
    competitionOrders
  };
}

export function withAthleteCompetitionOrder(athlete: Athlete, competitionId: string): Athlete {
  return {
    ...athlete,
    order: getAthleteCompetitionOrder(athlete, competitionId)
  };
}

/**
 * Upgrades legacy global orders to a contiguous order list for every competition.
 * Existing competition-specific orders define the sort priority, then legacy order
 * and athlete id provide stable fallbacks.
 */
export function normalizeAthleteCompetitionOrders(athletes: Athlete[]): Athlete[] {
  const competitionIds = Array.from(new Set(athletes.flatMap(athlete => athlete.competitionIds ?? [])));
  const ordersByAthlete = new Map(athletes.map(athlete => [
    athlete.id,
    { ...(athlete.competitionOrders ?? {}) }
  ]));

  for (const competitionId of competitionIds) {
    const members = athletes
      .filter(athlete => athlete.competitionIds?.includes(competitionId))
      .sort((left, right) =>
        getAthleteCompetitionOrder(left, competitionId) - getAthleteCompetitionOrder(right, competitionId) ||
        left.id.localeCompare(right.id)
      );
    members.forEach((athlete, index) => {
      ordersByAthlete.get(athlete.id)![competitionId] = index + 1;
    });
  }

  return athletes.map(athlete => ({
    ...athlete,
    competitionOrders: ordersByAthlete.get(athlete.id) ?? {}
  }));
}
