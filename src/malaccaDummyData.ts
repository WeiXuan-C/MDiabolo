import type { Athlete, Competition, EventConfig, Judge } from './initialData';

type CandidateGroup = 'primaryFemale' | 'primaryMale' | 'primaryAll' | 'secondaryFemale' | 'secondaryMale' | 'openFemale' | 'openMale' | 'openAll' | 'challenge';
type CompetitionSeed = {
  id: string;
  day: 1 | 2;
  nameZh: string;
  nameEn: string;
  type: Competition['type'];
  division: string;
  group: CandidateGroup;
  judges: [string, string, string];
};

const candidateRows: Array<[string, string, number, Athlete['gender'], NonNullable<Athlete['section']>]> = [
  ['彭心琪', '马来西亚民艺扯铃推广中心', 9, 'Female', 'Primary'],
  ['陈慧潼', '马六甲扯铃协会', 10, 'Female', 'Primary'],
  ['游宸旭', '台湾永顺国小', 11, 'Female', 'Primary'],
  ['颜维彬', 'SourCE', 10, 'Female', 'Primary'],
  ['黄愉涵', '铃途工作室', 11, 'Female', 'Primary'],
  ['游凯芯', '铃途工作室', 10, 'Female', 'Primary'],
  ['李芊柔', 'FYSA DIABOLO TEAM', 11, 'Female', 'Primary'],
  ['郭珑雅', '铃途工作室', 9, 'Female', 'Primary'],
  ['陈德杰', 'SourCE', 10, 'Male', 'Primary'],
  ['余昊原', '铃术高专', 11, 'Male', 'Primary'],
  ['黄启钦', '马六甲扯铃协会', 10, 'Male', 'Primary'],
  ['李彬睿', '马来西亚民艺扯铃推广中心', 11, 'Male', 'Primary'],
  ['曾文杰', 'FYSA DIABOLO TEAM', 11, 'Male', 'Primary'],
  ['李羽乐', 'FYSA DIABOLO TEAM', 10, 'Male', 'Primary'],
  ['张惟胜', '拉曼理工大学007扯铃社', 11, 'Male', 'Primary'],
  ['叶智俊', 'MY Diabolo Team', 10, 'Male', 'Primary'],
  ['张教诚', '务德小学 D-Light Team', 11, 'Male', 'Primary'],
  ['纪结展', '新山扯铃队', 10, 'Male', 'Primary'],
  ['戴欣恬', '新山宽柔中学', 14, 'Female', 'Secondary'],
  ['罗靖恩', '新山宽柔中学', 15, 'Female', 'Secondary'],
  ['高慧心', '新山宽柔中学', 14, 'Female', 'Secondary'],
  ['李禹汐', '新山宽柔中学', 15, 'Female', 'Secondary'],
  ['廖柔钧', '新山扯铃队', 14, 'Female', 'Secondary'],
  ['游静颖', '台湾北门校友队', 16, 'Female', 'Secondary'],
  ['黄语翔', '新山宽柔中学', 15, 'Male', 'Secondary'],
  ['陈捷森', '新山宽柔中学', 15, 'Male', 'Secondary'],
  ['刘俊峰', '新山宽柔中学', 16, 'Male', 'Secondary'],
  ['郑全智', '新山宽柔中学', 15, 'Male', 'Secondary'],
  ['陈世源', '新山宽柔中学', 16, 'Male', 'Secondary'],
  ['翁毅恒', '新山宽柔中学', 15, 'Male', 'Secondary'],
  ['谭宇恒', '新山宽柔中学', 14, 'Male', 'Secondary'],
  ['卓家乐', '居銮中华中学', 16, 'Male', 'Secondary'],
  ['王福恩', '个人参赛', 22, 'Male', 'Open'],
  ['黄萨华', 'MUCCS 扯铃队', 20, 'Male', 'Open'],
  ['李章则', '台湾淡江大学', 21, 'Male', 'Open'],
  ['张承彬', 'JDC Diabolo Team', 20, 'Male', 'Open'],
  ['李景晖', '马来西亚民艺扯铃推广中心', 23, 'Male', 'Open'],
  ['张准胜', '拉曼理工大学007扯铃社', 21, 'Male', 'Open'],
  ['黄柿颖', 'DOT', 20, 'Male', 'Open'],
  ['刘劲', '马六甲扯铃协会', 22, 'Male', 'Open'],
  ['吴昱颜', '拉曼理工大学007扯铃社', 21, 'Male', 'Open'],
  ['牛嘉', 'SourCE', 24, 'Male', 'Open'],
  ['骆民花', 'SourCE', 20, 'Female', 'Open'],
  ['何羽生', '居銮中华中学', 19, 'Female', 'Open'],
  ['陈恩洁', 'MY Diabolo Team', 20, 'Female', 'Open'],
  ['吴骏齐', '铃途工作室', 20, 'Female', 'Open'],
  ['JACQUELINE TAN', 'D-Light Team', 19, 'Female', 'Open'],
  ['林资翔', '铃途工作室', 19, 'Female', 'Open']
];

