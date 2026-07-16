import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  Copy,
  LogOut,
  ChevronRight,
  Pencil,
  Plus,
  QrCode,
  Settings,
  Trash2,
  Trophy,
  X,
  Users
} from 'lucide-react';
import {
  type AdminAccount,
  type AppSettings,
  type Athlete,
  type AthleteSection,
  type BackgroundConfig,
  type Competition,
  type EventConfig,
  type FaultSubmission,
  type Judge,
  type Language,
  type ScoreSubmission
} from '../initialData';
import { getDimensionsConfig } from '../initialData';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { createAdminAccount, verifyAdminPassword } from '../utils/auth';
import { calculatePlaceMethodRankings } from '../utils/ranking';
import { createId } from '../utils/storage';
import { syncCompetitionRecords } from '../utils/sync';
import { decodeQrRecord, type DatabaseSnapshot } from '../utils/qr';
import { exportRankingToExcel, exportRankingToPDF, openExportedFile as openGeneratedFile, type ExportedFile } from '../utils/export';
import { I18nAutoText, I18nText, formatText, localizedNameForMode, singleNameForMode, singleNameNodeForMode, type TextMode } from '../utils/i18n';
import { mergeIncomingTransferSettings } from '../utils/transfer';

type AdminTab = 'ranking' | 'people' | 'sync' | 'settings';
type AthleteSortMode = 'order' | 'name' | 'country' | 'school';
type JudgeSortMode = 'name' | 'role' | 'id';
type RankingSortMode = 'rank' | 'name' | 'points' | 'average' | 'completion' | 'order';

const BACKGROUND_GRADIENT_PRESETS = [
  { id: 'ember', zh: '默认 - 余烬', en: 'Default - Ember', value: 'radial-gradient(circle at 50% -20%, #342018 0, #0d0d0e 42%)' },
  { id: 'cosmic', zh: '宇宙', en: 'Cosmic', value: 'radial-gradient(circle at 50% -20%, #1a2340 0, #0d0d0e 42%)' },
  { id: 'terminal', zh: '终端', en: 'Terminal', value: 'radial-gradient(circle at 50% -20%, #0f2820 0, #0d0d0e 42%)' },
  { id: 'ocean', zh: '海洋', en: 'Ocean', value: 'radial-gradient(circle at 50% -20%, #1a3340 0, #0d0d0e 42%)' },
  { id: 'forest', zh: '森林', en: 'Forest', value: 'radial-gradient(circle at 50% -20%, #2a3318 0, #0d0d0e 42%)' },
  { id: 'sunset', zh: '日落', en: 'Sunset', value: 'radial-gradient(circle at 50% -20%, #402818 0, #0d0d0e 42%)' }
] as const;

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = event => {
    const value = event.target?.result;
    if (typeof value === 'string') resolve(value);
    else reject(new Error('File read failed'));
  };
  reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
  reader.readAsDataURL(file);
});

const compressImageBackground = async (file: File) => {
  const source = await readFileAsDataUrl(file);
  if (file.size <= 1.5 * 1024 * 1024) return source;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new Image();
    item.onload = () => resolve(item);
    item.onerror = () => reject(new Error('Image decode failed'));
    item.src = source;
  });
  const maxSide = 1920;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#0d0d0e';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
};

const SavedControlContext = createContext({
  savedFields: {} as Record<string, boolean>,
  savedLabel: 'Saved'
});

function SavedControl({ field, children }: { field: string; children: ReactNode }) {
  const { savedFields, savedLabel } = useContext(SavedControlContext);
  return (
    <span className={`saved-control ${savedFields[field] ? 'is-saved' : ''}`}>
      {children}
      {savedFields[field] && <Check className="saved-control-check" size={16} aria-label={savedLabel} />}
    </span>
  );
}

function FloatingField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="floating-field">
      <span className="floating-field-label">{label}</span>
      {children}
    </label>
  );
}

interface IntegrationLogEntry {
  id: string;
  createdAt: string;
  packageId?: string;
  sourceExportedAt?: string;
  sourceDeviceName?: string;
  exporterName?: string;
  addedCount: number;
  acceptedConflictCount: number;
  deleteCount: number;
  localKeptCount: number;
  groups: Array<{
    entity: string;
    label: string;
    added: number;
    accepted: number;
    deleted: number;
    kept: number;
    newItems: string[];
  }>;
  conflicts: Array<{
    label: string;
    decision: 'local' | 'incoming';
    differences: string[];
  }>;
}

interface AdminPanelProps {
  athletes: Athlete[];
  competitions: Competition[];
  judges: Judge[];
  events: EventConfig[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  admins: AdminAccount[];
  online: boolean;
  language: Language;
  settings: AppSettings;
  onChangeAthletes: (value: Athlete[]) => Promise<void> | void;
  onChangeCompetitions: (value: Competition[]) => Promise<void> | void;
  onChangeJudges: (value: Judge[]) => Promise<void> | void;
  onChangeEvents: (value: EventConfig[]) => Promise<void> | void;
  onChangeAdmins: (value: AdminAccount[]) => void;
  onChangeSettings: (value: AppSettings) => Promise<void> | void;
  onSaveScore: (value: ScoreSubmission) => Promise<void>;
  onSaveFault: (value: FaultSubmission) => Promise<void>;
  databaseSnapshot: DatabaseSnapshot;
  integrationHistory: IntegrationLogEntry[];
  syncDeviceName: string;
  syncExporterName: string;
  onChangeSyncDeviceName: (value: string) => void;
  onChangeSyncExporterName: (value: string) => void;
  onRegisterBackHandler: (handler: (() => boolean) | null) => void;
  onLogout: () => void;
  textMode: TextMode;
}

export function AdminPanel(props: AdminPanelProps) {
  const {
    athletes,
    competitions,
    judges,
    events,
    scores,
    faults,
    admins,
    online,
    language,
    settings,
    onChangeAthletes,
    onChangeCompetitions,
    onChangeJudges,
    onChangeEvents,
    onChangeAdmins,
    onChangeSettings,
    onSaveScore,
    onSaveFault,
    databaseSnapshot,
    integrationHistory,
    syncDeviceName,
    syncExporterName,
    onChangeSyncDeviceName,
    onChangeSyncExporterName,
    onRegisterBackHandler,
    onLogout,
    textMode
  } = props;
  const L = (zh: string, en: string) => formatText(zh, en, textMode);
  const B = (zh: string, en: string) => <I18nText zh={zh} en={en} mode={textMode} />;
  const V = (text: string) => <I18nAutoText text={text} mode={textMode} />;
  const displayName = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => localizedNameForMode(item, textMode);
  const personName = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => singleNameForMode(item, textMode);
  const personNameNode = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => singleNameNodeForMode(item, textMode);
  const chineseNameLabel = L('华文名字', 'Chinese name');
  const englishNameLabel = L('英文名字', 'English name');
  const personOrTeamNameLabel = L('个人名字/团队名字', 'Person / team name');
  const personalNameLabel = L('个人名字', 'Personal name');
  const hasChineseText = (value: string) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
  const englishOnlyNotice = () => setNotice(L('英文栏位只能输入英文，不能输入华文。', 'English fields can only contain English, not Chinese.'));
  const updateEnglishDraft = (value: string, setter: (value: string) => void) => {
    if (hasChineseText(value)) {
      englishOnlyNotice();
      return;
    }
    setter(value);
  };
  const guardEnglishValue = (value: string) => {
    if (!hasChineseText(value)) return true;
    englishOnlyNotice();
    return false;
  };
  const athleteGenderLabel = (gender: Athlete['gender']) => ({
    Male: L('男', 'Male'),
    Female: L('女', 'Female'),
    'Co-ed': L('混合', 'Co-ed')
  })[gender];
  const athleteSectionLabel = (section: AthleteSection | undefined) => ({
    Primary: L('小学组', 'Primary'),
    Secondary: L('中学组', 'Secondary'),
    Open: L('公开组', 'Open')
  })[section ?? 'Open'];
  const competitionStatusLabel = (status: Competition['status']) => ({
    Draft: L('草稿', 'Draft'),
    Active: L('进行中', 'Active'),
    Completed: L('已完成', 'Completed')
  })[status];
  const roundStatusLabel = (status: Competition['rounds'][number]['status']) => ({
    Draft: L('草稿', 'Draft'),
    Active: L('进行中', 'Active'),
    Completed: L('已完成', 'Completed')
  })[status];
  const judgeRoleLabel = (role: Judge['role']) => role === 'Scoring'
    ? L('评分裁判', 'Scoring judge')
    : L('技术裁判', 'Technical judge');
  const [unlocked, setUnlocked] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(admins.length ? 'login' : 'register');
  const [adminName, setAdminName] = useState(admins[0]?.name ?? '');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<AdminTab>('ranking');
  const [tabHistory, setTabHistory] = useState<AdminTab[]>([]);
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const eventCompetitions = competitions.filter(item => item.eventId === eventId);
  const [competitionId, setCompetitionId] = useState(eventCompetitions[0]?.id ?? '');
  const competition = eventCompetitions.find(item => item.id === competitionId) ?? eventCompetitions[0];
  const [roundId, setRoundId] = useState(competition?.rounds[0]?.id ?? '');
  const round = competition?.rounds.find(item => item.id === roundId) ?? competition?.rounds[0];
  const scoringJudges = judges.filter(item =>
    item.role === 'Scoring' && item.competitionIds.includes(competition?.id ?? '')
  );
  const rankings = competition && round
    ? calculatePlaceMethodRankings(competition, round.id, athletes, scores, faults, scoringJudges)
    : [];
  const [syncText, setSyncText] = useState('');
  const [notice, setNotice] = useState('');
  const [exportedFile, setExportedFile] = useState<ExportedFile | null>(null);
  const [newAthleteName, setNewAthleteName] = useState('');
  const [newAthleteOrder, setNewAthleteOrder] = useState('');
  const [newAthleteSchool, setNewAthleteSchool] = useState('');
  const [newAthleteCountry, setNewAthleteCountry] = useState('');
  const [newAthleteGender, setNewAthleteGender] = useState<Athlete['gender']>('Male');
  const [newAthleteSection, setNewAthleteSection] = useState<AthleteSection>('Open');
  const [newRoundName, setNewRoundName] = useState('');
  const [newRoundNameEn, setNewRoundNameEn] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [athleteSort, setAthleteSort] = useState<AthleteSortMode>('order');
  const [judgeSearch, setJudgeSearch] = useState('');
  const [judgeSort, setJudgeSort] = useState<JudgeSortMode>('name');
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingSort, setRankingSort] = useState<RankingSortMode>('rank');
  const [selectedRankingAthleteId, setSelectedRankingAthleteId] = useState('');
  const [editingAthleteId, setEditingAthleteId] = useState('');
  const [newJudgeName, setNewJudgeName] = useState('');
  const [newJudgeRole, setNewJudgeRole] = useState<Judge['role']>('Scoring');
  const [newCompetitionName, setNewCompetitionName] = useState('');
  const [newCompetitionNameEn, setNewCompetitionNameEn] = useState('');
  const [expandedCompetitionIds, setExpandedCompetitionIds] = useState<Record<string, boolean>>({});
  const [newEventName, setNewEventName] = useState('');
  const [newEventNameEn, setNewEventNameEn] = useState('');
  const [athletesToAssign, setAthletesToAssign] = useState<string[]>([]);
  const [athleteOrderDrafts, setAthleteOrderDrafts] = useState<Record<string, string>>({});
  const [judgeToAssign, setJudgeToAssign] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [doneAction, setDoneAction] = useState('');
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  
  // Background customization states
  const [bgPreview, setBgPreview] = useState<BackgroundConfig | null>(null);
  const [bgType, setBgType] = useState<'gradient' | 'image' | 'video'>('gradient');
  const [bgValue, setBgValue] = useState('');
  const [bgOpacity, setBgOpacity] = useState(100); // Changed to 0-100 scale
  const [showBgPreview, setShowBgPreview] = useState(false);
  const [backgroundFileName, setBackgroundFileName] = useState('');
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const selectedGradientPreset = bgType === 'gradient' && BACKGROUND_GRADIENT_PRESETS.some(preset => preset.value === bgValue)
    ? bgValue
    : '';
  const competitionAthletes = athletes.filter(item => item.competitionIds.includes(competition?.id ?? ''));
  const competitionJudges = judges.filter(item => item.competitionIds.includes(competition?.id ?? ''));
  const availableAthletes = athletes.filter(item => !item.competitionIds.includes(competition?.id ?? ''));
  const availableJudges = judges.filter(item => !item.competitionIds.includes(competition?.id ?? ''));
  const nextAthleteOrder = Math.max(0, ...competitionAthletes.map(item => item.order || 0)) + 1;
  const sortRounds = (rounds: Competition['rounds']) => [...rounds].sort((left, right) => left.sequence - right.sequence);
  const firstRoundId = (item: Competition | undefined) => sortRounds(item?.rounds ?? [])[0]?.id ?? '';
  const athleteIdsForCompetition = (competitionId: string) => athletes
    .filter(item => item.competitionIds.includes(competitionId))
    .sort((left, right) => left.order - right.order)
    .map(item => item.id);
  const ensureRoundHasEntrants = (item: Competition['rounds'][number], competitionId: string) => item.athleteIds.length
    ? item
    : { ...item, athleteIds: athleteIdsForCompetition(competitionId) };

