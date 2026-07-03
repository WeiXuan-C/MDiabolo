export interface Athlete {
  id: string;
  order: number;
  name: string;
  school: string;
  age: number;
  gender: 'Male' | 'Female' | 'Co-ed';
  country: string;
  teamName: string | null;
}

export interface Competition {
  id: string;
  name: string;
  type: 'Individual Stage' | 'Duo/Team Stage' | 'Challenge';
  region: string;
  division: string;
  status: 'Draft' | 'Active' | 'Completed';
}

export interface Judge {
  id: string;
  name: string;
  role: 'Scoring' | 'Technical';
}

export interface EventConfig {
  id: string;
  name: string;
  poster: string;
  backgroundTheme: string;
}

export interface ScoreSubmission {
  id: string; // compId_athleteId_judgeId
  competitionId: string;
  athleteId: string;
  judgeId: string;
  judgeName: string;
  dimensions: {
    action_difficulty: number;
    stage_artistry?: number; // for individual and team
    action_interaction?: number; // for team stage
    action_creativity: number;
    action_fluency?: number; // for individual and challenge
    costume_styling?: number; // for individual and team
  };
  totalScore: number;
  submittedAt: string;
}

export interface FaultSubmission {
  id: string; // compId_athleteId_tech
  competitionId: string;
  athleteId: string;
  faultsCount: number;
  deductionAmount: number;
  submittedAt: string;
}

export const SEEDED_EVENTS: EventConfig[] = [
  {
    id: 'E-01',
    name: 'MDiabolo International Cup 2026',
    poster: 'https://images.unsplash.com/photo-1564981797816-1043664bf78d?q=80&w=600&auto=format&fit=crop',
    backgroundTheme: 'Ember'
  },
  {
    id: 'E-02',
    name: 'Asia Pacific Diabolo Open',
    poster: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop',
    backgroundTheme: 'Cosmic'
  }
];

export const SEEDED_JUDGES: Judge[] = [
  { id: 'J-01', name: 'Marcus Wong (黃志銘)', role: 'Scoring' },
  { id: 'J-02', name: 'Yuki Tanaka (田中勇気)', role: 'Scoring' },
  { id: 'J-03', name: 'Chen Wei Ting (陳威廷)', role: 'Scoring' },
  { id: 'J-tech', name: 'Fault Inspector (失誤裁判)', role: 'Technical' }
];

export const SEEDED_COMPETITIONS: Competition[] = [
  {
    id: 'INTL-2026-IND',
    name: 'International Individual Stage Finals (個人決賽)',
    type: 'Individual Stage',
    region: 'Asia Pacific',
    division: 'Open Individual / Male',
    status: 'Active'
  },
  {
    id: 'INTL-2026-TEAM',
    name: 'Duo & Team Stage Showdown (雙人與團隊賽)',
    type: 'Duo/Team Stage',
    region: 'Asia Pacific',
    division: 'Open Duo Group',
    status: 'Active'
  },
  {
    id: 'INTL-2026-CHALL',
    name: 'Extreme Speed & Tech Challenge (極速挑戰賽)',
    type: 'Challenge',
    region: 'Taiwan Regional',
    division: 'Youth Challenge Division',
    status: 'Draft'
  }
];

export const SEEDED_ATHLETES: Athlete[] = [
  {
    id: 'ATH-0821',
    order: 1,
    name: 'Chen Wei Ting (陳威廷)',
    school: 'Taipei Diabolo Association',
    age: 18,
    gender: 'Male',
    country: 'Taiwan',
    teamName: 'Taipei Diabolo A'
  },
  {
    id: 'ATH-0822',
    order: 2,
    name: 'Marcus Wong (黃志銘)',
    school: 'Kuala Lumpur Diabolo Club',
    age: 20,
    gender: 'Male',
    country: 'Malaysia',
    teamName: 'Kuala Lumpur Elite'
  },
  {
    id: 'ATH-0823',
    order: 3,
    name: 'Yuki Tanaka (田中勇気)',
    school: 'Tokyo Youth Performance School',
    age: 17,
    gender: 'Male',
    country: 'Japan',
    teamName: 'Tokyo Diabolo Club'
  },
  {
    id: 'ATH-0824',
    order: 4,
    name: 'Lucas Dubois (杜波伊斯)',
    school: 'Paris Circus Conservatory',
    age: 19,
    gender: 'Male',
    country: 'France',
    teamName: 'Paris Diabolo Team'
  },
  {
    id: 'ATH-0825',
    order: 5,
    name: 'Zhang Jia Hao (張家豪)',
    school: 'Beijing Diabolo Union',
    age: 22,
    gender: 'Male',
    country: 'China',
    teamName: 'Beijing Diabolo Union'
  }
];