const candidates = candidateRows.map(([name, school, age, gender, section]) => ({ name, school, age, gender, section }));
const groups: Record<CandidateGroup, typeof candidates> = {
  primaryFemale: candidates.filter(item => item.section === 'Primary' && item.gender === 'Female'),
  primaryMale: candidates.filter(item => item.section === 'Primary' && item.gender === 'Male'),
  primaryAll: candidates.filter(item => item.section === 'Primary'),
  secondaryFemale: candidates.filter(item => item.section === 'Secondary' && item.gender === 'Female'),
  secondaryMale: candidates.filter(item => item.section === 'Secondary' && item.gender === 'Male'),
  openFemale: candidates.filter(item => item.section === 'Open' && item.gender === 'Female'),
  openMale: candidates.filter(item => item.section === 'Open' && item.gender === 'Male'),
  openAll: candidates.filter(item => item.section === 'Open'),
  challenge: candidates.filter(item => item.section !== 'Primary')
};

const competitionSeeds: CompetitionSeed[] = [
  { id: 'D1-SECONDARY-F', day: 1, nameZh: '中学组女生', nameEn: 'Secondary Girls', type: 'Individual Stage', division: 'Secondary Female', group: 'secondaryFemale', judges: ['梁曙光', '黄劲毅', '孙宇扬'] },
  { id: 'D1-SECONDARY-M', day: 1, nameZh: '中学组男生', nameEn: 'Secondary Boys', type: 'Individual Stage', division: 'Secondary Male', group: 'secondaryMale', judges: ['谢志昕', '刘其康', '刘炜贤'] },
  { id: 'D1-OPEN-F', day: 1, nameZh: '公开组女生', nameEn: 'Open Women', type: 'Individual Stage', division: 'Open Female', group: 'openFemale', judges: ['梁曙光', '刘劲陞', '刘炜贤'] },
  { id: 'D1-JUNIOR-F', day: 1, nameZh: '幼小组女生', nameEn: 'Junior Girls', type: 'Individual Stage', division: 'Junior Female', group: 'primaryFemale', judges: ['梁曙光', '黄劲毅', '孙宇扬'] },
  { id: 'D1-JUNIOR-M', day: 1, nameZh: '幼小组男生', nameEn: 'Junior Boys', type: 'Individual Stage', division: 'Junior Male', group: 'primaryMale', judges: ['谢志昕', '刘其康', '陈文康'] },
  { id: 'D1-PRIMARY-F', day: 1, nameZh: '小学组女生', nameEn: 'Primary Girls', type: 'Individual Stage', division: 'Primary Female', group: 'primaryFemale', judges: ['沈文祥', '黄劲毅', '刘炜贤'] },
  { id: 'D1-PRIMARY-M', day: 1, nameZh: '小学组男生', nameEn: 'Primary Boys', type: 'Individual Stage', division: 'Primary Male', group: 'primaryMale', judges: ['梁曙光', '徐健春', '孙宇扬'] },
  { id: 'D1-PRIMARY-TEAM', day: 1, nameZh: '小学组', nameEn: 'Primary Team', type: 'Duo/Team Stage', division: 'Primary Team', group: 'primaryAll', judges: ['谢志昕', '刘其康', '童秉盛'] },
  { id: 'D1-OPEN-TEAM', day: 1, nameZh: '公开组', nameEn: 'Open Team', type: 'Duo/Team Stage', division: 'Open Team', group: 'openAll', judges: ['沈文祥', '徐健春', '刘炜贤'] },
  { id: 'D2-OPEN-M', day: 2, nameZh: '公开组男生', nameEn: 'Open Men', type: 'Individual Stage', division: 'Open Male', group: 'openMale', judges: ['沈文祥', '陈文康', '徐健春'] },
  { id: 'D2-VERTAX', day: 2, nameZh: 'Vertax', nameEn: 'Vertax', type: 'Challenge', division: 'Vertax', group: 'challenge', judges: ['李翊華', '刘劲陞', '丘凯文'] },
  { id: 'D2-1DF', day: 2, nameZh: '1DF', nameEn: '1 Diabolo Fixed', type: 'Challenge', division: '1DF', group: 'challenge', judges: ['邓智铭', '覃韦历', '許弘旻'] },
  { id: 'D2-1DB', day: 2, nameZh: '1DB', nameEn: '1 Diabolo Bearing', type: 'Challenge', division: '1DB', group: 'challenge', judges: ['李翊華', '刘劲陞', '丘凯文'] },
  { id: 'D2-2DF', day: 2, nameZh: '2DF', nameEn: '2 Diabolo Fixed', type: 'Challenge', division: '2DF', group: 'challenge', judges: ['邓智铭', '覃韦历', '許弘旻'] },
  { id: 'D2-2DB', day: 2, nameZh: '2DB', nameEn: '2 Diabolo Bearing', type: 'Challenge', division: '2DB', group: 'challenge', judges: ['李翊華', '童秉盛', '丘凯文'] },
  { id: 'D2-3DF', day: 2, nameZh: '3DF', nameEn: '3 Diabolo Fixed', type: 'Challenge', division: '3DF', group: 'challenge', judges: ['邓智铭', '許弘旻', '童秉盛'] },
  { id: 'D2-3DB', day: 2, nameZh: '3DB', nameEn: '3 Diabolo Bearing', type: 'Challenge', division: '3DB', group: 'challenge', judges: ['李翊華', '童秉盛', '丘凯文'] },
  { id: 'D2-4D', day: 2, nameZh: '4D', nameEn: '4 Diabolo', type: 'Challenge', division: '4D', group: 'challenge', judges: ['邓智铭', '許弘旻', '陈德杰'] },
  { id: 'D2-PRIMARY-TEAM', day: 2, nameZh: '小学组', nameEn: 'Primary Team', type: 'Duo/Team Stage', division: 'Primary Team', group: 'primaryAll', judges: ['谢志昕', '梁曙光', '覃韦历'] },
  { id: 'D2-OPEN-TEAM', day: 2, nameZh: '公开组', nameEn: 'Open Team', type: 'Duo/Team Stage', division: 'Open Team', group: 'openAll', judges: ['刘炜贤', '許弘旻', '李翊華'] }
];

