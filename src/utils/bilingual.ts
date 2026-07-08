import type { Athlete, Competition, EventConfig, Judge } from '../initialData';

interface NamedEntity {
  id: string;
  name: string;
  nameZh?: string;
  nameEn?: string;
}

function mergeName<T extends NamedEntity>(stored: T, seed?: T): T {
  return {
    ...stored,
    nameZh: stored.nameZh?.trim() || seed?.nameZh || stored.name,
    nameEn: stored.nameEn?.trim() || seed?.nameEn || stored.name
  };
}

function seedById<T extends NamedEntity>(items: T[]): Map<string, T> {
  return new Map(items.map(item => [item.id, item]));
}

export function migrateAthletes(stored: Athlete[], seeds: Athlete[]): Athlete[] {
  const seedMap = seedById(seeds);
  return stored.map(item => ({
    ...mergeName(item, seedMap.get(item.id)),
    competitionIds: item.competitionIds ?? seedMap.get(item.id)?.competitionIds ?? []
  }));
}

export function migrateJudges(stored: Judge[], seeds: Judge[]): Judge[] {
  const seedMap = seedById(seeds);
  return stored.map(item => mergeName(item, seedMap.get(item.id)));
}

export function migrateEvents(stored: EventConfig[], seeds: EventConfig[]): EventConfig[] {
  const seedMap = seedById(seeds);
  return stored.map(item => mergeName(item, seedMap.get(item.id)));
}

export function migrateCompetitions(stored: Competition[], seeds: Competition[]): Competition[] {
  const seedMap = seedById(seeds);
  return stored.map(item => {
    const seed = seedMap.get(item.id);
    const seedRounds = seedById(seed?.rounds ?? []);
    return {
      ...mergeName(item, seed),
      rounds: item.rounds.map(round => mergeName(round, seedRounds.get(round.id)))
    };
  });
}

export function hasCompleteBilingualName(item: { nameZh?: string; nameEn?: string }): boolean {
  return Boolean(item.nameZh?.trim() && item.nameEn?.trim());
}
