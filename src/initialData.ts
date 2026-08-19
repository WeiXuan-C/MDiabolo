export type CompetitionType = 'Individual Stage' | 'Duo/Team Stage' | 'Challenge';
export type CompetitionStatus = 'Draft' | 'Active' | 'Completed';
export type RoundStatus = 'Draft' | 'Active' | 'Completed';
export type Language = 'zh' | 'en';
export type AthleteSection = 'Primary' | 'Secondary' | 'Open';
export type ScoringRuleVersion = 'client-2026-v1';

export interface BackgroundConfig {
  type: 'gradient' | 'image' | 'video';
  value: string;
  opacity?: number; // 0-100, default 100
  appliedAt?: string; // ISO timestamp
  name?: string; // User-friendly name for history
}

export interface AppSettings {
  activeEventId: string;
  /** Legacy field retained only for migration from v2 settings. */
  activeCompetitionId?: string;
  customBackground?: BackgroundConfig;
  backgroundHistory?: BackgroundConfig[];
}

export interface Athlete {
  id: string;
  /** Legacy global order retained for backwards-compatible imports. */
  order: number;
  /** Competition-specific running order. Every competition has its own sequence. */
  competitionOrders?: Record<string, number>;
  name: string;
  nameZh?: string;
  nameEn?: string;
  school: string;
  age: number;
  gender: 'Male' | 'Female' | 'Co-ed';
  section?: AthleteSection;
  country: string;
  teamName: string | null;
  competitionIds: string[];
}

export interface CompetitionRound {
  id: string;
  name: string;
  nameZh?: string;
  nameEn?: string;
  sequence: number;
  status: RoundStatus;
  athleteIds: string[];
  advancingCount: number | null;
  startTime?: string;
  announcementTime?: string;
}

export interface Competition {
  id: string;
  eventId: string;
  name: string;
  nameZh?: string;
  nameEn?: string;
  type: CompetitionType;
  region: string;
  division: string;
  status: CompetitionStatus;
  rounds: CompetitionRound[];
  faultDeduction: number;
  scoringRuleVersion?: ScoringRuleVersion;
  chiefJudge?: string;
  recorder?: string;
}

export interface Judge {
  id: string;
  name: string;
  nameZh?: string;
  nameEn?: string;
  role: 'Scoring' | 'Technical';
  competitionIds: string[];
}

export interface EventConfig {
  id: string;
  name: string;
  nameZh?: string;
  nameEn?: string;
  poster: string;
  backgroundVideo?: string;
  backgroundTheme: 'Ember' | 'Cosmic' | 'Terminal' | 'Ocean' | 'Forest' | 'Sunset';
}

export interface ScoreDimensions {
  action_difficulty: number;
  stage_artistry?: number;
  action_interaction?: number;
  action_creativity: number;
  action_fluency?: number;
  costume_styling?: number;
}

export interface ScoreSubmission {
  id: string;
  competitionId: string;
  roundId: string;
  athleteId: string;
  judgeId: string;
  judgeName: string;
  dimensions: ScoreDimensions;
  totalScore: number;
  submittedAt: string;
  syncStatus?: 'local' | 'synced';
}

export interface FaultSubmission {
  id: string;
  competitionId: string;
  roundId: string;
  athleteId: string;
  judgeId: string;
  faultsCount: number;
  deductionPerFault: number;
  deductionAmount: number;
  submittedAt: string;
  syncStatus?: 'local' | 'synced';
}