// Initial seeded scores for INTL-2026-IND (Individual Stage)
// This will populate the rankings list so it looks highly functional immediately!
export const SEEDED_SCORES: ScoreSubmission[] = [
  // Chen Wei Ting (ATH-0821)
  {
    id: 'INTL-2026-IND_ATH-0821_J-01',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0821',
    judgeId: 'J-01',
    judgeName: 'Marcus Wong (黃志銘)',
    dimensions: {
      action_difficulty: 26.5,
      stage_artistry: 24.0,
      action_creativity: 25.5,
      action_fluency: 23.0,
      costume_styling: 8.5
    },
    totalScore: 107.5,
    submittedAt: '2026-07-03T01:00:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0821_J-02',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0821',
    judgeId: 'J-02',
    judgeName: 'Yuki Tanaka (田中勇気)',
    dimensions: {
      action_difficulty: 24.0,
      stage_artistry: 25.5,
      action_creativity: 23.0,
      action_fluency: 26.0,
      costume_styling: 9.0
    },
    totalScore: 107.5,
    submittedAt: '2026-07-03T01:01:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0821_J-03',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0821',
    judgeId: 'J-03',
    judgeName: 'Chen Wei Ting (陳威廷)',
    dimensions: {
      action_difficulty: 25.0,
      stage_artistry: 24.5,
      action_creativity: 25.0,
      action_fluency: 24.5,
      costume_styling: 8.0
    },
    totalScore: 107.0,
    submittedAt: '2026-07-03T01:02:00-07:00'
  },

  // Marcus Wong (ATH-0822)
  {
    id: 'INTL-2026-IND_ATH-0822_J-01',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0822',
    judgeId: 'J-01',
    judgeName: 'Marcus Wong (黃志銘)',
    dimensions: {
      action_difficulty: 22.0,
      stage_artistry: 23.0,
      action_creativity: 21.5,
      action_fluency: 20.0,
      costume_styling: 7.5
    },
    totalScore: 94.0,
    submittedAt: '2026-07-03T01:03:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0822_J-02',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0822',
    judgeId: 'J-02',
    judgeName: 'Yuki Tanaka (田中勇気)',
    dimensions: {
      action_difficulty: 23.5,
      stage_artistry: 22.0,
      action_creativity: 24.0,
      action_fluency: 21.0,
      costume_styling: 8.0
    },
    totalScore: 98.5,
    submittedAt: '2026-07-03T01:04:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0822_J-03',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0822',
    judgeId: 'J-03',
    judgeName: 'Chen Wei Ting (陳威廷)',
    dimensions: {
      action_difficulty: 22.5,
      stage_artistry: 23.0,
      action_creativity: 22.0,
      action_fluency: 22.5,
      costume_styling: 7.5
    },
    totalScore: 97.5,
    submittedAt: '2026-07-03T01:05:00-07:00'
  },

  // Yuki Tanaka (ATH-0823)
  {
    id: 'INTL-2026-IND_ATH-0823_J-01',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0823',
    judgeId: 'J-01',
    judgeName: 'Marcus Wong (黃志銘)',
    dimensions: {
      action_difficulty: 25.0,
      stage_artistry: 22.0,
      action_creativity: 23.0,
      action_fluency: 24.0,
      costume_styling: 8.0
    },
    totalScore: 102.0,
    submittedAt: '2026-07-03T01:06:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0823_J-02',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0823',
    judgeId: 'J-02',
    judgeName: 'Yuki Tanaka (田中勇気)',
    dimensions: {
      action_difficulty: 26.0,
      stage_artistry: 23.5,
      action_creativity: 24.5,
      action_fluency: 22.5,
      costume_styling: 8.5
    },
    totalScore: 105.0,
    submittedAt: '2026-07-03T01:07:00-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0823_J-03',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0823',
    judgeId: 'J-03',
    judgeName: 'Chen Wei Ting (陳威廷)',
    dimensions: {
      action_difficulty: 24.0,
      stage_artistry: 23.0,
      action_creativity: 23.5,
      action_fluency: 23.0,
      costume_styling: 8.0
    },
    totalScore: 101.5,
    submittedAt: '2026-07-03T01:08:00-07:00'
  }
];

export const SEEDED_FAULTS: FaultSubmission[] = [
  {
    id: 'INTL-2026-IND_ATH-0821_tech',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0821',
    faultsCount: 2,
    deductionAmount: 1.0,
    submittedAt: '2026-07-03T01:02:30-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0822_tech',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0822',
    faultsCount: 0,
    deductionAmount: 0.0,
    submittedAt: '2026-07-03T01:03:30-07:00'
  },
  {
    id: 'INTL-2026-IND_ATH-0823_tech',
    competitionId: 'INTL-2026-IND',
    athleteId: 'ATH-0823',
    faultsCount: 1,
    deductionAmount: 0.5,
    submittedAt: '2026-07-03T01:05:30-07:00'
  }
];