  const ensureActiveCompetitionHasRound = (item: Competition): Competition => {
    if (item.status !== 'Active') return item;
    const activeRound = item.rounds.find(value => value.status === 'Active');
    if (activeRound) {
      return {
        ...item,
        rounds: item.rounds.map(value => value.id === activeRound.id ? ensureRoundHasEntrants(value, item.id) : value)
      };
    }
    const firstPlayableRound = sortRounds(item.rounds).find(value => value.status !== 'Completed') ?? sortRounds(item.rounds)[0];
    if (!firstPlayableRound) return item;
    return {
      ...item,
      rounds: item.rounds.map(value => value.id === firstPlayableRound.id ? ensureRoundHasEntrants({ ...value, status: 'Active' }, item.id) : value)
    };
  };

  useEffect(() => {
    if (events.some(item => item.id === eventId)) return;
    const firstEvent = events[0];
    const firstCompetition = firstEvent ? competitions.find(item => item.eventId === firstEvent.id) : undefined;
    setEventId(firstEvent?.id ?? '');
    setCompetitionId(firstCompetition?.id ?? '');
    setRoundId(firstRoundId(firstCompetition));
  }, [competitions, eventId, events]);

  useEffect(() => {
    if (!eventCompetitions.some(item => item.id === competitionId)) {
      const first = eventCompetitions[0];
      setCompetitionId(first?.id ?? '');
      setRoundId(firstRoundId(first));
    }
  }, [competitionId, eventCompetitions]);

  useEffect(() => {
    if (!competition) {
      if (roundId) setRoundId('');
      return;
    }
    if (!competition.rounds.some(item => item.id === roundId)) {
      setRoundId(firstRoundId(competition));
    }
  }, [competition, roundId]);

  useEffect(() => {
    const currentBackground = settings.customBackground;
    if (!currentBackground) {
      setBgType('gradient');
      setBgValue('');
      setBgOpacity(100);
      return;
    }
    setBgType(currentBackground.type);
    setBgValue(currentBackground.value);
    setBgOpacity(currentBackground.opacity ?? 100);
  }, [
    settings.customBackground?.type,
    settings.customBackground?.value,
    settings.customBackground?.opacity
  ]);