export interface AdminAccount {
  id: string;
  name: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export const SCORING_RULE_VERSION: ScoringRuleVersion = 'client-2026-v1';
export const REQUIRED_SCORING_JUDGES = 3;

export const getDefaultFaultDeduction = (type: CompetitionType): number =>
  type === 'Duo/Team Stage' ? 3 : 2;

export const applyCurrentScoringRules = (competition: Competition): Competition =>
  competition.scoringRuleVersion === SCORING_RULE_VERSION
    ? competition
    : {
        ...competition,
        faultDeduction: getDefaultFaultDeduction(competition.type),
        scoringRuleVersion: SCORING_RULE_VERSION
      };

export const getDimensionsConfig = (type: CompetitionType) => {
  if (type === 'Individual Stage') {
    return [
      { key: 'action_difficulty', label: '动作难度', labelEn: 'Difficulty', max: 30 },
      { key: 'stage_artistry', label: '舞台艺术', labelEn: 'Artistry', max: 25 },
      { key: 'action_creativity', label: '动作创意', labelEn: 'Creativity', max: 20 },
      { key: 'action_fluency', label: '动作流畅', labelEn: 'Fluency', max: 15 },
      { key: 'costume_styling', label: '服装造型', labelEn: 'Costume', max: 10 }
    ] as const;
  }
  if (type === 'Duo/Team Stage') {
    return [
      { key: 'action_difficulty', label: '动作难度', labelEn: 'Difficulty', max: 35 },
      { key: 'stage_artistry', label: '舞台艺术', labelEn: 'Artistry', max: 25 },
      { key: 'action_interaction', label: '动作互动', labelEn: 'Interaction', max: 15 },
      { key: 'action_creativity', label: '动作创意', labelEn: 'Creativity', max: 15 },
      { key: 'costume_styling', label: '服装造型', labelEn: 'Costume', max: 10 }
    ] as const;
  }
  return [
    { key: 'action_difficulty', label: '动作难度', labelEn: 'Difficulty', max: 50 },
    { key: 'action_creativity', label: '动作创意', labelEn: 'Creativity', max: 30 },
    { key: 'action_fluency', label: '动作流畅', labelEn: 'Fluency', max: 20 }
  ] as const;
};

export const SEEDED_EVENTS: EventConfig[] = [{
  id: 'E-01',
  name: 'MDiabolo International Cup 2026',
  nameZh: 'MDiabolo 国际杯 2026',
  nameEn: 'MDiabolo International Cup 2026',
  poster: '',
  backgroundTheme: 'Ember'
}];

export const SEEDED_ATHLETES: Athlete[] = [
  { id: 'ATH-0821', order: 1, name: '陈威廷', nameZh: '陈威廷', nameEn: 'Chen Wei Ting', school: 'Taipei Diabolo Association', age: 18, gender: 'Male', section: 'Open', country: 'Taiwan', teamName: null, competitionIds: ['INTL-2026-IND'] },
  { id: 'ATH-0822', order: 2, name: 'Marcus Wong', nameZh: '黄志铭', nameEn: 'Marcus Wong', school: 'Kuala Lumpur Diabolo Club', age: 20, gender: 'Male', section: 'Open', country: 'Malaysia', teamName: null, competitionIds: ['INTL-2026-IND'] },
  { id: 'ATH-0823', order: 3, name: 'Yuki Tanaka', nameZh: '田中勇气', nameEn: 'Yuki Tanaka', school: 'Tokyo Youth Performance School', age: 17, gender: 'Male', section: 'Open', country: 'Japan', teamName: null, competitionIds: ['INTL-2026-IND'] },
  { id: 'ATH-0824', order: 4, name: 'Lucas Dubois', nameZh: '卢卡斯·杜波伊斯', nameEn: 'Lucas Dubois', school: 'Paris Circus Conservatory', age: 19, gender: 'Male', section: 'Open', country: 'France', teamName: null, competitionIds: ['INTL-2026-IND'] }
];

const allAthleteIds = SEEDED_ATHLETES.map(athlete => athlete.id);

export const SEEDED_COMPETITIONS: Competition[] = [{
  id: 'INTL-2026-IND',
  eventId: 'E-01',
  name: '个人舞台赛',
  nameZh: '个人舞台赛',
  nameEn: 'Individual Stage',
  type: 'Individual Stage',
  region: 'Asia Pacific',
  division: 'Open Individual',
  status: 'Active',
  faultDeduction: getDefaultFaultDeduction('Individual Stage'),
  scoringRuleVersion: SCORING_RULE_VERSION,
  rounds: [
    { id: 'R-ONE', name: '比赛', nameZh: '比赛', nameEn: 'Competition', sequence: 1, status: 'Active', athleteIds: allAthleteIds, advancingCount: null }
  ]
}];

export const SEEDED_JUDGES: Judge[] = [
  { id: 'J-01', name: 'Marcus Wong', nameZh: '黄志铭', nameEn: 'Marcus Wong', role: 'Scoring', competitionIds: ['INTL-2026-IND'] },
  { id: 'J-02', name: 'Yuki Tanaka', nameZh: '田中勇气', nameEn: 'Yuki Tanaka', role: 'Scoring', competitionIds: ['INTL-2026-IND'] },
  { id: 'J-03', name: '陈威廷', nameZh: '陈威廷', nameEn: 'Chen Wei Ting', role: 'Scoring', competitionIds: ['INTL-2026-IND'] },
  { id: 'J-TECH', name: '技术失误裁判', nameZh: '技术失误裁判', nameEn: 'Technical Fault Judge', role: 'Technical', competitionIds: ['INTL-2026-IND'] }
];

export const SEEDED_SCORES: ScoreSubmission[] = [];
export const SEEDED_FAULTS: FaultSubmission[] = [];

export function localizedName(
  item: { name: string; nameZh?: string; nameEn?: string } | undefined,
  _language: Language
): string {
  if (!item) return '';
  const zh = item.nameZh?.trim() || item.name;
  const en = item.nameEn?.trim() || item.name;
  return zh === en ? zh : `${zh} · ${en}`;
}