const selections = new Map<string, typeof candidates>();
competitionSeeds.forEach((competition, competitionIndex) => {
  const pool = groups[competition.group];
  const count = Math.min(8, pool.length);
  selections.set(competition.id, Array.from({ length: count }, (_, index) => pool[(index + competitionIndex) % pool.length]));
});

export const MALACCA_DUMMY_EVENT: EventConfig = {
  id: 'MELAKA-2026',
  name: '2026马来西亚马六甲国际扯铃观摩赛',
  nameZh: '2026马来西亚马六甲国际扯铃观摩赛',
  nameEn: '2026 Malaysia Melaka International Diabolo Showcase',
  poster: '',
  backgroundTheme: 'Ocean'
};

export const MALACCA_DUMMY_ATHLETES: Athlete[] = candidates.map((candidate, index) => ({
  id: `MEL-A-${String(index + 1).padStart(3, '0')}`,
  order: index + 1,
  name: candidate.name,
  nameZh: candidate.name,
  nameEn: candidate.name,
  school: candidate.school,
  age: candidate.age,
  gender: candidate.gender,
  section: candidate.section,
  country: candidate.school.startsWith('台湾') ? 'Taiwan' : 'Malaysia',
  teamName: candidate.school === '个人参赛' ? null : candidate.school,
  competitionIds: competitionSeeds.filter(competition => selections.get(competition.id)?.includes(candidate)).map(competition => competition.id)
}));

const athleteIdByCandidate = new Map(candidates.map((candidate, index) => [candidate, MALACCA_DUMMY_ATHLETES[index].id]));

export const MALACCA_DUMMY_COMPETITIONS: Competition[] = competitionSeeds.map(competition => ({
  id: competition.id,
  eventId: MALACCA_DUMMY_EVENT.id,
  name: `第${competition.day === 1 ? '一' : '二'}天 - ${competition.nameZh}`,
  nameZh: `第${competition.day === 1 ? '一' : '二'}天 - ${competition.nameZh}`,
  nameEn: `Day ${competition.day} - ${competition.nameEn}`,
  type: competition.type,
  region: 'Melaka, Malaysia',
  division: competition.division,
  status: 'Active',
  faultDeduction: competition.type === 'Duo/Team Stage' ? 3 : 2,
  scoringRuleVersion: 'client-2026-v1',
  chiefJudge: competition.judges[0],
  rounds: [{
    id: `${competition.id}-FINAL`,
    name: '决赛',
    nameZh: '决赛',
    nameEn: 'Final',
    sequence: 1,
    status: 'Active',
    athleteIds: (selections.get(competition.id) ?? []).map(candidate => athleteIdByCandidate.get(candidate)!),
    advancingCount: null
  }]
}));

const judgeNames = [...new Set(competitionSeeds.flatMap(competition => competition.judges))];

export const MALACCA_DUMMY_JUDGES: Judge[] = [
  ...judgeNames.map((name, index) => ({
    id: `MEL-J-${String(index + 1).padStart(2, '0')}`,
    name,
    nameZh: name,
    nameEn: name,
    role: 'Scoring' as const,
    competitionIds: competitionSeeds.filter(competition => competition.judges.includes(name)).map(competition => competition.id)
  })),
  {
    id: 'MEL-J-TECH',
    name: '技术失误裁判',
    nameZh: '技术失误裁判',
    nameEn: 'Technical Fault Judge',
    role: 'Technical',
    competitionIds: competitionSeeds.map(competition => competition.id)
  }
];
