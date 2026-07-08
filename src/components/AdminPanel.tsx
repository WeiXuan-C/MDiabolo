import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CloudUpload,
  GitBranch,
  Plus,
  QrCode,
  Settings,
  Trophy,
  Users
} from 'lucide-react';
import {
  type AdminAccount,
  type AppSettings,
  type Athlete,
  type BackgroundConfig,
  type Competition,
  type EventConfig,
  type FaultSubmission,
  type Judge,
  type Language,
  type ScoreSubmission,
  localizedName
} from '../initialData';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { createAdminAccount, verifyAdminPassword } from '../utils/auth';
import { calculatePlaceMethodRankings } from '../utils/ranking';
import { createId } from '../utils/storage';
import { syncCompetitionRecords } from '../utils/sync';
import { decodeQrRecord, type DatabaseSnapshot } from '../utils/qr';
import { exportRankingToExcel, exportRankingToPDF } from '../utils/export';

type AdminTab = 'rounds' | 'bracket' | 'ranking' | 'people' | 'sync' | 'settings';

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
  onChangeAthletes: (value: Athlete[]) => void;
  onChangeCompetitions: (value: Competition[]) => void;
  onChangeJudges: (value: Judge[]) => void;
  onChangeEvents: (value: EventConfig[]) => void;
  onChangeAdmins: (value: AdminAccount[]) => void;
  onChangeSettings: (value: AppSettings) => void;
  onSaveScore: (value: ScoreSubmission) => void;
  onSaveFault: (value: FaultSubmission) => void;
  databaseSnapshot: DatabaseSnapshot;
  onApplyDatabaseSnapshot: (value: DatabaseSnapshot) => void;
  onLogout: () => void;
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
    onApplyDatabaseSnapshot,
    onLogout
  } = props;
  const L = (zh: string, en: string) => `${zh} · ${en}`;
  const chineseNameLabel = L('华文名字', 'Chinese name');
  const englishNameLabel = L('英文名字', 'English name');
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
  const [tab, setTab] = useState<AdminTab>('rounds');
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
  const [newAthleteName, setNewAthleteName] = useState('');
  const [newAthleteNameEn, setNewAthleteNameEn] = useState('');
  const [newRoundName, setNewRoundName] = useState('');
  const [newRoundNameEn, setNewRoundNameEn] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [databaseText, setDatabaseText] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [newJudgeName, setNewJudgeName] = useState('');
  const [newJudgeNameEn, setNewJudgeNameEn] = useState('');
  const [newJudgeRole, setNewJudgeRole] = useState<Judge['role']>('Scoring');
  const [newCompetitionName, setNewCompetitionName] = useState('');
  const [newCompetitionNameEn, setNewCompetitionNameEn] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventNameEn, setNewEventNameEn] = useState('');
  const [athleteToAssign, setAthleteToAssign] = useState('');
  const [judgeToAssign, setJudgeToAssign] = useState('');
  
  // Background customization states
  const [bgPreview, setBgPreview] = useState<BackgroundConfig | null>(null);
  const [bgType, setBgType] = useState<'gradient' | 'image' | 'video'>('gradient');
  const [bgValue, setBgValue] = useState('');
  const [bgOpacity, setBgOpacity] = useState(100); // Changed to 0-100 scale
  const [showBgPreview, setShowBgPreview] = useState(false);
  const competitionAthletes = athletes.filter(item => item.competitionIds.includes(competition?.id ?? ''));
  const competitionJudges = judges.filter(item => item.competitionIds.includes(competition?.id ?? ''));
  const availableAthletes = athletes.filter(item => !item.competitionIds.includes(competition?.id ?? ''));
  const availableJudges = judges.filter(item => !item.competitionIds.includes(competition?.id ?? ''));

  useEffect(() => {
    if (!eventCompetitions.some(item => item.id === competitionId)) {
      const first = eventCompetitions[0];
      setCompetitionId(first?.id ?? '');
      setRoundId(first?.rounds[0]?.id ?? '');
    }
  }, [competitionId, eventCompetitions]);

  const localCount = useMemo(
    () => scores.filter(item => item.syncStatus !== 'synced').length + faults.filter(item => item.syncStatus !== 'synced').length,
    [faults, scores]
  );

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError('');
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
  };

  const updateCompetition = (next: Competition) => {
    onChangeCompetitions(competitions.map(item => item.id === next.id ? next : item));
  };

  const addRound = () => {
    if (!competition || !newRoundName.trim() || !newRoundNameEn.trim()) {
      setNotice(L('请同时填写回合的华文和英文名字。', 'Enter both Chinese and English round names.'));
      return;
    }
    updateCompetition({
      ...competition,
      rounds: [...competition.rounds, {
        id: createId('R'),
        name: newRoundName.trim(),
        nameZh: newRoundName.trim(),
        nameEn: newRoundNameEn.trim() || newRoundName.trim(),
        sequence: competition.rounds.length + 1,
        status: 'Draft',
        athleteIds: [],
        advancingCount: null
      }]
    });
    setNewRoundName('');
    setNewRoundNameEn('');
  };

  const toggleEntrant = (athleteId: string) => {
    if (!competition || !round) return;
    const athleteIds = round.athleteIds.includes(athleteId)
      ? round.athleteIds.filter(id => id !== athleteId)
      : [...round.athleteIds, athleteId];
    updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => item.id === round.id ? { ...item, athleteIds } : item)
    });
  };

  const advanceTop = () => {
    if (!competition || !round) return;
    const nextRound = [...competition.rounds]
      .sort((a, b) => a.sequence - b.sequence)
      .find(item => item.sequence > round.sequence);
    if (!nextRound) {
      setNotice(L('请先建立下一回合。', 'Create the next round first.'));
      return;
    }
    const count = round.advancingCount ?? rankings.length;
    const qualified = rankings.filter(item => item.complete).slice(0, count).map(item => item.athlete.id);
    if (!qualified.length) {
      setNotice(L('所有评分裁判完成评分后才能晋级。', 'All scoring judges must finish before advancing athletes.'));
      return;
    }
    updateCompetition({
      ...competition,
      rounds: competition.rounds.map(item => {
        if (item.id === round.id) return { ...item, status: 'Completed' };
        if (item.id === nextRound.id) return { ...item, status: 'Active', athleteIds: qualified };
        return item;
      })
    });
    setRoundId(nextRound.id);
    setNotice(L(`${qualified.length} 名运动员已晋级 ${localizedName(nextRound, language)}。`, `${qualified.length} athletes advanced to ${localizedName(nextRound, language)}.`));
  };

  const addAthlete = () => {
    if (!newAthleteName.trim() || !newAthleteNameEn.trim()) {
      setNotice(L('请同时填写运动员的华文和英文名字。', 'Enter both Chinese and English athlete names.'));
      return;
    }
    const nextOrder = Math.max(0, ...athletes.map(item => item.order)) + 1;
    onChangeAthletes([...athletes, {
      id: createId('ATH'),
      order: nextOrder,
      name: newAthleteName.trim(),
      nameZh: newAthleteName.trim(),
      nameEn: newAthleteNameEn.trim() || newAthleteName.trim(),
      school: 'Independent',
      age: 16,
      gender: 'Male',
      country: 'Taiwan',
      teamName: null,
      competitionIds: competition ? [competition.id] : []
    }]);
    setNewAthleteName('');
    setNewAthleteNameEn('');
  };

  const addJudge = () => {
    if (!newJudgeName.trim() || !newJudgeNameEn.trim() || !competition) {
      setNotice(L('请同时填写裁判的华文和英文名字。', 'Enter both Chinese and English judge names.'));
      return;
    }
    onChangeJudges([...judges, {
      id: createId('J'),
      name: newJudgeName.trim(),
      nameZh: newJudgeName.trim(),
      nameEn: newJudgeNameEn.trim() || newJudgeName.trim(),
      role: newJudgeRole,
      competitionIds: [competition.id]
    }]);
    setNewJudgeName('');
    setNewJudgeNameEn('');
  };

  const assignExistingAthlete = () => {
    if (!competition || !athleteToAssign) return;
    onChangeAthletes(athletes.map(item => item.id === athleteToAssign
      ? { ...item, competitionIds: [...item.competitionIds, competition.id] }
      : item));
    setAthleteToAssign('');
  };

  const assignExistingJudge = () => {
    if (!competition || !judgeToAssign) return;
    onChangeJudges(judges.map(item => item.id === judgeToAssign
      ? { ...item, competitionIds: [...item.competitionIds, competition.id] }
      : item));
    setJudgeToAssign('');
  };

  const addCompetition = () => {
    if (!newCompetitionName.trim() || !newCompetitionNameEn.trim()) {
      setNotice(L('请同时填写比赛的华文和英文名字。', 'Enter both Chinese and English competition names.'));
      return;
    }
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
    onChangeCompetitions([...competitions, created]);
    setCompetitionId(id);
    setRoundId(created.rounds[0].id);
    setNewCompetitionName('');
    setNewCompetitionNameEn('');
  };

  const addEvent = () => {
    if (!newEventName.trim() || !newEventNameEn.trim()) {
      setNotice(L('请同时填写赛事的华文和英文名字。', 'Enter both Chinese and English event names.'));
      return;
    }
    const id = createId('E');
    onChangeEvents([...events, {
      id,
      name: newEventName.trim(),
      nameZh: newEventName.trim(),
      nameEn: newEventNameEn.trim() || newEventName.trim(),
      poster: '',
      backgroundTheme: 'Ember'
    }]);
    setEventId(id);
    setCompetitionId('');
    setRoundId('');
    setNewEventName('');
    setNewEventNameEn('');
  };

  const importPayload = (payload: string) => {
    try {
      const decoded = decodeQrRecord(payload);
      if (decoded.type === 'SCORE') onSaveScore(decoded.record);
      else onSaveFault(decoded.record);
      setSyncText('');
      setNotice(L('QR 数据导入成功。', 'QR data imported successfully.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('QR 数据导入失败。', 'QR import failed.'));
    }
  };

  const openDatabaseJson = () => {
    setDatabaseText(JSON.stringify(databaseSnapshot, null, 2));
    setNotice(L('数据库 JSON 已载入。修改后点击保存整库 JSON。', 'Database JSON loaded. Edit it, then tap Save database JSON.'));
  };

  const saveDatabaseJson = () => {
    try {
      const parsed = JSON.parse(databaseText) as DatabaseSnapshot;
      if (parsed.protocol !== 'mdiabolo-db-v1' ||
          !Array.isArray(parsed.athletes) ||
          !Array.isArray(parsed.competitions) ||
          !Array.isArray(parsed.judges) ||
          !Array.isArray(parsed.events) ||
          !Array.isArray(parsed.scores) ||
          !Array.isArray(parsed.faults) ||
          !Array.isArray(parsed.admins) ||
          !parsed.settings) {
        throw new Error(L('JSON 格式不完整，不能保存。', 'JSON is incomplete and cannot be saved.'));
      }
      onApplyDatabaseSnapshot(parsed);
      setNotice(L('数据库 JSON 已保存到本机 SQLite/localStorage。', 'Database JSON saved to local SQLite/localStorage.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('数据库 JSON 保存失败。', 'Database JSON save failed.'));
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
      importPayload(value);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('扫码失败。', 'Scanning failed.'));
    }
  };

  const syncOnline = async () => {
    if (!online) {
      setNotice(L('当前离线。数据仍安全保存在本机，联网后再同步。', 'Currently offline. Data remains safely stored on this device and can sync later.'));
      return;
    }
    const pendingScores = scores.filter(item => item.syncStatus !== 'synced');
    const pendingFaults = faults.filter(item => item.syncStatus !== 'synced');
    setSyncing(true);
    try {
      const result = await syncCompetitionRecords(pendingScores, pendingFaults, settings);
      pendingScores.filter(item => result.syncedScoreIds.includes(item.id)).forEach(item => onSaveScore({ ...item, syncStatus: 'synced' }));
      pendingFaults.filter(item => result.syncedFaultIds.includes(item.id)).forEach(item => onSaveFault({ ...item, syncStatus: 'synced' }));
      if (result.settings) onChangeSettings(result.settings);
      setNotice(L(`同步完成：${result.syncedScoreIds.length + result.syncedFaultIds.length} 笔记录。`, `Sync complete: ${result.syncedScoreIds.length + result.syncedFaultIds.length} records.`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('同步失败，数据仍安全保存在本机。', 'Sync failed. Data remains safely stored on this device.'));
    } finally {
      setSyncing(false);
    }
  };

  if (!unlocked) {
    return (
      <section className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">{L('管理员安全入口', 'Secure administrator access')}</div>
          <h1>{authMode === 'register' ? L('注册本机管理员', 'Register local administrator') : L('管理员登录', 'Administrator login')}</h1>
          <p>{L('管理员账号只保存在此设备，密码使用加盐摘要保存。最多两个账号。', 'Administrator accounts are stored on this device with salted password hashes. Maximum two accounts.')}</p>
          <form onSubmit={authenticate} className="form-stack">
            <label>{L('管理员姓名', 'Administrator name')}<input value={adminName} onChange={event => setAdminName(event.target.value)} autoComplete="username" /></label>
            <label>{L('密码', 'Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} /></label>
            {authError && <div className="error-message">{authError}</div>}
            <button className="primary-button" type="submit">{authMode === 'register' ? L('注册并进入', 'Register and enter') : L('登录', 'Log in')}</button>
          </form>
          <div className="auth-actions">
            {admins.length > 0 && <button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? L(`注册另一位管理员（${admins.length}/2）`, `Register another administrator (${admins.length}/2)`) : L('返回登录', 'Back to login')}
            </button>}
            <button className="text-button" onClick={onLogout}>{L('返回身份选择', 'Back to role selection')}</button>
          </div>
        </div>
      </section>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Trophy }[] = [
    { id: 'rounds', label: L('回合', 'Rounds'), icon: ChevronRight },
    { id: 'bracket', label: L('对阵图', 'Bracket'), icon: GitBranch },
    { id: 'ranking', label: L('排名', 'Ranking'), icon: Trophy },
    { id: 'people', label: L('人员', 'People'), icon: Users },
    { id: 'sync', label: L('同步', 'Sync'), icon: QrCode },
    { id: 'settings', label: L('设置', 'Settings'), icon: Settings }
  ];

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div><div className="eyebrow">{L('管理员', 'Administrator')}</div><h1>{L('比赛控制台', 'Competition console')}</h1></div>
        <button className="text-button" onClick={onLogout}><ArrowLeft size={16} />{L('退出', 'Exit')}</button>
      </div>

      <div className="control-grid admin-filters">
        <label>{L('赛事', 'Event')}<select value={eventId} onChange={event => setEventId(event.target.value)}>
          {events.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
        </select></label>
        <label>{L('比赛', 'Competition')}<select value={competition?.id ?? ''} onChange={event => {
          setCompetitionId(event.target.value);
          const next = eventCompetitions.find(item => item.id === event.target.value);
          setRoundId(next?.rounds[0]?.id ?? '');
        }}>{eventCompetitions.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}</select></label>
        <label>{L('回合', 'Round')}<select value={round?.id ?? ''} onChange={event => setRoundId(event.target.value)}>
          {competition && [...competition.rounds].sort((a, b) => a.sequence - b.sequence).map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
        </select></label>
      </div>

      <nav className="tab-bar" aria-label={L('管理员功能', 'Administrator functions')}>
        {tabs.map(item => {
          const Icon = item.icon;
          return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
        })}
      </nav>

      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

      {tab === 'rounds' && competition && round && (
        <div className="panel-stack">
          <div className="round-flow" aria-label={L('比赛回合流程', 'Competition round flow')}>
            {[...competition.rounds].sort((a, b) => a.sequence - b.sequence).map((item, index) => (
              <div className={`round-node ${item.id === round.id ? 'selected' : ''}`} key={item.id}>
                <button onClick={() => setRoundId(item.id)}>
                  <span>{item.sequence}</span><strong>{localizedName(item, language)}</strong><small>{item.athleteIds.length} {L('人', 'athletes')} · {roundStatusLabel(item.status)}</small>
                </button>
                {index < competition.rounds.length - 1 && <ChevronRight aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="card">
            <h2>{L('回合详细设置', 'Round Details')}</h2>
            <div className="field-pair">
              <label>{L('比赛时间', 'Start Time')}<input type="time" value={round.startTime || ''} onChange={event => updateCompetition({
                ...competition,
                rounds: competition.rounds.map(item => item.id === round.id ? { ...item, startTime: event.target.value } : item)
              })} /></label>
              <label>{L('公告时间', 'Announcement Time')}<input type="time" value={round.announcementTime || ''} onChange={event => updateCompetition({
                ...competition,
                rounds: competition.rounds.map(item => item.id === round.id ? { ...item, announcementTime: event.target.value } : item)
              })} /></label>
            </div>
          </div>
          <div className="card">
            <div className="card-heading"><div><h2>{localizedName(round, language)} {L('参赛名单', 'entries')}</h2><p>{L('点选运动员加入或移出本回合。', 'Select athletes to add or remove them from this round.')}</p></div><span className="tag">{round.athleteIds.length} {L('人', 'athletes')}</span></div>
            <div className="check-grid">
              {competitionAthletes.map(athlete => {
                const selected = round.athleteIds.includes(athlete.id);
                return <button key={athlete.id} className={selected ? 'selected' : ''} onClick={() => toggleEntrant(athlete.id)}>
                  <span>{athlete.order}. {localizedName(athlete, language)}</span>{selected && <Check size={17} />}
                </button>;
              })}
            </div>
            <div className="inline-form">
              <label>{L('晋级人数', 'Number advancing')}<input type="number" min="1" value={round.advancingCount ?? ''} onChange={event => updateCompetition({
                ...competition,
                rounds: competition.rounds.map(item => item.id === round.id ? { ...item, advancingCount: Number(event.target.value) || null } : item)
              })} /></label>
              <button className="secondary-button" onClick={advanceTop}>{L('按排名晋级下一轮', 'Advance by ranking')}</button>
            </div>
          </div>
          <div className="card">
            <h2>{L('新增回合', 'Add round')}</h2>
            <div className="bilingual-form"><input placeholder={L('华文回合名字，例如：半决赛', 'Chinese round name')} value={newRoundName} onChange={event => setNewRoundName(event.target.value)} /><input placeholder={L('英文回合名字，例如：Semi-final', 'English round name, e.g. Semi-final')} value={newRoundNameEn} onChange={event => setNewRoundNameEn(event.target.value)} /><button className="secondary-button" onClick={addRound}><Plus size={17} />{L('新增', 'Add')}</button></div>
          </div>
        </div>
      )}

      {tab === 'bracket' && competition && (
        <div className="panel-stack">
          <div className="status-card">
            <span>{localizedName(events.find(item => item.id === competition.eventId), language)}</span>
            <strong>{localizedName(competition, language)}</strong>
          </div>
          <div className="bracket-board" aria-label={L('淘汰赛对阵图', 'Tournament bracket')}>
            {[...competition.rounds].sort((a, b) => a.sequence - b.sequence).map((bracketRound, roundIndex, sortedRounds) => {
              const entrants = bracketRound.athleteIds
                .map(id => athletes.find(item => item.id === id))
                .filter((item): item is Athlete => Boolean(item));
              const matches = Array.from({ length: Math.max(1, Math.ceil(entrants.length / 2)) }, (_, index) => entrants.slice(index * 2, index * 2 + 2));
              return (
                <section className="bracket-column" key={bracketRound.id}>
                  <div className="bracket-round-title">
                    <span>{bracketRound.sequence}</span>
                    <div><strong>{localizedName(bracketRound, language)}</strong><small>{roundStatusLabel(bracketRound.status)}</small></div>
                  </div>
                  <div className="bracket-matches">
                    {matches.map((match, matchIndex) => (
                      <div className="bracket-match" key={`${bracketRound.id}-${matchIndex}`}>
                        {[0, 1].map(slot => {
                          const entrant = match[slot];
                          return (
                            <div className={entrant ? 'filled' : 'empty-slot'} key={slot}>
                              <span>{entrant?.order ?? '—'}</span>
                              <strong>{entrant ? localizedName(entrant, language) : L('待定', 'TBD')}</strong>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {roundIndex < sortedRounds.length - 1 && <ChevronRight className="bracket-arrow" aria-hidden="true" />}
                </section>
              );
            })}
          </div>
          <p className="bracket-help">{L('对阵位置按照本回合参赛名单顺序排列；完成评分后，可在“回合”页面按排名晋级并自动填入下一轮。', 'Match positions follow the round entry order. After scoring, advance athletes by ranking from the Rounds page to populate the next round.')}</p>
        </div>
      )}

      {tab === 'ranking' && (
        <div className="panel-stack">
          <div className="status-card">
            <span>{L('席次法 · 两两多数比较', 'Place method · Pairwise majority')}</span>
            <strong>{rankings.filter(item => item.complete).length}/{rankings.length} {L('人评分完整', 'complete')}</strong>
          </div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>{L('导出成绩表', 'Export Results')}</h2>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="secondary-button" onClick={() => competition && round && exportRankingToExcel(competition, round, rankings, competitionJudges, scores, faults, language)}>{L('导出 Excel', 'Export Excel')}</button>
                <button className="secondary-button" onClick={() => competition && round && exportRankingToPDF(competition, round, rankings, competitionJudges, scores, language)}>{L('导出 PDF', 'Export PDF')}</button>
              </div>
            </div>
          </div>
          <div className="ranking-list">
            {rankings.map(row => (
              <article className="ranking-card" key={row.athlete.id}>
                <span className="rank">{row.complete ? `#${row.finalRank}` : '—'}</span>
                <div className="ranking-name"><strong>{localizedName(row.athlete, language)}</strong><small>{row.completedJudges}/{row.requiredJudges} {L('位裁判完成', 'judges completed')}</small></div>
                <div className="ranking-metric"><small>{L('对赛积分', 'Pairwise points')}</small><strong>{row.pairwisePoints.toFixed(1)}</strong></div>
                <div className="ranking-metric"><small>{L('胜/和/负', 'W/T/L')}</small><strong>{row.wins}/{row.ties}/{row.losses}</strong></div>
                <div className="ranking-metric"><small>{L('失误扣分', 'Fault deduction')}</small><strong>-{row.deduction.toFixed(1)}</strong></div>
              </article>
            ))}
            {!rankings.length && <div className="empty">{L('本回合尚未分配运动员。', 'No athletes are assigned to this round.')}</div>}
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div className="two-column">
          <div className="card">
            <div className="card-heading"><div><h2>{L('运动员', 'Athletes')}</h2><p>{competitionAthletes.length} {L('人', 'people')}</p></div></div>
            <input type="search" placeholder={L('搜索运动员或国家', 'Search athlete or country')} value={peopleSearch} onChange={event => setPeopleSearch(event.target.value)} />
            <div className="bilingual-form">
              <input placeholder={chineseNameLabel} value={newAthleteName} onChange={event => setNewAthleteName(event.target.value)} />
              <input placeholder={englishNameLabel} value={newAthleteNameEn} onChange={event => setNewAthleteNameEn(event.target.value)} />
              <button className="secondary-button" onClick={addAthlete}><Plus size={17} />{L('添加', 'Add')}</button>
            </div>
            {availableAthletes.length > 0 && <div className="assignment-row">
              <select aria-label={L('选择现有运动员', 'Select existing athlete')} value={athleteToAssign} onChange={event => setAthleteToAssign(event.target.value)}>
                <option value="">{L('从其他比赛加入现有运动员', 'Add an existing athlete')}</option>
                {availableAthletes.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
              </select>
              <button className="secondary-button" disabled={!athleteToAssign} onClick={assignExistingAthlete}>{L('加入本比赛', 'Assign')}</button>
            </div>}
            <div className="compact-list">{competitionAthletes
              .filter(item => `${item.name} ${item.country} ${item.school}`.toLowerCase().includes(peopleSearch.toLowerCase()))
              .sort((a, b) => a.order - b.order)
              .map(item => <div key={item.id}><span><small>#{item.order} · {item.country}</small><input aria-label={L(`编辑 ${item.name} 华文名字`, `Edit ${item.name} Chinese name`)} value={item.nameZh ?? item.name} onChange={event => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, name: event.target.value, nameZh: event.target.value } : athlete))} /><input aria-label={L(`编辑 ${item.name} 英文名字`, `Edit ${item.name} English name`)} value={item.nameEn ?? item.name} onChange={event => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, nameEn: event.target.value } : athlete))} /></span><button className="danger-text" onClick={() => onChangeAthletes(athletes.map(athlete => athlete.id === item.id ? { ...athlete, competitionIds: athlete.competitionIds.filter(id => id !== competition?.id) } : athlete))}>{L('移出本比赛', 'Remove')}</button></div>)}</div>
          </div>
          <div className="card">
            <div className="card-heading"><div><h2>{L('裁判', 'Judges')}</h2><p>{competitionJudges.length} {L('人', 'people')}</p></div></div>
            <div className="bilingual-form">
              <input placeholder={chineseNameLabel} value={newJudgeName} onChange={event => setNewJudgeName(event.target.value)} />
              <input placeholder={englishNameLabel} value={newJudgeNameEn} onChange={event => setNewJudgeNameEn(event.target.value)} />
              <select aria-label={L('新裁判类型', 'New judge type')} value={newJudgeRole} onChange={event => setNewJudgeRole(event.target.value as Judge['role'])}><option value="Scoring">{L('评分', 'Scoring')}</option><option value="Technical">{L('技术', 'Technical')}</option></select>
              <button className="secondary-button" onClick={addJudge}><Plus size={17} />{L('添加', 'Add')}</button>
            </div>
            {availableJudges.length > 0 && <div className="assignment-row">
              <select aria-label={L('选择现有裁判', 'Select existing judge')} value={judgeToAssign} onChange={event => setJudgeToAssign(event.target.value)}>
                <option value="">{L('从其他比赛加入现有裁判', 'Add an existing judge')}</option>
                {availableJudges.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
              </select>
              <button className="secondary-button" disabled={!judgeToAssign} onClick={assignExistingJudge}>{L('加入本比赛', 'Assign')}</button>
            </div>}
            <div className="compact-list">{competitionJudges.map(item => <div key={item.id}><span><small>{judgeRoleLabel(item.role)}</small><input aria-label={L(`编辑 ${item.name} 华文名字`, `Edit ${item.name} Chinese name`)} value={item.nameZh ?? item.name} onChange={event => onChangeJudges(judges.map(judge => judge.id === item.id ? { ...judge, name: event.target.value, nameZh: event.target.value } : judge))} /><input aria-label={L(`编辑 ${item.name} 英文名字`, `Edit ${item.name} English name`)} value={item.nameEn ?? item.name} onChange={event => onChangeJudges(judges.map(judge => judge.id === item.id ? { ...judge, nameEn: event.target.value } : judge))} /></span><button className="danger-text" onClick={() => onChangeJudges(judges.map(judge => judge.id === item.id ? { ...judge, competitionIds: judge.competitionIds.filter(id => id !== competition?.id) } : judge))}>{L('移出本比赛', 'Remove')}</button></div>)}</div>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="two-column">
          <div className="card">
            <h2>{L('整库 QR 同步', 'Full database QR sync')}</h2>
            <p>{L('同步入口已经移到右上角。导出会生成整套数据库 QR；导入会同步背景、赛事、人员、成绩和失误。', 'Sync now lives in the top-right header. Export creates full database QR pages; import syncs background, events, people, scores and faults.')}</p>
            <div className="sync-count"><strong>{databaseSnapshot.scores.length + databaseSnapshot.faults.length}</strong><span>{L('笔成绩/失误记录已保存在数据库', 'score/fault records saved in database')}</span></div>
          </div>
          <div className="card">
            <h2>{L('联网同步', 'Online sync')}</h2><p>{online ? L('网络可用，可以同步本机记录。', 'Network available. Local records can be synchronized.') : L('当前离线；所有记录继续保存在本机。', 'Offline. All records remain stored on this device.')}</p>
            <div className="sync-count"><strong>{localCount}</strong><span>{L('笔待同步记录', 'records pending')}</span></div>
            <button className="primary-button" disabled={syncing} onClick={syncOnline}><CloudUpload size={18} />{syncing ? L('同步中…', 'Syncing…') : online ? L('立即同步', 'Sync now') : L('稍后联网同步', 'Sync when online')}</button>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="two-column">
          <div className="card">
            <h2>{L('系统背景自定义', 'System Background Customization')}</h2>
            <p>{L('自定义全系统背景，所有用户同步后将看到相同背景。', 'Customize the system background for all users. All devices will see the same background after sync.')}</p>
            
            <label>{L('背景类型', 'Background Type')}
              <select 
                value={bgType} 
                onChange={event => {
                  const type = event.target.value as 'gradient' | 'image' | 'video';
                  setBgType(type);
                  setBgValue('');
                }}
              >
                <option value="gradient">{L('渐变色', 'Gradient')}</option>
                <option value="image">{L('图片', 'Image')}</option>
              </select>
            </label>

            {bgType === 'gradient' && (
              <>
                <label>{L('预设渐变', 'Preset Gradients')}
                  <select 
                    value=""
                    onChange={event => {
                      if (event.target.value) {
                        setBgValue(event.target.value);
                      }
                    }}
                  >
                    <option value="">{L('选择预设', 'Select Preset')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #342018 0, #0d0d0e 42%)">{L('默认 - 余烬', 'Default - Ember')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #1a2340 0, #0d0d0e 42%)">{L('宇宙', 'Cosmic')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #0f2820 0, #0d0d0e 42%)">{L('终端', 'Terminal')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #1a3340 0, #0d0d0e 42%)">{L('海洋', 'Ocean')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #2a3318 0, #0d0d0e 42%)">{L('森林', 'Forest')}</option>
                    <option value="radial-gradient(circle at 50% -20%, #402818 0, #0d0d0e 42%)">{L('日落', 'Sunset')}</option>
                  </select>
                </label>
              </>
            )}

            {bgType === 'image' && (
              <>
                <div style={{ margin: '0.8rem 0' }}>
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: 'var(--muted)', 
                    marginBottom: '0.5rem' 
                  }}>
                    {L('或上传图片文件', 'Or upload image file')}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      
                      // Check file size (max 5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        setNotice(L('图片文件过大，请选择小于5MB的文件', 'Image file too large, please select a file smaller than 5MB'));
                        return;
                      }
                      
                      // Convert to base64
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const base64 = e.target?.result as string;
                        setBgValue(base64);
                        setNotice(L('图片已加载', 'Image loaded'));
                      };
                      reader.onerror = () => {
                        setNotice(L('图片加载失败', 'Failed to load image'));
                      };
                      reader.readAsDataURL(file);
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
                    {L('支持 JPG, PNG, WebP 格式，最大 5MB', 'Supports JPG, PNG, WebP formats, max 5MB')}
                  </small>
                </div>
              </>
            )}

            <label>{L('透明度', 'Opacity')}
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
                className="secondary-button" 
                onClick={() => {
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
                }}
                style={{ flex: 1 }}
              >
                {L('预览', 'Preview')}
              </button>
              <button 
                className="primary-button" 
                onClick={() => {
                  if (!bgValue.trim()) {
                    setNotice(L('请输入背景值', 'Please enter background value'));
                    return;
                  }
                  const newBg: BackgroundConfig = {
                    type: bgType,
                    value: bgValue,
                    opacity: bgOpacity,
                    appliedAt: new Date().toISOString(),
                    name: bgType === 'gradient' ? L('自定义渐变', 'Custom Gradient') : bgValue.substring(0, 30)
                  };
                  
                  // Add to history
                  const history = settings.backgroundHistory || [];
                  const updatedHistory = [newBg, ...history.filter(h => h.value !== newBg.value || h.type !== newBg.type)].slice(0, 10);
                  
                  onChangeSettings({ 
                    ...settings, 
                    customBackground: newBg,
                    backgroundHistory: updatedHistory
                  });
                  setNotice(L('背景已应用', 'Background applied'));
                }}
                style={{ flex: 1 }}
              >
                {L('应用背景', 'Apply Background')}
              </button>
            </div>

            {settings.customBackground && (
              <button 
                className="secondary-button" 
                onClick={() => {
                  const { customBackground, ...rest } = settings;
                  onChangeSettings(rest);
                  setBgValue('');
                  setBgOpacity(100);
                  setNotice(L('已恢复默认背景', 'Reset to default'));
                }}
                style={{ marginTop: '0.5rem', width: '100%' }}
              >
                {L('恢复默认背景', 'Reset to Default')}
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
                  {L('当前背景', 'Current Background')}
                </small>
                <div style={{ fontSize: '0.85rem' }}>
                  <div>{L('类型', 'Type')}: {settings.customBackground.type}</div>
                  <div>{L('透明度', 'Opacity')}: {Math.round(settings.customBackground.opacity ?? 100)}%</div>
                  <div style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    maxWidth: '100%'
                  }}>
                    {L('值', 'Value')}: {settings.customBackground.value.substring(0, 50)}...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Background History */}
          <div className="card">
            <h2>{L('背景历史记录', 'Background History')}</h2>
            <p>{L('点击选择之前使用过的背景', 'Click to reuse previous backgrounds')}</p>
            
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
                      className="history-background-select"
                      onClick={() => {
                        setBgType(bg.type);
                        setBgValue(bg.value);
                        setBgOpacity(bg.opacity ?? 100);
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
                        className="text-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBgPreview(bg);
                          setShowBgPreview(true);
                        }}
                        style={{ padding: '0.3rem 0.5rem' }}
                      >
                        {L('预览', 'Preview')}
                      </button>
                      <button
                        className="text-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSettings({ 
                            ...settings, 
                            customBackground: bg
                          });
                          setNotice(L('背景已应用', 'Background applied'));
                        }}
                        style={{ padding: '0.3rem 0.5rem' }}
                      >
                        {L('应用', 'Apply')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ marginTop: '1rem' }}>
                {L('暂无历史记录', 'No history yet')}
              </div>
            )}

            {settings.backgroundHistory && settings.backgroundHistory.length > 0 && (
              <button
                className="secondary-button"
                onClick={() => {
                  onChangeSettings({ ...settings, backgroundHistory: [] });
                  setNotice(L('历史记录已清空', 'History cleared'));
                }}
                style={{ marginTop: '0.8rem', width: '100%' }}
              >
                {L('清空历史记录', 'Clear History')}
              </button>
            )}
          </div>
          <div className="card">
            <h2>{L('首页当前赛事', 'Current event on home screen')}</h2>
            <p>{L('主页显示赛事名称；个人赛、团体赛等属于赛事下面的比赛项目。其他设备联网同步后会采用同一设置。', 'The home screen shows the event name. Individual and team stages are competitions within that event. Other devices receive the same setting after sync.')}</p>
            <label>{L('当前赛事', 'Current event')}<select value={settings.activeEventId} onChange={event => onChangeSettings({ ...settings, activeEventId: event.target.value })}>
              {events.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
            </select></label>
          </div>
          {competition && <div className="card">
            <h2>{L('技术失误规则', 'Technical fault rule')}</h2><p>{L('不同赛事规则可能采用 0.3 或 0.5，请赛前确认。', 'Different rules may use 0.3 or 0.5. Confirm before the event.')}</p>
            <label>{L('每次失误扣分', 'Deduction per fault')}<input type="number" min="0" step="0.1" value={competition.faultDeduction} onChange={event => updateCompetition({ ...competition, faultDeduction: Math.max(0, Number(event.target.value) || 0) })} /></label>
          </div>}
          {competition && <div className="card">
            <h2>{L('比赛人员信息', 'Competition Personnel')}</h2>
            <p>{L('这些信息会出现在导出的成绩表上', 'This information appears on exported results')}</p>
            <div className="field-pair">
              <label>{L('裁判长', 'Chief Judge')}<input value={competition.chiefJudge || ''} onChange={event => updateCompetition({ ...competition, chiefJudge: event.target.value })} placeholder={L('裁判长姓名', 'Chief judge name')} /></label>
              <label>{L('记录员', 'Recorder')}<input value={competition.recorder || ''} onChange={event => updateCompetition({ ...competition, recorder: event.target.value })} placeholder={L('记录员姓名', 'Recorder name')} /></label>
            </div>
          </div>}
          <div className="card">
            <h2>{L('赛事主题', 'Event theme')}</h2>
            {events.map(event => <div className="field-pair" key={event.id}><label>{chineseNameLabel}<input value={event.nameZh ?? event.name} onChange={change => onChangeEvents(events.map(item => item.id === event.id ? { ...item, name: change.target.value, nameZh: change.target.value } : item))} /></label><label>{englishNameLabel}<input value={event.nameEn ?? event.name} onChange={change => onChangeEvents(events.map(item => item.id === event.id ? { ...item, nameEn: change.target.value } : item))} /></label></div>)}
            <div className="bilingual-form"><input placeholder={L('新赛事华文名字', 'New event Chinese name')} value={newEventName} onChange={event => setNewEventName(event.target.value)} /><input placeholder={L('新赛事英文名字', 'New event English name')} value={newEventNameEn} onChange={event => setNewEventNameEn(event.target.value)} /><button className="secondary-button" onClick={addEvent}><Plus size={17} />{L('新增赛事', 'Add event')}</button></div>
          </div>
          <div className="card">
            <h2>{L('比赛项目', 'Competition')}</h2>
            {eventCompetitions.map(comp => <div key={comp.id} style={{ marginBottom: '1.2rem' }}><div className="field-pair"><label>{chineseNameLabel}<input value={comp.nameZh ?? comp.name} onChange={event => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, name: event.target.value, nameZh: event.target.value } : item))} /></label><label>{englishNameLabel}<input value={comp.nameEn ?? comp.name} onChange={event => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, nameEn: event.target.value } : item))} /></label></div>
            <label>{L('比赛类型', 'Competition type')}<select value={comp.type} onChange={event => onChangeCompetitions(competitions.map(item => item.id === comp.id ? { ...item, type: event.target.value as Competition['type'] } : item))}>
              <option value="Individual Stage">{L('个人舞台赛', 'Individual Stage')}</option><option value="Duo/Team Stage">{L('双人/团体舞台赛', 'Duo/Team Stage')}</option><option value="Challenge">{L('挑战赛', 'Challenge')}</option>
            </select></label></div>)}
            {!eventCompetitions.length && <p>{L('此赛事还没有比赛项目，请在下方建立第一个比赛。', 'This event has no competition yet. Create the first competition below.')}</p>}
            <div className="bilingual-form"><input placeholder={L('新比赛华文名字', 'New competition Chinese name')} value={newCompetitionName} onChange={event => setNewCompetitionName(event.target.value)} /><input placeholder={L('新比赛英文名字', 'New competition English name')} value={newCompetitionNameEn} onChange={event => setNewCompetitionNameEn(event.target.value)} /><button className="secondary-button" onClick={addCompetition}><Plus size={17} />{L('新增比赛', 'Add competition')}</button></div>
          </div>
          <div className="card database-card">
            <h2>{L('离线数据库', 'Offline database')}</h2>
            <p>{L('原生 App 使用 SQLite。浏览器开发模式使用 localStorage fallback，并不会产生可直接双击的 .db 文件。', 'The native app uses SQLite. Browser development uses a localStorage fallback and does not create a directly openable .db file.')}</p>
            <p>{L('现场若要手动改资料，建议在这里编辑整库 JSON；它会保存回同一套 SQLite 数据。', 'For manual field edits, edit the full database JSON here; it saves back into the same SQLite data store.')}</p>
            <div className="database-actions">
              <button className="secondary-button" onClick={openDatabaseJson}>{L('查看/编辑数据库 JSON', 'View/edit database JSON')}</button>
              <button className="primary-button" disabled={!databaseText.trim()} onClick={saveDatabaseJson}>{L('保存整库 JSON', 'Save database JSON')}</button>
            </div>
            {databaseText && (
              <textarea
                className="database-editor"
                value={databaseText}
                onChange={event => setDatabaseText(event.target.value)}
                rows={12}
                spellCheck={false}
                aria-label={L('数据库 JSON 编辑器', 'Database JSON editor')}
              />
            )}
            <dl>
              <div><dt>Android</dt><dd>/data/user/0/studio.mdiabolo.scoring/databases/mdiaboloSQLite.db</dd></div>
              <div><dt>iOS/iPadOS</dt><dd>App Sandbox/Documents/mdiaboloSQLite.db</dd></div>
              <div><dt>{L('浏览器', 'Browser')}</dt><dd>DevTools → Application → Local Storage → mdiabolo:v2:*</dd></div>
            </dl>
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
            
            onChangeSettings({ 
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
        />
      )}
    </section>
  );
}

// Background Preview Modal Component (helper)
function BackgroundPreviewModal({ 
  preview, 
  onClose, 
  onConfirm, 
  language 
}: { 
  preview: BackgroundConfig; 
  onClose: () => void; 
  onConfirm: () => void; 
  language: Language; 
}) {
  const L = (zh: string, en: string) => `${zh} · ${en}`;
  const opacity = (preview.opacity ?? 100) / 100;
  
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '90%', width: '800px' }}>
        <h2>{L('背景预览', 'Background Preview')}</h2>
        <p style={{ marginBottom: '1rem' }}>
          {L('查看新背景效果，确认后应用。', 'Review the new background and confirm to apply.')}
        </p>
        
        {/* Preview Area */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--line)',
          marginBottom: '1rem'
        }}>
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
              <source src={preview.value} type="video/mp4" />
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
              {L('MDiabolo', 'MDiabolo')}
            </h1>
            <p style={{ fontSize: '1rem', color: '#f0f0f0' }}>
              {L('离线计分系统', 'Offline Scoring System')}
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
            <div><strong>{L('类型', 'Type')}:</strong> {preview.type}</div>
            <div><strong>{L('透明度', 'Opacity')}:</strong> {Math.round(preview.opacity ?? 100)}%</div>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            <strong>{L('值', 'Value')}:</strong> {preview.value.substring(0, 80)}{preview.value.length > 80 ? '...' : ''}
          </div>
        </div>
        
        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="secondary-button" onClick={onClose} style={{ flex: 1 }}>
            {L('取消', 'Cancel')}
          </button>
          <button className="primary-button" onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1 }}>
            {L('确认应用', 'Confirm & Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