  useEffect(() => {
    if (!notice) return;
    if (exportedFile && notice.includes(exportedFile.fileName)) return;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [exportedFile, notice]);

  useEffect(() => {
    if (!selectedRankingAthleteId) return;
    if (rankings.some(row => row.athlete.id === selectedRankingAthleteId)) return;
    setSelectedRankingAthleteId('');
  }, [rankings, selectedRankingAthleteId]);

  useEffect(() => () => {
    if (exportedFile) URL.revokeObjectURL(exportedFile.url);
  }, [exportedFile]);

  useEffect(() => {
    setNewAthleteOrder(String(nextAthleteOrder));
  }, [competition?.id]);

  useEffect(() => {
    if (!competition || !round || !competitionAthletes.length) return;
    const firstRound = sortRounds(competition.rounds)[0];
    if (!firstRound || round.id !== firstRound.id) return;
    const key = `mdiabolo:first-round-defaulted:${competition.id}:${firstRound.id}`;
    if (window.localStorage.getItem(key)) return;
    const missingAthletes = competitionAthletes.filter(athlete => !firstRound.athleteIds.includes(athlete.id));
    if (!missingAthletes.length) return;
    window.localStorage.setItem(key, '1');
    void updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => item.id === firstRound.id
        ? { ...item, athleteIds: competitionAthletes.map(athlete => athlete.id) }
        : item)
    });
  }, [competition, round, competitionAthletes]);

  const localCount = useMemo(
    () => scores.filter(item => item.syncStatus !== 'synced').length + faults.filter(item => item.syncStatus !== 'synced').length,
    [faults, scores]
  );

  const changeTab = (next: AdminTab) => {
    if (next === tab) return;
    setTabHistory(history => [...history, tab]);
    setTab(next);
  };

  useEffect(() => {
    onRegisterBackHandler(() => {
      if (showBgPreview) {
        setShowBgPreview(false);
        return true;
      }
      if (selectedRankingAthleteId) {
        setSelectedRankingAthleteId('');
        return true;
      }
      if (editingAthleteId) {
        setEditingAthleteId('');
        return true;
      }
      if (!unlocked) {
        if (authMode === 'register' && admins.length > 0) {
          setAuthMode('login');
          return true;
        }
        return false;
      }
      if (tabHistory.length) {
        const previous = tabHistory[tabHistory.length - 1];
        setTabHistory(history => history.slice(0, -1));
        setTab(previous);
        return true;
      }
      if (tab !== 'ranking') {
        setTab('ranking');
        return true;
      }
      setNotice(L('已经在管理员主页面；如需退出请点击 Logout。', 'Already on the administrator home page. Tap Logout to exit.'));
      return true;
    });
    return () => onRegisterBackHandler(null);
  }, [admins.length, authMode, editingAthleteId, onRegisterBackHandler, selectedRankingAthleteId, showBgPreview, tab, tabHistory, unlocked]);

  const markDone = (action: string) => {
    setDoneAction(action);
    window.setTimeout(() => setDoneAction(current => current === action ? '' : current), 1100);
  };

  const actionClass = (action: string) => `${busyAction === action ? 'is-busy' : ''} ${doneAction === action ? 'is-done' : ''}`;

  const markSavedField = (field: string) => {
    setSavedFields(current => ({ ...current, [field]: true }));
    window.setTimeout(() => {
      setSavedFields(current => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }, 1400);
  };

  const persistField = async (field: string, callback: () => Promise<void> | void): Promise<boolean> => {
    try {
      await callback();
      markSavedField(field);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('保存失败，请重试。', 'Save failed. Try again.'));
      return false;
    }
  };

  const runBusyAction = async (action: string, callback: () => Promise<boolean | void> | boolean | void) => {
    if (busyAction) return;
    setBusyAction(action);
    try {
      const result = await callback();
      if (result !== false) markDone(action);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('保存失败，请重试。', 'Save failed. Try again.'));
    } finally {
      setBusyAction('');
    }
  };

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction('auth');
    setAuthError('');
    try {
      if (password.length < 6) {
        setAuthError(L('密码至少需要 6 个字符。', 'Password must contain at least 6 characters.'));
        return;
      }
      if (authMode === 'register') {
        if (!adminName.trim()) {
          setAuthError(L('请输入管理员姓名。', 'Enter the administrator name.'));
          return;
        }
        if (admins.length >= 2) {
          setAuthError(L('本设备最多注册两个管理员。', 'This device supports at most two administrators.'));
          return;
        }
        const account = await createAdminAccount(adminName, password);
        onChangeAdmins([...admins, account]);
        setUnlocked(true);
        setPassword('');
        return;
      }
      const account = admins.find(item => item.name.toLowerCase() === adminName.trim().toLowerCase());
      if (!account || !await verifyAdminPassword(account, password)) {
        setAuthError(L('姓名或密码不正确。', 'Incorrect name or password.'));
        return;
      }
      setUnlocked(true);
      setPassword('');
    } finally {
      setBusyAction('');
    }
  };

  const updateCompetition = async (next: Competition, savedField?: string) => {
    await onChangeCompetitions(competitions.map(item => item.id === next.id ? ensureActiveCompetitionHasRound(next) : item));
    if (savedField) markSavedField(savedField);
  };

  const includeAthletesInFirstRound = async (athleteIds: string[]) => {
    if (!competition || !athleteIds.length) return;
    const firstRound = sortRounds(competition.rounds)[0];
    if (!firstRound) return;
    const nextAthleteIds = Array.from(new Set([...firstRound.athleteIds, ...athleteIds]));
    if (nextAthleteIds.length === firstRound.athleteIds.length) return;
    await updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => item.id === firstRound.id
        ? { ...item, athleteIds: nextAthleteIds }
        : item)
    });
  };

  const removeAthleteFromCurrentCompetition = async (athleteId: string) => {
    if (!competition) return;
    await onChangeAthletes(athletes.map(athlete => athlete.id === athleteId
      ? { ...athlete, competitionIds: athlete.competitionIds.filter(id => id !== competition.id) }
      : athlete));
    await updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => ({
        ...item,
        athleteIds: item.athleteIds.filter(id => id !== athleteId)
      }))
    });
  };

  const athleteSourceLabel = (item: Athlete) => {
    const sourceNames = item.competitionIds
      .map(id => competitions.find(value => value.id === id))
      .filter((value): value is Competition => Boolean(value))
      .map(value => displayName(value));
    return sourceNames.length ? sourceNames.join(' / ') : L('尚未分配比赛', 'No competition assigned');
  };

  const copyTextToClipboard = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(successMessage);
      return;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setNotice(copied ? successMessage : L('复制失败，请手动选择文字。', 'Copy failed. Please select the text manually.'));
    }
  };

  const copyAthleteInfo = async (item: Athlete) => {
    const lines = [
      `Order: ${item.order}`,
      `Name: ${item.nameZh || item.name}`,
      `Team / organization: ${item.school || ''}`,
      `Country / region: ${item.country || ''}`
    ];
    await copyTextToClipboard(lines.join('\n'), L('选手信息已复制。', 'Athlete info copied.'));
  };

  const changeCompetitionStatus = async (id: string, status: Competition['status']) => {
    await persistField(`competition-${id}-status`, () => onChangeCompetitions(competitions.map(item => item.id === id
      ? ensureActiveCompetitionHasRound({ ...item, status })
      : item)));
  };

  const changeRoundStatus = async (status: Competition['rounds'][number]['status']) => {
    if (!competition || !round) return;
    await persistField(`round-${round.id}-status`, () => updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => {
        if (item.id === round.id) return status === 'Active'
          ? ensureRoundHasEntrants({ ...item, status }, competition.id)
          : { ...item, status };
        if (status === 'Active' && item.status === 'Active') return { ...item, status: 'Draft' };
        return item;
      })
    }));
  };

  const updateRound = async (
    targetRoundId: string,
    patch: Partial<Competition['rounds'][number]>,
    savedField?: string
  ) => {
    if (!competition) return;
    await updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => {
        if (item.id === targetRoundId) {
          const nextRound = { ...item, ...patch };
          return patch.status === 'Active' ? ensureRoundHasEntrants(nextRound, competition.id) : nextRound;
        }
        if (patch.status === 'Active' && item.status === 'Active') return { ...item, status: 'Draft' };
        return item;
      })
    }, savedField);
  };

  const addRound = async () => {
    if (!competition || !newRoundName.trim() || !newRoundNameEn.trim()) {
      setNotice(L('请同时填写回合的华文和英文名字。', 'Enter both Chinese and English round names.'));
      return;
    }
    if (!guardEnglishValue(newRoundNameEn)) return;
    const shouldActivateRound = competition.status === 'Active' && !competition.rounds.some(item => item.status === 'Active');
    if (!await persistField('add-round', () => updateCompetition({
      ...competition,
      rounds: [...competition.rounds, {
        id: createId('R'),
        name: newRoundName.trim(),
        nameZh: newRoundName.trim(),
        nameEn: newRoundNameEn.trim() || newRoundName.trim(),
        sequence: competition.rounds.length + 1,
        status: shouldActivateRound ? 'Active' : 'Draft',
        athleteIds: [],
        advancingCount: null
      }]
    }))) return;
    setNewRoundName('');
    setNewRoundNameEn('');
    markDone('add-round');
    setNotice(L('已新增回合 ✓', 'Round added ✓'));
  };

  const toggleEntrant = (athleteId: string) => {
    if (!competition || !round) return;
    if (round.id === sortRounds(competition.rounds)[0]?.id) {
      window.localStorage.setItem(`mdiabolo:first-round-defaulted:${competition.id}:${round.id}`, '1');
    }
    const athleteIds = round.athleteIds.includes(athleteId)
      ? round.athleteIds.filter(id => id !== athleteId)
      : [...round.athleteIds, athleteId];
    updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => item.id === round.id ? { ...item, athleteIds } : item)
    });
  };

  const advanceTop = async () => {
    if (!competition || !round) return;
    await runBusyAction('advance-top', async () => {
    const nextRound = [...competition.rounds]
      .sort((a, b) => a.sequence - b.sequence)
      .find(item => item.sequence > round.sequence);
    if (!nextRound) {
      setNotice(L('请先建立下一回合。', 'Create the next round first.'));
      return false;
    }
    const count = round.advancingCount ?? rankings.length;
    const qualified = rankings.filter(item => item.complete).slice(0, count).map(item => item.athlete.id);
    if (!qualified.length) {
      setNotice(L('所有评分裁判完成评分后才能晋级。', 'All scoring judges must finish before advancing athletes.'));
      return false;
    }
    await updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => {
        if (item.id === round.id) return { ...item, status: 'Completed' };
        if (item.id === nextRound.id) return { ...item, status: 'Active', athleteIds: qualified };
        return item;
      })
    });
    setRoundId(nextRound.id);
    setNotice(L(`${qualified.length} 名运动员已晋级 ${displayName(nextRound)}。`, `${qualified.length} athletes advanced to ${displayName(nextRound)}.`));
    });
  };

  const exportExcelRanking = async () => {
    if (!competition || !round) return;
    await runBusyAction('export-excel', async () => {
      const file = await exportRankingToExcel(competition, round, rankings, competitionJudges, scores, faults, language);
      setExportedFile(file);
      setNotice(L(`Excel ready: ${file.fileName}. Tap to open/download.`, `Excel ready: ${file.fileName}. Tap here to open or download again.`));
    });
  };
  const exportPdfRanking = async () => {
    if (!competition || !round) return;
    await runBusyAction('export-pdf', async () => {
      const file = await exportRankingToPDF(competition, round, rankings, competitionJudges, scores, language);
      setExportedFile(file);
      setNotice(L(`PDF ready: ${file.fileName}. Tap to open/download.`, `PDF ready: ${file.fileName}. Tap here to open or download again.`));
    });
  };

  const openExportedFile = () => {
    if (!exportedFile) return;
    void openGeneratedFile(exportedFile);
  };

  const closeNotice = () => {
    setNotice('');
  };

  const addAthlete = async () => {
    if (!newAthleteName.trim()) {
      setNotice(L('请填写个人名字/团队名字。', 'Enter the person or team name.'));
      return;
    }
    const parsedOrder = Math.max(1, Number(newAthleteOrder) || nextAthleteOrder);
    if (competitionAthletes.some(item => item.order === parsedOrder)) {
      setNotice(L(`出场顺序 #${parsedOrder} 已经有选手，请换一个顺序。`, `Order #${parsedOrder} is already used. Choose another order.`));
      return false;
    }
    const athleteId = createId('ATH');
    if (!await persistField('add-athlete', async () => {
      await onChangeAthletes([...athletes, {
        id: athleteId,
        order: parsedOrder,
        name: newAthleteName.trim(),
        nameZh: newAthleteName.trim(),
        nameEn: newAthleteName.trim(),
        school: newAthleteSchool.trim(),
        age: 16,
        gender: newAthleteGender,
        section: newAthleteSection,
        country: newAthleteCountry.trim(),
        teamName: null,
        competitionIds: competition ? [competition.id] : []
      }]);
      await includeAthletesInFirstRound([athleteId]);
    })) return;
    setNewAthleteName('');
    setNewAthleteOrder(String(parsedOrder + 1));
    setNewAthleteSchool('');
    setNewAthleteCountry('');
    setNewAthleteGender('Male');
    setNewAthleteSection('Open');
    markDone('add-athlete');
    setNotice(L('已添加运动员 ✓', 'Athlete added ✓'));
  };

  const addJudge = async () => {
    if (!newJudgeName.trim() || !competition) {
      setNotice(L('请填写裁判名字。', 'Enter the judge name.'));
      return;
    }
    if (!await persistField('add-judge', () => onChangeJudges([...judges, {
      id: createId('J'),
      name: newJudgeName.trim(),
      nameZh: newJudgeName.trim(),
      nameEn: newJudgeName.trim(),
      role: newJudgeRole,
      competitionIds: [competition.id]
    }]))) return;
    setNewJudgeName('');
    markDone('add-judge');
    setNotice(L('已添加裁判 ✓', 'Judge added ✓'));
  };

  const assignExistingAthletes = async () => {
    if (!competition || !athletesToAssign.length) return;
    const selectedIds = athletesToAssign;
    const usedOrders = new Set(competitionAthletes.map(item => item.order));
    const reassignedOrders = new Map<string, number>();
    const nextFreeOrder = () => {
      let order = 1;
      while (usedOrders.has(order)) order += 1;
      usedOrders.add(order);
      return order;
    };
    selectedIds.forEach(id => {
      const item = athletes.find(athlete => athlete.id === id);
      if (!item) return;
      if (usedOrders.has(item.order)) {
        reassignedOrders.set(id, nextFreeOrder());
      } else {
        usedOrders.add(item.order);
      }
    });
    if (!await persistField('assign-athlete', async () => {
      await onChangeAthletes(athletes.map(item => selectedIds.includes(item.id)
        ? {
            ...item,
            order: reassignedOrders.get(item.id) ?? item.order,
            competitionIds: item.competitionIds.includes(competition.id) ? item.competitionIds : [...item.competitionIds, competition.id]
          }
        : item));
      await includeAthletesInFirstRound(selectedIds);
    })) return;
    setAthletesToAssign([]);
    markDone('assign-athlete');
    setNotice(reassignedOrders.size
      ? L('已加入本比赛，重复的出场顺序已自动改成下一个可用顺序。', 'Assigned to competition. Duplicate orders were moved to the next available order.')
      : L('已加入本比赛 ✓', 'Assigned to competition ✓'));
  };

  const toggleAthleteToAssign = (athleteId: string) => {
    setAthletesToAssign(current => current.includes(athleteId)
      ? current.filter(id => id !== athleteId)
      : [...current, athleteId]);
  };

  const updateAthleteOrder = async (athleteId: string, rawValue: string): Promise<boolean> => {
    const current = athletes.find(item => item.id === athleteId);
    if (!current) return false;
    const nextOrder = Math.max(1, Number(rawValue) || current.order);
    if (nextOrder === current.order) return true;
    const duplicate = competitionAthletes.find(item => item.id !== athleteId && item.order === nextOrder);
    if (duplicate) {
      setNotice(L(`出场顺序 #${nextOrder} 已经给了 ${personName(duplicate)}，不能重复。`, `Order #${nextOrder} is already assigned to ${personName(duplicate)}. It cannot be duplicated.`));
      return;
    }
    return persistField(`athlete-${athleteId}-order`, () => onChangeAthletes(athletes.map(athlete => athlete.id === athleteId
      ? { ...athlete, order: nextOrder }
      : athlete)));
  };

  const commitAthleteOrderDraft = async (athleteId: string) => {
    const draft = athleteOrderDrafts[athleteId];
    if (draft === undefined) return;
    await updateAthleteOrder(athleteId, draft);
    setAthleteOrderDrafts(current => {
      const next = { ...current };
      delete next[athleteId];
      return next;
    });
  };

  const assignExistingJudge = async () => {
    if (!competition || !judgeToAssign) return;
    if (!await persistField('assign-judge', () => onChangeJudges(judges.map(item => item.id === judgeToAssign
      ? { ...item, competitionIds: item.competitionIds.includes(competition.id) ? item.competitionIds : [...item.competitionIds, competition.id] }
      : item)))) return;
    setJudgeToAssign('');
    markDone('assign-judge');
    setNotice(L('已加入本比赛 ✓', 'Assigned to competition ✓'));
  };

  const addCompetition = async () => {
    if (!newCompetitionName.trim() || !newCompetitionNameEn.trim()) {
      setNotice(L('请同时填写比赛的华文和英文名字。', 'Enter both Chinese and English competition names.'));
      return;
    }
    if (!guardEnglishValue(newCompetitionNameEn)) return;
    const id = createId('COMP');
    const created: Competition = {
      id,
      eventId: eventId || events[0]?.id || 'E-01',
      name: newCompetitionName.trim(),
      nameZh: newCompetitionName.trim(),
      nameEn: newCompetitionNameEn.trim() || newCompetitionName.trim(),
      type: 'Individual Stage',
      region: 'Taiwan',
      division: 'Open',
      status: 'Draft',
      faultDeduction: 0.5,
      rounds: [{ id: createId('R'), name: '预赛', nameZh: '预赛', nameEn: 'Qualifier', sequence: 1, status: 'Draft', athleteIds: [], advancingCount: null }]
    };
    if (!await persistField('add-competition', () => onChangeCompetitions([...competitions, created]))) return;
    setCompetitionId(id);
    setRoundId(created.rounds[0].id);
    setNewCompetitionName('');
    setNewCompetitionNameEn('');
    markDone('add-competition');
    setNotice(L('已新增比赛 ✓', 'Competition added ✓'));
  };

  const removeCompetition = async (target: Competition) => {
    if (!window.confirm(L(`确定删除比赛项目「${displayName(target)}」吗？`, `Delete competition "${displayName(target)}"?`))) return;
    const field = `remove-competition-${target.id}`;
    const remainingCompetitions = competitions.filter(item => item.id !== target.id);
    const fallbackCompetition = remainingCompetitions.find(item => item.eventId === target.eventId) ?? remainingCompetitions[0];
    if (!await persistField(field, async () => {
      await onChangeCompetitions(remainingCompetitions);
      await onChangeAthletes(athletes.map(item => item.competitionIds.includes(target.id)
        ? { ...item, competitionIds: item.competitionIds.filter(id => id !== target.id) }
        : item));
      await onChangeJudges(judges.map(item => item.competitionIds.includes(target.id)
        ? { ...item, competitionIds: item.competitionIds.filter(id => id !== target.id) }
        : item));
      if (settings.activeCompetitionId === target.id) {
        await onChangeSettings({
          ...settings,
          activeEventId: fallbackCompetition?.eventId ?? settings.activeEventId,
          activeCompetitionId: fallbackCompetition?.id
        });
      }
      if (competitionId === target.id) {
        setCompetitionId(fallbackCompetition?.id ?? '');
        setEventId(fallbackCompetition?.eventId ?? eventId);
        setRoundId(firstRoundId(fallbackCompetition));
      }
      setExpandedCompetitionIds(current => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
    })) return;
    markDone(field);
    setNotice(L('已删除比赛项目。', 'Competition deleted.'));
  };

  const addEvent = async () => {
    if (!newEventName.trim() || !newEventNameEn.trim()) {
      setNotice(L('请同时填写赛事的华文和英文名字。', 'Enter both Chinese and English event names.'));
      return;
    }
    if (!guardEnglishValue(newEventNameEn)) return;
    const id = createId('E');
    if (!await persistField('add-event', () => onChangeEvents([...events, {
      id,
      name: newEventName.trim(),
      nameZh: newEventName.trim(),
      nameEn: newEventNameEn.trim() || newEventName.trim(),
      poster: '',
      backgroundTheme: 'Ember'
    }]))) return;
    setEventId(id);
    setCompetitionId('');
    setRoundId('');
    setNewEventName('');
    setNewEventNameEn('');
    markDone('add-event');
    setNotice(L('已新增赛事 ✓', 'Event added ✓'));
  };

  const removeEvent = async (target: EventConfig) => {
    if (events.length <= 1) {
      setNotice(L('至少保留一个赛事。', 'Keep at least one event.'));
      return;
    }
    const competitionCount = competitions.filter(item => item.eventId === target.id).length;
    const message = competitionCount
      ? L(`确定删除赛事「${displayName(target)}」吗？此赛事下的 ${competitionCount} 个比赛项目也会一起删除。`, `Delete event "${displayName(target)}"? Its ${competitionCount} competitions will also be deleted.`)
      : L(`确定删除赛事「${displayName(target)}」吗？`, `Delete event "${displayName(target)}"?`);
    if (!window.confirm(message)) return;
    const field = `remove-event-${target.id}`;
    const removedCompetitionIds = new Set(competitions.filter(item => item.eventId === target.id).map(item => item.id));
    const remainingEvents = events.filter(item => item.id !== target.id);
    const remainingCompetitions = competitions.filter(item => item.eventId !== target.id);
    const fallbackEvent = remainingEvents[0];
    const fallbackCompetition = remainingCompetitions.find(item => item.eventId === fallbackEvent?.id) ?? remainingCompetitions[0];
    if (!await persistField(field, async () => {
      await onChangeEvents(remainingEvents);
      await onChangeCompetitions(remainingCompetitions);
      if (removedCompetitionIds.size) {
        await onChangeAthletes(athletes.map(item => {
          const competitionIds = item.competitionIds.filter(id => !removedCompetitionIds.has(id));
          return competitionIds.length === item.competitionIds.length ? item : { ...item, competitionIds };
        }));
        await onChangeJudges(judges.map(item => {
          const competitionIds = item.competitionIds.filter(id => !removedCompetitionIds.has(id));
          return competitionIds.length === item.competitionIds.length ? item : { ...item, competitionIds };
        }));
      }
      if (settings.activeEventId === target.id || (settings.activeCompetitionId && removedCompetitionIds.has(settings.activeCompetitionId))) {
        await onChangeSettings({
          ...settings,
          activeEventId: fallbackEvent?.id ?? '',
          activeCompetitionId: fallbackCompetition?.id
        });
      }
      if (eventId === target.id) {
        setEventId(fallbackEvent?.id ?? '');
        setCompetitionId(fallbackCompetition?.id ?? '');
        setRoundId(firstRoundId(fallbackCompetition));
      }
      setExpandedCompetitionIds(current => {
        const next = { ...current };
        removedCompetitionIds.forEach(id => delete next[id]);
        return next;
      });
    })) return;
    markDone(field);
    setNotice(L('已删除赛事。', 'Event deleted.'));
  };

  const importPayload = async (payload: string) => {
    try {
      const decoded = decodeQrRecord(payload);
      if (decoded.type === 'SCORE') await onSaveScore(decoded.record);
      else await onSaveFault(decoded.record);
      setSyncText('');
      setNotice(L('QR 数据导入成功。', 'QR data imported successfully.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('QR 数据导入失败。', 'QR import failed.'));
    }
  };

  const scanQr = async () => {
    try {
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        setNotice(L('此浏览器不支持原生扫码，请使用下方粘贴导入；Capacitor App 支持相机扫码。', 'This browser does not support native scanning. Paste the QR data below; the Capacitor app supports camera scanning.'));
        return;
      }
      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted') {
        setNotice(L('需要相机权限才能扫描裁判 QR。', 'Camera permission is required to scan judge QR codes.'));
        return;
      }
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
      const value = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
      if (!value) throw new Error(L('没有读取到 QR 数据', 'No QR data was detected'));
      void importPayload(value);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('扫码失败。', 'Scanning failed.'));
    }
  };

  const syncOnline = async () => {
    if (busyAction) return;
    if (!online) {
      setNotice(L('当前离线。数据仍安全保存在本机，联网后再同步。', 'Currently offline. Data remains safely stored on this device and can sync later.'));
      return;
    }
    const pendingScores = scores.filter(item => item.syncStatus !== 'synced');
    const pendingFaults = faults.filter(item => item.syncStatus !== 'synced');
    setBusyAction('sync-online');
    setSyncing(true);
    try {
      const result = await syncCompetitionRecords(pendingScores, pendingFaults, settings);
      await Promise.all(pendingScores.filter(item => result.syncedScoreIds.includes(item.id)).map(item => onSaveScore({ ...item, syncStatus: 'synced' })));
      await Promise.all(pendingFaults.filter(item => result.syncedFaultIds.includes(item.id)).map(item => onSaveFault({ ...item, syncStatus: 'synced' })));
      if (result.settings) onChangeSettings(mergeIncomingTransferSettings(settings, result.settings));
      markDone('sync-online');
      setNotice(L(`同步完成：${result.syncedScoreIds.length + result.syncedFaultIds.length} 笔记录。`, `Sync complete: ${result.syncedScoreIds.length + result.syncedFaultIds.length} records.`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('同步失败，数据仍安全保存在本机。', 'Sync failed. Data remains safely stored on this device.'));
    } finally {
      setBusyAction('');
      setSyncing(false);
    }
  };

  const savedControlContextValue = useMemo(() => ({
    savedFields,
    savedLabel: L('已保存', 'Saved')
  }), [savedFields, textMode]);

  if (!unlocked) {
    return (
      <section className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">{B('管理员安全入口', 'Secure administrator access')}</div>
          <h1>{authMode === 'register' ? B('注册本机管理员', 'Register local administrator') : B('管理员登录', 'Administrator login')}</h1>
          <p>{B('管理员账号只保存在此设备，密码使用加盐摘要保存。最多两个账号。', 'Administrator accounts are stored on this device with salted password hashes. Maximum two accounts.')}</p>
          <form onSubmit={authenticate} className="form-stack">
            <label>{B('管理员姓名', 'Administrator name')}<input value={adminName} onChange={event => setAdminName(event.target.value)} autoComplete="username" /></label>
            <label>{B('密码', 'Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} /></label>
            {authError && <div className="error-message">{authError}</div>}
            <button className={`primary-button ${actionClass('auth')}`} type="submit" disabled={busyAction === 'auth'} aria-busy={busyAction === 'auth'}>
              {busyAction === 'auth' ? B('处理中', 'Working') : authMode === 'register' ? B('注册并进入', 'Register and enter') : B('登录', 'Log in')}
            </button>
          </form>
          <div className="auth-actions">
            {admins.length > 0 && <button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? B(`注册另一位管理员（${admins.length}/2）`, `Register another administrator (${admins.length}/2)`) : B('返回登录', 'Back to login')}
            </button>}
          </div>
        </div>
      </section>
    );
  }

  const tabs: { id: AdminTab; label: ReactNode; icon: typeof Trophy }[] = [
    { id: 'ranking', label: B('排名', 'Ranking'), icon: Trophy },
    { id: 'people', label: B('人员', 'People'), icon: Users },
    { id: 'sync', label: B('同步', 'Sync'), icon: QrCode },
    { id: 'settings', label: B('设置', 'Settings'), icon: Settings }
  ];
  const textIncludes = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const comparePersonName = (left: { name: string; nameZh?: string; nameEn?: string }, right: { name: string; nameZh?: string; nameEn?: string }) =>
    personName(left).localeCompare(personName(right), undefined, { numeric: true, sensitivity: 'base' });
  const athleteSearchQuery = peopleSearch.trim();
  const visibleAthletes = [...competitionAthletes]
    .filter(item => !athleteSearchQuery || textIncludes(`${item.order} ${item.id} ${item.name} ${item.nameZh ?? ''} ${item.nameEn ?? ''} ${item.country} ${item.school} ${item.teamName ?? ''}`, athleteSearchQuery))
    .sort((a, b) => {
      if (athleteSort === 'name') return comparePersonName(a, b);
      if (athleteSort === 'country') return a.country.localeCompare(b.country, undefined, { numeric: true, sensitivity: 'base' }) || a.order - b.order;
      if (athleteSort === 'school') return a.school.localeCompare(b.school, undefined, { numeric: true, sensitivity: 'base' }) || a.order - b.order;
      return a.order - b.order;
    });
  const judgeSearchQuery = judgeSearch.trim();
  const visibleJudges = [...competitionJudges]
    .filter(item => !judgeSearchQuery || textIncludes(`${item.id} ${item.name} ${item.nameZh ?? ''} ${item.nameEn ?? ''} ${item.role} ${judgeRoleLabel(item.role)}`, judgeSearchQuery))
    .sort((a, b) => {
      if (judgeSort === 'role') return a.role.localeCompare(b.role, undefined, { numeric: true, sensitivity: 'base' }) || comparePersonName(a, b);
      if (judgeSort === 'id') return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
      return comparePersonName(a, b);
    });
  const rankingSearchQuery = rankingSearch.trim();
  const visibleRankings = [...rankings]
    .filter(row => !rankingSearchQuery || textIncludes(`${row.finalRank} ${row.athlete.order} ${row.athlete.id} ${row.athlete.name} ${row.athlete.nameZh ?? ''} ${row.athlete.nameEn ?? ''} ${row.athlete.country} ${row.athlete.school}`, rankingSearchQuery))
    .sort((a, b) => {
      if (rankingSort === 'name') return comparePersonName(a.athlete, b.athlete);
      if (rankingSort === 'points') return b.pairwisePoints - a.pairwisePoints || b.averageScore - a.averageScore || a.athlete.order - b.athlete.order;
      if (rankingSort === 'average') return b.averageScore - a.averageScore || b.pairwisePoints - a.pairwisePoints || a.athlete.order - b.athlete.order;
      if (rankingSort === 'completion') return b.completedJudges - a.completedJudges || a.athlete.order - b.athlete.order;
      if (rankingSort === 'order') return a.athlete.order - b.athlete.order;
      return a.finalRank - b.finalRank || a.athlete.order - b.athlete.order;
    });
  const selectedRanking = selectedRankingAthleteId
    ? rankings.find(row => row.athlete.id === selectedRankingAthleteId)
    : undefined;
  const selectedFault = competition && round && selectedRanking
    ? faults.find(item => item.competitionId === competition.id && item.roundId === round.id && item.athleteId === selectedRanking.athlete.id)
    : undefined;
  const scoreDimensions = competition ? getDimensionsConfig(competition.type) : [];
  const scoreSubmissionFor = (athleteId: string, judgeId: string) => competition && round
    ? scores.find(item => item.competitionId === competition.id && item.roundId === round.id && item.athleteId === athleteId && item.judgeId === judgeId)
    : undefined;
  const selectedRankingJudges = selectedRanking && competition && round
    ? [...new Map([
      ...competitionJudges,
      ...scoringJudges,
      ...scores
        .filter(item => item.competitionId === competition.id && item.roundId === round.id && item.athleteId === selectedRanking.athlete.id)
        .map(submission => judges.find(judge => judge.id === submission.judgeId) ?? {
          id: submission.judgeId,
          name: submission.judgeName,
          nameZh: submission.judgeName,
          nameEn: submission.judgeName,
          role: 'Scoring' as const,
          competitionIds: [competition.id]
        })
    ].map(judge => [judge.id, judge])).values()]
    : [];
  return (
    <SavedControlContext.Provider value={savedControlContextValue}>
    <section className="admin-workspace">
      <div className="section-heading">
        <div><div className="eyebrow">{B('管理员', 'Administrator')}</div><h1>{B('比赛控制台', 'Competition console')}</h1></div>
        <button className="text-button" onClick={onLogout}><LogOut size={16} />{B('登出', 'Logout')}</button>
      </div>

      <div className="control-grid admin-filters admin-filters-compact">
        <label>{B('赛事', 'Event')}<select value={eventId} onChange={event => setEventId(event.target.value)}>
          {events.map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}
        </select></label>
        <label>{B('比赛项目', 'Competition')}<select value={competition?.id ?? ''} onChange={event => {
          setCompetitionId(event.target.value);
          const next = eventCompetitions.find(item => item.id === event.target.value);
          setRoundId(firstRoundId(next));
        }}>{eventCompetitions.map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label>
      </div>

      <nav className="tab-bar" aria-label={L('管理员功能', 'Administrator functions')}>
        {tabs.map(item => {
          const Icon = item.icon;
          return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
        })}
      </nav>

      {notice && exportedFile && notice.includes(exportedFile.fileName) ? (
        <div className="notice download-notice">
          <button className="notice-main" onClick={openExportedFile}>
            {V(notice)}
            <small>{B('点击打开 / 重新下载', 'Tap to open / download again')}</small>
          </button>
          <button className="notice-close" onClick={closeNotice} aria-label={L('关闭提示', 'Close notice')}>×</button>
        </div>
      ) : notice ? (
        <button className="notice" onClick={closeNotice}>{V(notice)}<span>×</span></button>
      ) : null}

      {tab === 'ranking' && (
        <div className="panel-stack">
          <div className="status-card">
            <span>{B('席次法 · 两两多数比较', 'Place method · Pairwise majority')}</span>
            <strong>{rankings.filter(item => item.complete).length}/{rankings.length} {B('人评分完整', 'complete')}</strong>
          </div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>{B('导出成绩表', 'Export Results')}</h2>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className={`secondary-button ${actionClass('export-excel')}`} disabled={busyAction === 'export-excel'} aria-busy={busyAction === 'export-excel'} onClick={() => void exportExcelRanking()}>{busyAction === 'export-excel' ? B('导出中', 'Exporting') : doneAction === 'export-excel' ? B('已导出', 'Exported') : B('导出 Excel', 'Export Excel')}</button>
                <button className={`secondary-button ${actionClass('export-pdf')}`} disabled={busyAction === 'export-pdf'} aria-busy={busyAction === 'export-pdf'} onClick={() => void exportPdfRanking()}>{busyAction === 'export-pdf' ? B('导出中', 'Exporting') : doneAction === 'export-pdf' ? B('已导出', 'Exported') : B('导出 PDF', 'Export PDF')}</button>
              </div>
            </div>
            <div className="list-tools">
              <input type="search" placeholder={L('搜索排名、姓名、国家或学校', 'Search rank, name, country or school')} value={rankingSearch} onChange={event => setRankingSearch(event.target.value)} />
              <select aria-label={L('排名排序', 'Ranking sort')} value={rankingSort} onChange={event => setRankingSort(event.target.value as RankingSortMode)}>
                <option value="rank">{L('按名次', 'Rank')}</option>
                <option value="points">{L('按对赛积分', 'Pairwise points')}</option>
                <option value="average">{L('按平均分', 'Average score')}</option>
                <option value="completion">{L('按完成裁判数', 'Completion')}</option>
                <option value="order">{L('按出场顺序', 'Order')}</option>
                <option value="name">{L('按姓名', 'Name')}</option>
              </select>
            </div>
          </div>
          <div className="ranking-list">
            {visibleRankings.map(row => (
              <button
                type="button"
                className="ranking-card ranking-card-button"
                key={row.athlete.id}
                onClick={() => setSelectedRankingAthleteId(row.athlete.id)}
                aria-label={L(`查看 ${personName(row.athlete)} 的详细分数`, `View detailed scores for ${personName(row.athlete)}`)}
              >
                <span className="rank">{row.complete ? `#${row.finalRank}` : '—'}</span>
                <div className="ranking-name"><strong>{personNameNode(row.athlete)}</strong><small>{row.completedJudges}/{row.requiredJudges} {B('位裁判完成', 'judges completed')}</small></div>
                <div className="ranking-metric"><small>{B('对赛积分', 'Pairwise points')}</small><strong>{row.pairwisePoints.toFixed(1)}</strong></div>
                <div className="ranking-metric"><small>{B('胜/和/负', 'W/T/L')}</small><strong>{row.wins}/{row.ties}/{row.losses}</strong></div>
                <div className="ranking-metric"><small>{B('失误扣分', 'Fault deduction')}</small><strong>-{row.deduction.toFixed(1)}</strong></div>
                <ChevronRight className="ranking-open-icon" size={18} aria-hidden="true" />
              </button>
            ))}
            {!rankings.length && <div className="empty">{B('本回合尚未分配运动员。', 'No athletes are assigned to this round.')}</div>}
            {rankings.length > 0 && !visibleRankings.length && <div className="empty">{B('没有符合搜索的排名记录。', 'No ranking records match this search.')}</div>}
          </div>
        </div>
      )}

      {selectedRanking && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedRankingAthleteId('')}>
          <div className="modal-card ranking-detail-modal" role="dialog" aria-modal="true" aria-label={L('排名详细分数', 'Ranking score details')} onClick={event => event.stopPropagation()}>
            <div className="ranking-detail-header">
              <div>
                <span className="rank">{selectedRanking.complete ? `#${selectedRanking.finalRank}` : '-'}</span>
                <div>
                  <h2>{personNameNode(selectedRanking.athlete)}</h2>
                  <small>#{selectedRanking.athlete.order} · {selectedRanking.athlete.school || selectedRanking.athlete.teamName || selectedRanking.athlete.country || B('未填写单位', 'No organization')}</small>
                </div>
              </div>
              <button className="icon-only-button compact-copy" onClick={() => setSelectedRankingAthleteId('')} aria-label={L('关闭详细分数', 'Close score details')}>
                <X size={18} />
              </button>
            </div>

            <div className="ranking-detail-summary">
              <span><small>{B('最终名次', 'Final rank')}</small><strong>{selectedRanking.complete ? `#${selectedRanking.finalRank}` : '-'}</strong></span>
              <span><small>{B('平均分', 'Average')}</small><strong>{selectedRanking.completedJudges ? selectedRanking.averageScore.toFixed(2) : '-'}</strong></span>
              <span><small>{B('对赛积分', 'Pairwise')}</small><strong>{selectedRanking.pairwisePoints.toFixed(1)}</strong></span>
              <span><small>{B('胜/和/负', 'W/T/L')}</small><strong>{selectedRanking.wins}/{selectedRanking.ties}/{selectedRanking.losses}</strong></span>
              <span><small>{B('失误次数', 'Faults')}</small><strong>{selectedFault?.faultsCount ?? selectedRanking.faultsCount}</strong></span>
              <span><small>{B('扣分', 'Deduction')}</small><strong>-{selectedRanking.deduction.toFixed(1)}</strong></span>
            </div>

            <div className="judge-score-detail-list">
              {selectedRankingJudges.map((judge, judgeIndex) => {
                const submission = scoreSubmissionFor(selectedRanking.athlete.id, judge.id);
                const calculated = selectedRanking.scoresByJudge[judge.id];
                return (
                  <section className="judge-score-detail" key={judge.id}>
                    <div className="judge-score-detail-heading">
                      <span>{B(`裁判${judgeIndex + 1}`, `Judge ${judgeIndex + 1}`)}</span>
                      <strong>{personNameNode(judge)}</strong>
                    </div>
                    {submission && calculated ? (
                      <>
                        <div className="dimension-breakdown">
                          {scoreDimensions.map(dimension => (
                            <span key={dimension.key}>
                              <small><I18nText zh={dimension.label} en={dimension.labelEn} mode={textMode} /></small>
                              <strong>{(submission.dimensions[dimension.key] ?? 0).toFixed(1)}</strong>
                            </span>
                          ))}
                        </div>
                        <div className="score-detail-totals">
                          <span><small>{B('原始总分', 'Raw total')}</small><strong>{submission.totalScore.toFixed(2)}</strong></span>
                          <span><small>{B('扣分后有效分', 'After deduction')}</small><strong>{calculated.score.toFixed(2)}</strong></span>
                          <span><small>{B('该裁判排名', 'Judge rank')}</small><strong>#{calculated.rank.toFixed(calculated.rank % 1 === 0 ? 0 : 1)}</strong></span>
                        </div>
                      </>
                    ) : (
                      <div className="empty compact-empty">{B('这位裁判还没有提交分数。', 'This judge has not submitted a score yet.')}</div>
                    )}
                  </section>
                );
              })}
              {!selectedRankingJudges.length && (
                <div className="empty compact-empty">{B('这个运动员还没有任何裁判评分记录。', 'This athlete has no judge score records yet.')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div className="two-column">
          <div className="card">
            <div className="card-heading"><div><h2>{B('运动员', 'Athletes')}</h2><p>{competitionAthletes.length} {B('人', 'people')}</p></div></div>
            <div className="list-tools">
              <input type="search" placeholder={L('搜索编号、姓名、国家、学校或队伍', 'Search number, name, country, school or team')} value={peopleSearch} onChange={event => setPeopleSearch(event.target.value)} />
              <select aria-label={L('运动员排序', 'Athlete sort')} value={athleteSort} onChange={event => setAthleteSort(event.target.value as AthleteSortMode)}>
                <option value="order">{L('按出场顺序', 'Order')}</option>
                <option value="name">{L('按姓名', 'Name')}</option>
                <option value="country">{L('按国家', 'Country')}</option>
                <option value="school">{L('按学校', 'School')}</option>
              </select>
            </div>
            <div className="bilingual-form athlete-form compact-entry-form">
              <FloatingField label={B('出场顺序', 'Order')}><input type="number" min="1" aria-label={L('出场顺序', 'Order')} placeholder={L('出场顺序', 'Order')} value={newAthleteOrder} onChange={event => setNewAthleteOrder(event.target.value)} /></FloatingField>
              <FloatingField label={personOrTeamNameLabel}><input aria-label={personOrTeamNameLabel} placeholder={personOrTeamNameLabel} value={newAthleteName} onChange={event => setNewAthleteName(event.target.value)} /></FloatingField>
              <FloatingField label={B('所属单位/团队', 'Team / organization')}><input aria-label={L('所属单位/团队', 'Team / organization')} placeholder={L('所属单位/团队', 'Team / organization')} value={newAthleteSchool} onChange={event => setNewAthleteSchool(event.target.value)} /></FloatingField>
              <FloatingField label={B('国家/地区', 'Country / region')}><input aria-label={L('国家/地区', 'Country / region')} placeholder={L('国家/地区', 'Country / region')} value={newAthleteCountry} onChange={event => setNewAthleteCountry(event.target.value)} /></FloatingField>
              <FloatingField label={B('性别', 'Gender')}><select aria-label={L('性别', 'Gender')} value={newAthleteGender} onChange={event => setNewAthleteGender(event.target.value as Athlete['gender'])}><option value="Male">{athleteGenderLabel('Male')}</option><option value="Female">{athleteGenderLabel('Female')}</option><option value="Co-ed">{athleteGenderLabel('Co-ed')}</option></select></FloatingField>
              <FloatingField label={B('组别', 'Section')}><select aria-label={L('组别', 'Section')} value={newAthleteSection} onChange={event => setNewAthleteSection(event.target.value as AthleteSection)}><option value="Primary">{athleteSectionLabel('Primary')}</option><option value="Secondary">{athleteSectionLabel('Secondary')}</option><option value="Open">{athleteSectionLabel('Open')}</option></select></FloatingField>
              <button className={`secondary-button ${actionClass('add-athlete')}`} onClick={() => void addAthlete()}><Plus size={17} />{doneAction === 'add-athlete' ? B('已添加', 'Added') : B('添加', 'Add')}</button>
            </div>
            {availableAthletes.length > 0 && <div className="assignment-panel">
              <div className="assignment-heading">
                <strong>{B('快捷加入其他比赛选手', 'Quick add athletes')}</strong>
                <small>{B('可多选，加入后默认进入第一回合名单', 'Select multiple; they enter the first round by default')}</small>
              </div>
              <div className="assignment-list">
                {availableAthletes.map(item => {
                  const selected = athletesToAssign.includes(item.id);
                  return (
                    <button key={item.id} type="button" className={selected ? 'selected' : ''} onClick={() => toggleAthleteToAssign(item.id)}>
                      <span>
                        <strong>#{item.order} · {personNameNode(item)}</strong>
                        <small>{B('来自', 'From')}: {athleteSourceLabel(item)}</small>
                      </span>
                      {selected && <Check size={17} />}
                    </button>
                  );
                })}
              </div>
              <button className={`secondary-button ${actionClass('assign-athlete')}`} disabled={!athletesToAssign.length} onClick={() => void assignExistingAthletes()}>{doneAction === 'assign-athlete' ? B('已加入', 'Assigned') : B(`加入 ${athletesToAssign.length || ''} 位`, `Assign ${athletesToAssign.length || ''}`)}</button>
            </div>}
            <div className="compact-list athlete-edit-list">{visibleAthletes
              .map(item => {
                const isEditing = editingAthleteId === item.id;
                return (
                <div key={item.id} className={isEditing ? 'is-editing' : ''}>
                  <span>
                    <strong>#{item.order} · {personNameNode(item)}</strong>
                    <small>#{item.order} · {item.country || L('未填写国家/地区', 'No country/region')} · {item.school || L('未填写单位', 'No organization')}</small>
                    {isEditing && (
                      <div className="athlete-edit-fields">
                        <FloatingField label={B('出场顺序', 'Order')}><SavedControl field={`athlete-${item.id}-order`}><input type="number" min="1" inputMode="numeric" aria-label={L(`编辑 ${item.name} 出场顺序`, `Edit ${item.name} order`)} placeholder={L('出场顺序', 'Order')} value={athleteOrderDrafts[item.id] ?? String(item.order)} onChange={event => setAthleteOrderDrafts(current => ({ ...current, [item.id]: event.target.value }))} onBlur={() => void commitAthleteOrderDraft(item.id)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></SavedControl></FloatingField>
                        <FloatingField label={personOrTeamNameLabel}><SavedControl field={`athlete-${item.id}-zh`}><input aria-label={L(`编辑 ${item.name} 个人名字/团队名字`, `Edit ${item.name} person or team name`)} placeholder={personOrTeamNameLabel} value={item.nameZh ?? item.name} onChange={event => void persistField(`athlete-${item.id}-zh`, () => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, name: event.target.value, nameZh: event.target.value, nameEn: event.target.value } : athlete)))} /></SavedControl></FloatingField>
                        <FloatingField label={B('所属单位/团队', 'Team / organization')}><SavedControl field={`athlete-${item.id}-school`}><input aria-label={L(`编辑 ${item.name} 所属单位`, `Edit ${item.name} organization`)} value={item.school} placeholder={L('所属单位/团队', 'Team / organization')} onChange={event => void persistField(`athlete-${item.id}-school`, () => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, school: event.target.value } : athlete)))} /></SavedControl></FloatingField>
                        <FloatingField label={B('国家/地区', 'Country / region')}><SavedControl field={`athlete-${item.id}-country`}><input aria-label={L(`编辑 ${item.name} 国家或地区`, `Edit ${item.name} country or region`)} value={item.country} placeholder={L('国家/地区', 'Country / region')} onChange={event => void persistField(`athlete-${item.id}-country`, () => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, country: event.target.value } : athlete)))} /></SavedControl></FloatingField>
                        <FloatingField label={B('性别', 'Gender')}><SavedControl field={`athlete-${item.id}-gender`}><select aria-label={L(`编辑 ${item.name} 性别`, `Edit ${item.name} gender`)} value={item.gender} onChange={event => void persistField(`athlete-${item.id}-gender`, () => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, gender: event.target.value as Athlete['gender'] } : athlete)))}><option value="Male">{athleteGenderLabel('Male')}</option><option value="Female">{athleteGenderLabel('Female')}</option><option value="Co-ed">{athleteGenderLabel('Co-ed')}</option></select></SavedControl></FloatingField>
                        <FloatingField label={B('组别', 'Section')}><SavedControl field={`athlete-${item.id}-section`}><select aria-label={L(`编辑 ${item.name} 组别`, `Edit ${item.name} section`)} value={item.section ?? 'Open'} onChange={event => void persistField(`athlete-${item.id}-section`, () => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, section: event.target.value as AthleteSection } : athlete)))}><option value="Primary">{athleteSectionLabel('Primary')}</option><option value="Secondary">{athleteSectionLabel('Secondary')}</option><option value="Open">{athleteSectionLabel('Open')}</option></select></SavedControl></FloatingField>
                      </div>
                    )}
                  </span>
                  <div className="compact-actions">
                    <button className="text-button compact-copy icon-only-button" aria-label={L(`编辑 ${item.name}`, `Edit ${item.name}`)} title={isEditing ? L('收起编辑', 'Close edit') : L('编辑', 'Edit')} onClick={() => setEditingAthleteId(current => current === item.id ? '' : item.id)}><Pencil size={16} /></button>
                    <button className="text-button compact-copy icon-only-button" aria-label={L(`复制 ${item.name} 选手信息`, `Copy ${item.name} athlete info`)} title={L('复制', 'Copy')} onClick={() => void copyAthleteInfo(item)}><Copy size={16} /></button>
                    <button className={`danger-text icon-only-button ${actionClass(`remove-athlete-${item.id}`)}`} aria-label={L(`移出 ${item.name}`, `Remove ${item.name}`)} title={L('移出', 'Remove')} onClick={() => { void persistField(`remove-athlete-${item.id}`, () => removeAthleteFromCurrentCompetition(item.id)); markDone(`remove-athlete-${item.id}`); }}><Trash2 size={16} /></button>
                  </div>
                </div>
                );
              })}
              {!visibleAthletes.length && <div className="empty">{B('没有符合搜索的运动员。', 'No athletes match this search.')}</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-heading"><div><h2>{B('裁判', 'Judges')}</h2><p>{competitionJudges.length} {B('人', 'people')}</p></div></div>
            <div className="list-tools">
              <input type="search" placeholder={L('搜索裁判姓名、ID 或类型', 'Search judge name, ID or role')} value={judgeSearch} onChange={event => setJudgeSearch(event.target.value)} />
              <select aria-label={L('裁判排序', 'Judge sort')} value={judgeSort} onChange={event => setJudgeSort(event.target.value as JudgeSortMode)}>
                <option value="name">{L('按姓名', 'Name')}</option>
                <option value="role">{L('按类型', 'Role')}</option>
                <option value="id">{L('按 ID', 'ID')}</option>
              </select>
            </div>
            <div className="bilingual-form compact-entry-form judge-entry-form">
              <FloatingField label={personalNameLabel}><input aria-label={personalNameLabel} placeholder={personalNameLabel} value={newJudgeName} onChange={event => setNewJudgeName(event.target.value)} /></FloatingField>
              <FloatingField label={B('裁判类型', 'Judge type')}><select aria-label={L('新裁判类型', 'New judge type')} value={newJudgeRole} onChange={event => setNewJudgeRole(event.target.value as Judge['role'])}><option value="Scoring">{L('评分', 'Scoring')}</option><option value="Technical">{L('技术', 'Technical')}</option></select></FloatingField>
              <button className={`secondary-button ${actionClass('add-judge')}`} onClick={() => void addJudge()}><Plus size={17} />{doneAction === 'add-judge' ? B('已添加', 'Added') : B('添加', 'Add')}</button>
            </div>
            {availableJudges.length > 0 && <div className="assignment-row">
              <select aria-label={L('选择现有裁判', 'Select existing judge')} value={judgeToAssign} onChange={event => setJudgeToAssign(event.target.value)}>
                <option value="">{L('从其他比赛加入现有裁判', 'Add an existing judge')}</option>
                {availableJudges.map(item => <option key={item.id} value={item.id}>{personName(item)}</option>)}
              </select>
              <button className={`secondary-button ${actionClass('assign-judge')}`} disabled={!judgeToAssign} onClick={() => void assignExistingJudge()}>{doneAction === 'assign-judge' ? B('已加入', 'Assigned') : B('加入本比赛', 'Assign')}</button>
            </div>}
            <div className="compact-list">{visibleJudges.map(item => (
              <div key={item.id}>
                <span>
                  <small>{item.id} · {V(judgeRoleLabel(item.role))}</small>
                  <SavedControl field={`judge-${item.id}-zh`}><input aria-label={L(`编辑 ${item.name} 裁判名字`, `Edit ${item.name} judge name`)} value={item.nameZh ?? item.name} onChange={event => void persistField(`judge-${item.id}-zh`, () => onChangeJudges(judges.map(judge => judge.id === item.id ? { ...judge, name: event.target.value, nameZh: event.target.value, nameEn: event.target.value } : judge)))} /></SavedControl>
                </span>
                <button className={`danger-text icon-only-button ${actionClass(`remove-judge-${item.id}`)}`} aria-label={L(`移出 ${item.name}`, `Remove ${item.name}`)} title={L('移出', 'Remove')} onClick={() => { void persistField(`remove-judge-${item.id}`, () => onChangeJudges(judges.map(judge => judge.id === item.id ? { ...judge, competitionIds: judge.competitionIds.filter(id => id !== competition?.id) } : judge))); markDone(`remove-judge-${item.id}`); }}><Trash2 size={16} /></button>
              </div>
            ))}
              {!visibleJudges.length && <div className="empty">{B('没有符合搜索的裁判。', 'No judges match this search.')}</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="panel-stack">
          <div className="card">
            <h2>{B('整库 QR 同步', 'Full database QR sync')}</h2>
            <p>{B('请用右上角两个按钮：导出 QR 给另一台设备扫描；导入 QR 接收另一台设备的数据。', 'Use the two top-right buttons: Export QR for another device to scan; Import QR to receive another device data.')}</p>
            <div className="sync-count"><strong>{databaseSnapshot.scores.length + databaseSnapshot.faults.length}</strong><span>{B('笔成绩/失误记录已保存在数据库', 'score/fault records saved in database')}</span></div>
          </div>
          <div className="card">
            <h2>{B('本机同步身份', 'This device identity')}</h2>
            <p>{B('这些资料会写入导出的 QR，让其他设备知道数据从哪台手机、哪位工作人员来。', 'These fields are embedded into exported QR packages so other devices know where the data came from.')}</p>
            <div className="field-pair">
              <label>{B('来源设备名称', 'Source device name')}<SavedControl field="sync-device-name"><input value={syncDeviceName} onChange={event => { onChangeSyncDeviceName(event.target.value); markSavedField('sync-device-name'); }} placeholder={L('例如 Admin Tablet / Judge Phone 1', 'e.g. Admin Tablet / Judge Phone 1')} /></SavedControl></label>
              <label>{B('导出者', 'Exporter')}<SavedControl field="sync-exporter-name"><input value={syncExporterName} onChange={event => { onChangeSyncExporterName(event.target.value); markSavedField('sync-exporter-name'); }} placeholder={L('工作人员姓名，可留空', 'Staff name, optional')} /></SavedControl></label>
            </div>
          </div>
          <div className="card">
            <h2>{B('QR 整合记录', 'QR integration history')}</h2>
            <p>{B('这里显示每一次确认保存后的整合结果，方便现场确认真的新增或接受了哪些资料。', 'Shows every confirmed QR integration so the team can verify what was added or accepted.')}</p>
            {integrationHistory.length > 0 ? (
              <div className="integration-history">
                {integrationHistory.map(entry => (
                  <article className="integration-card" key={entry.id}>
                    <div className="integration-card-heading">
                      <strong>{new Date(entry.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</strong>
                      <small>{B('来源设备', 'Source device')}: {entry.sourceDeviceName || L('未标记', 'Not labeled')}</small>
                      <small>{B('导出者', 'Exporter')}: {entry.exporterName || L('未填写', 'Not set')}</small>
                      {entry.sourceExportedAt && <small>{B('来源', 'Source')}: {new Date(entry.sourceExportedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>}
                    </div>
                    <div className="integration-metrics">
                      <span><strong>{entry.addedCount}</strong>{B('新增', 'New')}</span>
                      <span><strong>{entry.acceptedConflictCount}</strong>{B('接受修改', 'Accepted')}</span>
                      <span><strong>{entry.deleteCount}</strong>{B('删除', 'Deleted')}</span>
                      <span><strong>{entry.localKeptCount}</strong>{B('保留本机', 'Kept local')}</span>
                    </div>
                    {entry.groups.length > 0 && (
                      <div className="integration-group-list">
                        {entry.groups.map(group => (
                          <div key={`${entry.id}-${group.entity}`} className="integration-group">
                            <strong>{group.label}</strong>
                            <small>{B('新增', 'New')} {group.added} · {B('接受', 'Accepted')} {group.accepted} · {B('删除', 'Deleted')} {group.deleted} · {B('保留', 'Kept')} {group.kept}</small>
                            {group.newItems.length > 0 && <ul>{group.newItems.map(item => <li key={item}>{item}</li>)}</ul>}
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.conflicts.length > 0 && (
                      <details className="integration-conflicts">
                        <summary>{B('查看冲突处理', 'View conflict decisions')}</summary>
                        {entry.conflicts.map(conflict => (
                          <div key={`${entry.id}-${conflict.label}`} className="integration-conflict">
                            <strong>{conflict.label}</strong>
                            <small>{conflict.decision === 'incoming' ? B('已接受 QR', 'Accepted QR') : B('保留本机', 'Kept local')}</small>
                            {conflict.differences.map(item => <span key={item}>{item}</span>)}
                          </div>
                        ))}
                      </details>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">{B('还没有确认过 QR 整合。', 'No confirmed QR integrations yet.')}</div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="two-column">
          <div className="card">
            <h2>{B('系统背景自定义', 'System Background Customization')}</h2>
            <p>{B('自定义全系统背景，所有用户同步后将看到相同背景。', 'Customize the system background for all users. All devices will see the same background after sync.')}</p>
            
            <label>{B('背景类型', 'Background Type')}
              <select 
                value={bgType} 
                onChange={event => {
                  const type = event.target.value as 'gradient' | 'image' | 'video';
                  setBgType(type);
                  setBgValue('');
                  setBackgroundFileName('');
                }}
              >
                <option value="gradient">{L('渐变色', 'Gradient')}</option>
                <option value="image">{L('图片', 'Image')}</option>
                <option value="video">{L('视频', 'Video')}</option>
              </select>
            </label>

            {bgType === 'gradient' && (
              <>
                <label>{B('预设渐变', 'Preset Gradients')}
                  <select 
                    value={selectedGradientPreset}
                    onChange={event => {
                      setBgValue(event.target.value);
                    }}
                  >
                    <option value="">{L('选择预设', 'Select Preset')}</option>
                    {BACKGROUND_GRADIENT_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.value}>{L(preset.zh, preset.en)}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {(bgType === 'image' || bgType === 'video') && (
              <>
                <div style={{ margin: '0.8rem 0' }}>
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: 'var(--muted)', 
                    marginBottom: '0.5rem' 
                  }}>
                    {bgType === 'video' ? B('上传视频文件', 'Upload video file') : B('上传图片文件', 'Upload image file')}
                  </div>
                  <input
                    type="file"
                    accept={bgType === 'video' ? 'video/*' : 'image/*'}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      
                      const type = bgType;
                      const maxSize = type === 'video' ? 25 * 1024 * 1024 : 12 * 1024 * 1024;
                      if (file.size > maxSize) {
                        setNotice(type === 'video'
                          ? L('视频文件过大，请选择小于25MB的文件', 'Video file too large, please select a file smaller than 25MB')
                          : L('图片文件过大，请选择小于12MB的文件', 'Image file too large, please select a file smaller than 12MB'));
                        setBgValue('');
                        setBackgroundFileName('');
                        event.currentTarget.value = '';
                        return;
                      }
                      
                      setBackgroundLoading(true);
                      setBgValue('');
                      setBackgroundFileName(file.name);
                      try {
                        const value = type === 'image'
                          ? await compressImageBackground(file)
                          : await readFileAsDataUrl(file);
                        setBgValue(value);
                        setNotice(type === 'video' ? L('视频已加载', 'Video loaded') : L('图片已加载', 'Image loaded'));
                      } catch {
                        setBgValue('');
                        setBackgroundFileName('');
                        setNotice(type === 'video' ? L('视频加载失败', 'Failed to load video') : L('图片加载失败', 'Failed to load image'));
                      } finally {
                        setBackgroundLoading(false);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.8rem',
                      border: '1px solid var(--line)',
                      borderRadius: '12px',
                      background: '#111113',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  />
                  <small style={{ 
                    display: 'block', 
                    marginTop: '0.3rem', 
                    color: 'var(--muted)' 
                  }}>
                    {bgType === 'video'
                      ? B('支持 MP4, WebM, MOV 等视频格式，最大 25MB', 'Supports MP4, WebM, MOV and other video formats, max 25MB')
                      : B('支持 JPG, PNG, WebP 格式，最大 12MB，会自动压缩保存', 'Supports JPG, PNG, WebP formats, max 12MB. Images are compressed automatically')}
                  </small>
                  {backgroundFileName && (
                    <small style={{
                      display: 'block',
                      marginTop: '0.35rem',
                      color: bgValue ? '#a9f3c4' : 'var(--muted)'
                    }}>
                      {backgroundLoading
                        ? L(`正在读取 ${backgroundFileName}`, `Loading ${backgroundFileName}`)
                        : bgValue
                          ? L(`已准备 ${backgroundFileName}`, `Ready: ${backgroundFileName}`)
                          : L(`未载入 ${backgroundFileName}`, `Not loaded: ${backgroundFileName}`)}
                    </small>
                  )}
                </div>
              </>
            )}

            <label>{B('透明度', 'Opacity')}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgOpacity}
                  onChange={event => setBgOpacity(Number(event.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: '50px', textAlign: 'right' }}>{Math.round(bgOpacity)}%</span>
              </div>
            </label>

            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
              <button 
                className={`secondary-button ${actionClass('preview-background')}`}
                onClick={() => {
                  if (backgroundLoading) {
                    setNotice(L('背景文件还在读取，请稍等。', 'Background file is still loading. Please wait.'));
                    return;
                  }
                  if (!bgValue.trim()) {
                    setNotice(L('请输入背景值', 'Please enter background value'));
                    return;
                  }
                  setBgPreview({
                    type: bgType,
                    value: bgValue,
                    opacity: bgOpacity,
                    appliedAt: new Date().toISOString()
                  });
                  setShowBgPreview(true);
                  markDone('preview-background');
                }}
                style={{ flex: 1 }}
                disabled={backgroundLoading}
              >
                {doneAction === 'preview-background' ? B('已打开', 'Opened') : B('预览', 'Preview')}
              </button>
              <button 
                className={`primary-button ${actionClass('apply-background')}`}
                onClick={() => void runBusyAction('apply-background', async () => {
                  if (backgroundLoading) {
                    setNotice(L('背景文件还在读取，请稍等。', 'Background file is still loading. Please wait.'));
                    return false;
                  }
                  if (!bgValue.trim()) {
                    setNotice(L('请输入背景值', 'Please enter background value'));
                    return false;
                  }
                  const newBg: BackgroundConfig = {
                    type: bgType,
                    value: bgValue,
                    opacity: bgOpacity,
                    appliedAt: new Date().toISOString(),
                    name: bgType === 'gradient' ? L('自定义渐变', 'Custom Gradient') : (backgroundFileName || bgValue.substring(0, 30))
                  };
                  
                  // Add to history
                  const history = settings.backgroundHistory || [];
                  const updatedHistory = [newBg, ...history.filter(h => h.value !== newBg.value || h.type !== newBg.type)].slice(0, 10);
                  
                  await onChangeSettings({ 
                    ...settings, 
                    customBackground: newBg,
                    backgroundHistory: updatedHistory
                  });
                  setNotice(L('背景已应用', 'Background applied'));
                })}
                style={{ flex: 1 }}
                disabled={busyAction === 'apply-background' || backgroundLoading}
                aria-busy={busyAction === 'apply-background'}
              >
                {busyAction === 'apply-background' ? B('应用中', 'Applying') : doneAction === 'apply-background' ? B('已应用', 'Applied') : B('应用背景', 'Apply Background')}
              </button>
            </div>

            {settings.customBackground && (
              <button 
                className={`secondary-button ${actionClass('reset-background')}`}
                onClick={() => {
                  const { customBackground, ...rest } = settings;
                  void persistField('reset-background', () => onChangeSettings(rest));
                  setBgValue('');
                  setBgOpacity(100);
                  setBackgroundFileName('');
                  setBackgroundLoading(false);
                  markDone('reset-background');
                  setNotice(L('已恢复默认背景', 'Reset to default'));
                }}
                style={{ marginTop: '0.5rem', width: '100%' }}
              >
                {doneAction === 'reset-background' ? B('已恢复', 'Reset') : B('恢复默认背景', 'Reset to Default')}
              </button>
            )}

            {/* Current Background Info */}
            {settings.customBackground && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.8rem', 
                border: '1px solid var(--line)', 
                borderRadius: '12px',
                background: 'var(--panel-soft)'
              }}>
                <small style={{ display: 'block', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                  {B('当前背景', 'Current Background')}
                </small>
                <div style={{ fontSize: '0.85rem' }}>
                  <div>{B('类型', 'Type')}: {settings.customBackground.type}</div>
                  <div>{B('透明度', 'Opacity')}: {Math.round(settings.customBackground.opacity ?? 100)}%</div>
                  <div style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    maxWidth: '100%'
                  }}>
                    {B('值', 'Value')}: {settings.customBackground.value.substring(0, 50)}...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Background History */}
          <div className="card">
            <h2>{B('背景历史记录', 'Background History')}</h2>
            <p>{B('点击选择之前使用过的背景', 'Click to reuse previous backgrounds')}</p>
            
            {settings.backgroundHistory && settings.backgroundHistory.length > 0 ? (
              <div style={{ display: 'grid', gap: '.5rem', marginTop: '1rem' }}>
                {settings.backgroundHistory.map((bg, index) => (
                  <div
                    key={index}
                    className="list-button"
                    style={{ 
                      padding: '0.8rem',
                      background: settings.customBackground?.value === bg.value && settings.customBackground?.type === bg.type
                        ? 'var(--panel-soft)' 
                        : 'var(--panel)',
                      border: settings.customBackground?.value === bg.value && settings.customBackground?.type === bg.type
                        ? '1px solid var(--accent)'
                        : '1px solid var(--line)'
                    }}
                  >
                    <button
                      type="button"
                      className={`history-background-select ${actionClass(`pick-bg-${index}`)}`}
                      onClick={() => {
                        setBgType(bg.type);
                        setBgValue(bg.value);
                        setBgOpacity(bg.opacity ?? 100);
                        markDone(`pick-bg-${index}`);
                      }}
                      aria-label={L(`选择背景 ${index + 1}`, `Select background ${index + 1}`)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="tag">{bg.type}</span>
                        <small>{Math.round(bg.opacity ?? 100)}%</small>
                        {settings.customBackground?.value === bg.value && settings.customBackground?.type === bg.type && (
                          <Check size={16} style={{ color: 'var(--accent)' }} />
                        )}
                      </div>
                      <small style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '100%'
                      }}>
                        {bg.value.substring(0, 60)}...
                      </small>
                      <small style={{ color: 'var(--muted)' }}>
                        {new Date(bg.appliedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </small>
                    </button>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        className={`text-button ${actionClass(`preview-history-bg-${index}`)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBgPreview(bg);
                          setShowBgPreview(true);
                          markDone(`preview-history-bg-${index}`);
                        }}
                        style={{ padding: '0.3rem 0.5rem' }}
                      >
                        {doneAction === `preview-history-bg-${index}` ? B('已打开', 'Opened') : B('预览', 'Preview')}
                      </button>
                      <button
                        className={`text-button ${actionClass(`apply-history-bg-${index}`)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void persistField(`apply-history-bg-${index}`, () => onChangeSettings({ 
                            ...settings, 
                            customBackground: bg
                          }));
                          markDone(`apply-history-bg-${index}`);
                          setNotice(L('背景已应用', 'Background applied'));
                        }}
                        style={{ padding: '0.3rem 0.5rem' }}
                      >
                        {doneAction === `apply-history-bg-${index}` ? B('已应用', 'Applied') : B('应用', 'Apply')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ marginTop: '1rem' }}>
                {B('暂无历史记录', 'No history yet')}
              </div>
            )}

            {settings.backgroundHistory && settings.backgroundHistory.length > 0 && (
              <button
                className={`secondary-button ${actionClass('clear-history')}`}
                onClick={() => {
                  void persistField('clear-history', () => onChangeSettings({ ...settings, backgroundHistory: [] }));
                  markDone('clear-history');
                  setNotice(L('历史记录已清空', 'History cleared'));
                }}
                style={{ marginTop: '0.8rem', width: '100%' }}
              >
                {doneAction === 'clear-history' ? B('已清空', 'Cleared') : B('清空历史记录', 'Clear History')}
              </button>
            )}
          </div>
          <div className="card">
            <h2>{B('首页当前赛事', 'Current event on home screen')}</h2>
            <p>{B('主页显示赛事名称；个人赛、团体赛等属于赛事下面的比赛项目。其他设备联网同步后会采用同一设置。', 'The home screen shows the event name. Individual and team stages are competitions within that event. Other devices receive the same setting after sync.')}</p>
            <label>{B('当前赛事', 'Current event')}<SavedControl field="settings-active-event"><select value={settings.activeEventId} onChange={event => void persistField('settings-active-event', () => onChangeSettings({ ...settings, activeEventId: event.target.value }))}>
              {events.map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}
            </select></SavedControl></label>
          </div>
          {competition && <div className="card">
            <h2>{B('技术失误规则', 'Technical fault rule')}</h2><p>{B('不同赛事规则可能采用 0.3 或 0.5，请赛前确认。', 'Different rules may use 0.3 or 0.5. Confirm before the event.')}</p>
            <label>{B('每次失误扣分', 'Deduction per fault')}<SavedControl field={`competition-${competition.id}-fault`}><input type="number" min="0" step="0.1" value={competition.faultDeduction} onChange={event => void updateCompetition({ ...competition, faultDeduction: Math.max(0, Number(event.target.value) || 0) }, `competition-${competition.id}-fault`)} /></SavedControl></label>
          </div>}
          {competition && <div className="card">
            <h2>{B('比赛人员信息', 'Competition Personnel')}</h2>
            <p>{B('这些信息会出现在导出的成绩表上', 'This information appears on exported results')}</p>
            <div className="field-pair">
              <label>{B('裁判长', 'Chief Judge')}<SavedControl field={`competition-${competition.id}-chief`}><input value={competition.chiefJudge || ''} onChange={event => void updateCompetition({ ...competition, chiefJudge: event.target.value }, `competition-${competition.id}-chief`)} placeholder={L('裁判长姓名', 'Chief judge name')} /></SavedControl></label>
              <label>{B('记录员', 'Recorder')}<SavedControl field={`competition-${competition.id}-recorder`}><input value={competition.recorder || ''} onChange={event => void updateCompetition({ ...competition, recorder: event.target.value }, `competition-${competition.id}-recorder`)} placeholder={L('记录员姓名', 'Recorder name')} /></SavedControl></label>
            </div>
          </div>}
          <div className="card">
            <h2>{B('赛事主题', 'Event theme')}</h2>
            {events.map((event, index) => (
              <div className="settings-item-card" key={event.id}>
                <div className="settings-item-header">
                  <div className="settings-item-title"><span className="tag">#{index + 1}</span><strong>{displayName(event)}</strong></div>
                  <button
                    type="button"
                    className={`danger-text icon-only-button ${actionClass(`remove-event-${event.id}`)}`}
                    aria-label={L(`删除赛事 ${displayName(event)}`, `Delete event ${displayName(event)}`)}
                    title={L('删除赛事', 'Delete event')}
                    onClick={() => void removeEvent(event)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="field-pair">
                  <label>{chineseNameLabel}<SavedControl field={`event-${event.id}-zh`}><input value={event.nameZh ?? event.name} onChange={change => void persistField(`event-${event.id}-zh`, () => onChangeEvents(events.map(item => item.id === event.id ? { ...item, name: change.target.value, nameZh: change.target.value } : item)))} /></SavedControl></label>
                  <label>{englishNameLabel}<SavedControl field={`event-${event.id}-en`}><input value={event.nameEn ?? event.name} onChange={change => { if (!guardEnglishValue(change.target.value)) return; void persistField(`event-${event.id}-en`, () => onChangeEvents(events.map(item => item.id === event.id ? { ...item, nameEn: change.target.value } : item))); }} /></SavedControl></label>
                </div>
              </div>
            ))}
            <div className="bilingual-form compact-entry-form"><FloatingField label={B('新赛事华文名字', 'New event Chinese name')}><input aria-label={L('新赛事华文名字', 'New event Chinese name')} placeholder={L('新赛事华文名字', 'New event Chinese name')} value={newEventName} onChange={event => setNewEventName(event.target.value)} /></FloatingField><FloatingField label={B('新赛事英文名字', 'New event English name')}><input aria-label={L('新赛事英文名字', 'New event English name')} placeholder={L('新赛事英文名字', 'New event English name')} value={newEventNameEn} onChange={event => updateEnglishDraft(event.target.value, setNewEventNameEn)} /></FloatingField><button className={`secondary-button ${actionClass('add-event')}`} onClick={() => void addEvent()}><Plus size={17} />{doneAction === 'add-event' ? B('已新增', 'Added') : B('新增赛事', 'Add event')}</button></div>
          </div>
          <div className="card">
            <h2>{B('比赛项目', 'Competition')}</h2>
            {eventCompetitions.map((comp, index) => {
              const isExpanded = Boolean(expandedCompetitionIds[comp.id]);
              return (
              <div key={comp.id} className={`competition-settings-item ${isExpanded ? 'is-expanded' : ''}`}>
                <div className="settings-item-header">
                  <button
                    type="button"
                    className="settings-item-title competition-accordion-trigger"
                    onClick={() => setExpandedCompetitionIds(current => ({ ...current, [comp.id]: !current[comp.id] }))}
                    aria-expanded={isExpanded}
                  >
                    <span className="tag">#{index + 1}</span>
                    <strong>{displayName(comp)}</strong>
                    <small>{competitionStatusLabel(comp.status)}</small>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`danger-text icon-only-button ${actionClass(`remove-competition-${comp.id}`)}`}
                    aria-label={L(`删除比赛项目 ${displayName(comp)}`, `Delete competition ${displayName(comp)}`)}
                    title={L('删除比赛项目', 'Delete competition')}
                    onClick={() => void removeCompetition(comp)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="field-pair">
                  <label>{chineseNameLabel}<SavedControl field={`competition-${comp.id}-zh`}><input value={comp.nameZh ?? comp.name} onChange={event => void persistField(`competition-${comp.id}-zh`, () => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, name: event.target.value, nameZh: event.target.value } : item)))} /></SavedControl></label>
                  <label>{englishNameLabel}<SavedControl field={`competition-${comp.id}-en`}><input value={comp.nameEn ?? comp.name} onChange={event => { if (!guardEnglishValue(event.target.value)) return; void persistField(`competition-${comp.id}-en`, () => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, nameEn: event.target.value } : item))); }} /></SavedControl></label>
                </div>
                <div className="field-pair">
                  <label>{B('比赛状态', 'Competition status')}<SavedControl field={`competition-${comp.id}-status`}><select value={comp.status} onChange={event => void changeCompetitionStatus(comp.id, event.target.value as Competition['status'])}>
                    <option value="Draft">{competitionStatusLabel('Draft')}</option>
                    <option value="Active">{competitionStatusLabel('Active')}</option>
                    <option value="Completed">{competitionStatusLabel('Completed')}</option>
                  </select></SavedControl></label>
                  <label>{B('比赛类型', 'Competition type')}<SavedControl field={`competition-${comp.id}-type`}><select value={comp.type} onChange={event => void persistField(`competition-${comp.id}-type`, () => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, type: event.target.value as Competition['type'] } : item)))}>
                    <option value="Individual Stage">{L('个人舞台赛', 'Individual Stage')}</option>
                    <option value="Duo/Team Stage">{L('双人/团体舞台赛', 'Duo/Team Stage')}</option>
                    <option value="Challenge">{L('挑战赛', 'Challenge')}</option>
                  </select></SavedControl></label>
                </div>
              </div>
              );
            })}
            {!eventCompetitions.length && <p>{B('此赛事还没有比赛项目，请在下方建立第一个比赛。', 'This event has no competition yet. Create the first competition below.')}</p>}
            <div className="bilingual-form compact-entry-form"><FloatingField label={B('新比赛华文名字', 'New competition Chinese name')}><input aria-label={L('新比赛华文名字', 'New competition Chinese name')} placeholder={L('新比赛华文名字', 'New competition Chinese name')} value={newCompetitionName} onChange={event => setNewCompetitionName(event.target.value)} /></FloatingField><FloatingField label={B('新比赛英文名字', 'New competition English name')}><input aria-label={L('新比赛英文名字', 'New competition English name')} placeholder={L('新比赛英文名字', 'New competition English name')} value={newCompetitionNameEn} onChange={event => updateEnglishDraft(event.target.value, setNewCompetitionNameEn)} /></FloatingField><button className={`secondary-button ${actionClass('add-competition')}`} onClick={() => void addCompetition()}><Plus size={17} />{doneAction === 'add-competition' ? B('已新增', 'Added') : B('新增比赛', 'Add competition')}</button></div>
          </div>
        </div>
      )}
      
      {/* Background Preview Modal */}
      {showBgPreview && bgPreview && (
        <BackgroundPreviewModal
          preview={bgPreview}
          onClose={() => setShowBgPreview(false)}
          onConfirm={() => {
            const updatedHistory = [
              bgPreview, 
              ...(settings.backgroundHistory || []).filter(h => h.value !== bgPreview.value || h.type !== bgPreview.type)
            ].slice(0, 10);
            
            void onChangeSettings({ 
              ...settings, 
              customBackground: bgPreview,
              backgroundHistory: updatedHistory
            });
            setBgType(bgPreview.type);
            setBgValue(bgPreview.value);
            setBgOpacity(bgPreview.opacity ?? 100);
            setNotice(L('背景已应用', 'Background applied'));
          }}
          language={language}
          textMode={textMode}
        />
      )}
    </section>
    </SavedControlContext.Provider>
  );
}

// Background Preview Modal Component (helper)
function BackgroundPreviewModal({ 
  preview, 
  onClose, 
  onConfirm, 
  language,
  textMode 
}: { 
  preview: BackgroundConfig; 
  onClose: () => void; 
  onConfirm: () => void; 
  language: Language; 
  textMode: TextMode;
}) {
  const B = (zh: string, en: string) => <I18nText zh={zh} en={en} mode={textMode} />;
  const opacity = (preview.opacity ?? 100) / 100;
  
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card background-preview-card" onClick={e => e.stopPropagation()}>
        <h2>{B('背景预览', 'Background Preview')}</h2>
        <p style={{ marginBottom: '1rem' }}>
          {B('查看新背景效果，确认后应用。', 'Review the new background and confirm to apply.')}
        </p>
        
        {/* Preview Area */}
        <div className="background-preview-stage">
          {preview.type === 'video' ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity
              }}
            >
              <source src={preview.value} />
            </video>
          ) : (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: preview.type === 'gradient' 
                ? preview.value 
                : `url(${preview.value}) center/cover no-repeat`,
              opacity
            }} />
          )}
          
          {/* Sample Content Overlay */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 1
          }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              MDiabolo
            </h1>
            <p style={{ fontSize: '1rem', color: '#f0f0f0' }}>
              {B('离线计分系统', 'Offline Scoring System')}
            </p>
          </div>
        </div>
        
        {/* Info */}
        <div style={{ 
          padding: '0.8rem', 
          background: 'var(--panel-soft)', 
          borderRadius: '10px',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
            <div><strong>{B('类型', 'Type')}:</strong> {preview.type}</div>
            <div><strong>{B('透明度', 'Opacity')}:</strong> {Math.round(preview.opacity ?? 100)}%</div>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            <strong>{B('值', 'Value')}:</strong> {preview.value.substring(0, 80)}{preview.value.length > 80 ? '...' : ''}
          </div>
        </div>
        
        {/* Actions */}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} style={{ flex: 1 }}>
            {B('取消', 'Cancel')}
          </button>
          <button className="primary-button" onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1 }}>
            {B('确认应用', 'Confirm & Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

