import { useEffect, useRef, useState } from 'react';
import { Download, Languages, LogOut, QrCode, Settings2, Upload, UserRound } from 'lucide-react';
import QRCode from 'qrcode';
import { App as CapacitorApp } from '@capacitor/app';
import { BarcodeFormat, BarcodeScanner, LensFacing, Resolution } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import {
  type AdminAccount,
  type AppSettings,
  type Athlete,
  type Competition,
  type EventConfig,
  type FaultSubmission,
  type Judge,
  type Language,
  type ScoreSubmission,
  SEEDED_ATHLETES,
  SEEDED_COMPETITIONS,
  SEEDED_EVENTS,
  SEEDED_JUDGES
} from './initialData';
import { AdminPanel } from './components/AdminPanel';
import { JudgePanel } from './components/JudgePanel';
import { LogoMark } from './components/LogoMark';
import { loadLocal, saveLocal } from './utils/storage';
import { repository } from './utils/repository';
import { migrateAthletes, migrateCompetitions, migrateEvents, migrateJudges } from './utils/bilingual';
import { I18nText, formatText, nextTextMode, singleNameNodeForMode, textModeLabel, textModeShortLabel, type TextMode } from './utils/i18n';
import { mergeIncomingTransferSettings, sanitizeTransferAction, sanitizeTransferPackage, sanitizeTransferSettings, sanitizeTransferSnapshot } from './utils/transfer';
import {
  decodeDatabaseQrChunk,
  encodeBrotliActionSyncQr,
  encodeBrotliAnimatedActionSyncQr,
  rebuildDatabaseSyncPayloadAsync,
  type ActionLogEntry,
  type ActionSyncPackage,
  type DatabaseQrChunk,
  type DatabaseSnapshot
} from './utils/qr';

type Screen = 'role' | 'judge-select' | 'judge' | 'admin';

interface ExportQrPage extends DatabaseQrChunk {
  dataUrl: string;
}

type SyncEntity = 'athlete' | 'competition' | 'judge' | 'event' | 'score' | 'fault' | 'admin' | 'settings';
type SyncDecision = 'local' | 'incoming';

interface SyncConflict {
  key: string;
  entity: SyncEntity;
  operation?: 'upsert' | 'delete';
  entityId?: string;
  label: string;
  localSummary: string;
  incomingSummary: string;
  differences: SyncFieldDifference[];
  recommendedDecision: SyncDecision;
  recommendationReason?: string;
}

interface SyncFieldDifference {
  field: string;
  local: string;
  incoming: string;
}

interface SyncNewItem {
  key: string;
  entity: SyncEntity;
  label: string;
  summary: string;
}

interface SyncGroupSummary {
  entity: SyncEntity;
  label: string;
  incomingOnlyCount: number;
  sameCount: number;
  conflictCount: number;
  deleteCount: number;
  newItems: SyncNewItem[];
}

interface SyncPreview {
  snapshot: DatabaseSnapshot;
  syncPackage?: ActionSyncPackage;
  incomingOnlyCount: number;
  deleteCount: number;
  sameCount: number;
  groups: SyncGroupSummary[];
  conflicts: SyncConflict[];
  decisions: Record<string, SyncDecision>;
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
    entity: SyncEntity;
    label: string;
    added: number;
    accepted: number;
    deleted: number;
    kept: number;
    newItems: string[];
  }>;
  conflicts: Array<{
    label: string;
    decision: SyncDecision;
    differences: string[];
  }>;
}

const DEFAULT_FONT_SCALE = 115;
const FONT_SCALE_DEFAULT_VERSION = '115';

function loadInitialFontScale() {
  const stored = loadLocal<number | null>('fontScale', null);
  const migratedVersion = loadLocal('fontScaleDefaultVersion', '');
  if ((stored === null || stored === 100) && migratedVersion !== FONT_SCALE_DEFAULT_VERSION) {
    saveLocal('fontScaleDefaultVersion', FONT_SCALE_DEFAULT_VERSION);
    return DEFAULT_FONT_SCALE;
  }
  if (migratedVersion !== FONT_SCALE_DEFAULT_VERSION) {
    saveLocal('fontScaleDefaultVersion', FONT_SCALE_DEFAULT_VERSION);
  }
  return stored ?? DEFAULT_FONT_SCALE;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('role');
  const [screenHistory, setScreenHistory] = useState<Screen[]>([]);
  const [selectedJudge, setSelectedJudge] = useState<Judge | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const language: Language = 'zh';
  const [fontScale, setFontScale] = useState<number>(() => loadInitialFontScale());
  const [textMode, setTextMode] = useState<TextMode>(() => loadLocal('textMode', 'bilingual'));
  const [simpleMode, setSimpleMode] = useState<boolean>(() => loadLocal('simpleMode', false));
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [events, setEvents] = useState<EventConfig[]>([]);
  const [scores, setScores] = useState<ScoreSubmission[]>([]);
  const [faults, setFaults] = useState<FaultSubmission[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ activeEventId: '' });
  const [hydrated, setHydrated] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const [exportQrPages, setExportQrPages] = useState<ExportQrPage[]>([]);
  const [exportPageIndex, setExportPageIndex] = useState(0);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [databaseQrChunks, setDatabaseQrChunks] = useState<Record<string, DatabaseQrChunk[]>>({});
  const databaseQrChunksRef = useRef<Record<string, DatabaseQrChunk[]>>({});
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [integrationHistory, setIntegrationHistory] = useState<IntegrationLogEntry[]>(() => loadLocal('integrationHistory', []));
  const [syncDeviceName, setSyncDeviceName] = useState(() => loadLocal('syncDeviceName', `MDiabolo-${Math.random().toString(36).slice(2, 6).toUpperCase()}`));
  const [syncExporterName, setSyncExporterName] = useState(() => loadLocal('syncExporterName', ''));
  const [scannerProgress, setScannerProgress] = useState<{ scanned: number; total: number; sessionId: string } | null>(null);
  const [scanningDatabaseQr, setScanningDatabaseQr] = useState(false);
  const scannerListenerRef = useRef<{ remove: () => Promise<void> | void } | null>(null);
  const lastBackPressRef = useRef(0);
  const contextualBackRef = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    let active = true;
    const updateOnlineStatus = () => {
      void Network.getStatus()
        .then(status => {
          if (active) setOnline(status.connected);
        })
        .catch(() => {
          if (active) setOnline(navigator.onLine !== false);
        });
    };
    updateOnlineStatus();
    const interval = window.setInterval(updateOnlineStatus, 2500);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', updateOnlineStatus);
    const listener = Network.addListener('networkStatusChange', status => {
      setOnline(status.connected);
    });
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', updateOnlineStatus);
      void listener.then(handle => handle.remove());
    };
  }, []);

  useEffect(() => {
    const safeScale = Math.min(140, Math.max(80, fontScale));
    document.documentElement.style.setProperty('--user-font-scale', String(safeScale / 100));
    saveLocal('fontScale', safeScale);
  }, [fontScale]);

  useEffect(() => {
    document.body.classList.toggle('simple-mode', simpleMode);
    document.body.dataset.textMode = textMode;
    saveLocal('simpleMode', simpleMode);
    saveLocal('textMode', textMode);
  }, [simpleMode, textMode]);

  useEffect(() => {
    saveLocal('syncDeviceName', syncDeviceName);
  }, [syncDeviceName]);

  useEffect(() => {
    saveLocal('syncExporterName', syncExporterName);
  }, [syncExporterName]);

  useEffect(() => {
    if (!syncNotice) return;
    const timeout = window.setTimeout(() => setSyncNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [syncNotice]);

  useEffect(() => {
    const updateHeader = () => {
      setHeaderCollapsed(current => {
        const scrollY = window.scrollY;
        if (!current && scrollY > 72) return true;
        if (current && scrollY < 8) return false;
        return current;
      });
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setHeaderCollapsed(false);
  }, [screen]);

  useEffect(() => {
    if (exportQrPages.length <= 1) return;
    const interval = window.setInterval(() => {
      setExportPageIndex(index => (index + 1) % exportQrPages.length);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [exportQrPages.length]);

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.load<Athlete[]>('athletes', []),
      repository.load<Competition[]>('competitions', []),
      repository.load<Judge[]>('judges', []),
      repository.load<EventConfig[]>('events', []),
      repository.load<ScoreSubmission[]>('scores', []),
      repository.load<FaultSubmission[]>('faults', []),
      repository.load<AdminAccount[]>('admins', [])
      , repository.load<AppSettings>('settings', { activeEventId: '' })
    ]).then(([storedAthletes, storedCompetitions, storedJudges, storedEvents, storedScores, storedFaults, storedAdmins, storedSettings]) => {
      if (!active) return;
      const migratedCompetitions = migrateCompetitions(storedCompetitions, SEEDED_COMPETITIONS);
      const migratedAthletes = migrateAthletes(storedAthletes, SEEDED_ATHLETES).map(athlete => ({
        ...athlete,
        competitionIds: athlete.competitionIds.length
          ? athlete.competitionIds
          : migratedCompetitions
              .filter(item => item.rounds.some(round => round.athleteIds.includes(athlete.id)))
              .map(item => item.id)
      }));
      const migratedJudges = migrateJudges(storedJudges, SEEDED_JUDGES);
      const migratedEvents = migrateEvents(storedEvents, SEEDED_EVENTS);
      setAthletes(migratedAthletes);
      setCompetitions(migratedCompetitions);
      setJudges(migratedJudges);
      setEvents(migratedEvents);
      setScores(storedScores);
      setFaults(storedFaults);
      setAdmins(storedAdmins);
      const migratedSettings: AppSettings = {
        ...storedSettings,
        activeEventId: storedSettings.activeEventId ||
          migratedCompetitions.find(item => item.id === storedSettings.activeCompetitionId)?.eventId ||
          migratedEvents[0]?.id ||
          ''
      };
      setSettings(migratedSettings);
      void repository.save('athletes', migratedAthletes);
      void repository.save('competitions', migratedCompetitions);
      void repository.save('judges', migratedJudges);
      void repository.save('events', migratedEvents);
      void repository.save('settings', migratedSettings);
      setHydrated(true);
    }).catch(error => {
      console.warn('Failed to hydrate repository state; falling back to localStorage.', error);
      if (!active) return;
      const storedAthletes = loadLocal<Athlete[]>('athletes', []);
      const storedCompetitions = loadLocal<Competition[]>('competitions', []);
      const storedJudges = loadLocal<Judge[]>('judges', []);
      const storedEvents = loadLocal<EventConfig[]>('events', []);
      const migratedCompetitions = migrateCompetitions(storedCompetitions, SEEDED_COMPETITIONS);
      const migratedEvents = migrateEvents(storedEvents, SEEDED_EVENTS);
      setAthletes(migrateAthletes(storedAthletes, SEEDED_ATHLETES));
      setCompetitions(migratedCompetitions);
      setJudges(migrateJudges(storedJudges, SEEDED_JUDGES));
      setEvents(migratedEvents);
      setScores(loadLocal<ScoreSubmission[]>('scores', []));
      setFaults(loadLocal<FaultSubmission[]>('faults', []));
      setAdmins(loadLocal<AdminAccount[]>('admins', []));
      const storedSettings = loadLocal<AppSettings>('settings', { activeEventId: '' });
      setSettings({
        ...storedSettings,
        activeEventId: storedSettings.activeEventId ||
          migratedCompetitions.find(item => item.id === storedSettings.activeCompetitionId)?.eventId ||
          migratedEvents[0]?.id ||
          ''
      });
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const update = <T,>(key: string, setter: (value: T) => void, value: T) => {
    setter(value);
    saveLocal(key, value);
    return repository.save(key, value).catch(error => {
      setSyncNotice(error instanceof Error ? error.message : L('数据库保存失败。', 'Database save failed.'));
      throw error;
    });
  };

  const databaseSnapshot = (): DatabaseSnapshot => ({
    protocol: 'mdiabolo-db-v1',
    exportedAt: new Date().toISOString(),
    athletes,
    competitions,
    judges,
    events,
    scores,
    faults,
    admins,
    settings
  });

  const databaseQrSnapshot = (): DatabaseSnapshot => {
    return sanitizeTransferSnapshot({
      ...databaseSnapshot(),
      admins: []
    });
  };

  const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };

  const sameRecord = (left: unknown, right: unknown) => stableJson(left) === stableJson(right);

  const looksLikeMojibake = (value: unknown): boolean => {
    if (typeof value === 'string') return /\?{2,}|�/.test(value);
    if (Array.isArray(value)) return value.some(looksLikeMojibake);
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(looksLikeMojibake);
    }
    return false;
  };

  const shortHash = (value: string): string => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36).toUpperCase();
  };

  const syncPackageIdentity = (snapshot: DatabaseSnapshot, syncPackage?: ActionSyncPackage) =>
    syncPackage?.packageId ||
    `LEGACY-${snapshot.exportedAt}-${shortHash(stableJson({
      actions: syncPackage?.actions?.map(action => [action.actionType, action.entityType, action.entityId, action.createdAt]),
      scores: snapshot.scores.map(score => [score.id, score.submittedAt]),
      faults: snapshot.faults.map(fault => [fault.id, fault.submittedAt])
    }))}`;

  const defaultConflictDecision = (entity: SyncEntity, localValue: unknown, incomingValue: unknown): { decision: SyncDecision; reason?: string } => {
    if (entity !== 'score' && entity !== 'fault') {
      if (looksLikeMojibake(localValue) && !looksLikeMojibake(incomingValue)) {
        return {
          decision: 'incoming',
          reason: L('本机资料含有问号乱码，已预选接受 QR 修正版。', 'Local data contains question-mark mojibake, so Accept QR is preselected.')
        };
      }
      return { decision: 'local' };
    }
    const localSubmittedAt = typeof localValue === 'object' && localValue ? Date.parse(String((localValue as { submittedAt?: unknown }).submittedAt ?? '')) : NaN;
    const incomingSubmittedAt = typeof incomingValue === 'object' && incomingValue ? Date.parse(String((incomingValue as { submittedAt?: unknown }).submittedAt ?? '')) : NaN;
    if (Number.isFinite(localSubmittedAt) && Number.isFinite(incomingSubmittedAt) && incomingSubmittedAt > localSubmittedAt) {
      return {
        decision: 'incoming',
        reason: L('QR 版本提交时间较新，已预选接受 QR。', 'QR version is newer, so Accept QR is preselected.')
      };
    }
    return {
      decision: 'local',
      reason: L('本机版本较新或时间无法比较，已预选保留本机。', 'Local version is newer or timestamps cannot be compared, so Keep local is preselected.')
    };
  };

  const itemName = (id: string, snapshot?: DatabaseSnapshot) => {
    const poolAthletes = [...athletes, ...(snapshot?.athletes ?? [])];
    const poolJudges = [...judges, ...(snapshot?.judges ?? [])];
    const poolCompetitions = [...competitions, ...(snapshot?.competitions ?? [])];
    const poolEvents = [...events, ...(snapshot?.events ?? [])];
    return poolAthletes.find(item => item.id === id)?.name ||
      poolJudges.find(item => item.id === id)?.name ||
      poolCompetitions.find(item => item.id === id)?.name ||
      poolEvents.find(item => item.id === id)?.name ||
      id;
  };

  const describeEntity = (entity: SyncEntity, value: unknown, snapshot?: DatabaseSnapshot) => {
    if (entity === 'score') {
      const score = value as ScoreSubmission;
      return `${itemName(score.athleteId, snapshot)} / ${itemName(score.judgeId, snapshot)} / ${score.totalScore} / ${new Date(score.submittedAt).toLocaleString()}`;
    }
    if (entity === 'fault') {
      const fault = value as FaultSubmission;
      return `${itemName(fault.athleteId, snapshot)} / ${fault.faultsCount} faults / ${new Date(fault.submittedAt).toLocaleString()}`;
    }
    if (entity === 'settings') {
      const next = value as AppSettings;
      return `event=${next.activeEventId || '-'}, competition=${next.activeCompetitionId || '-'}`;
    }
    const item = value as { id?: string; name?: string; nameZh?: string; nameEn?: string };
    return `${item.nameZh || item.name || item.id || '-'}${item.nameEn && item.nameEn !== item.nameZh ? ` / ${item.nameEn}` : ''}`;
  };

  const fieldLabel = (field: string) => ({
    name: L('名字', 'Name'),
    nameZh: L('华文名字', 'Chinese name'),
    nameEn: L('英文名字', 'English name'),
    competitionIds: L('分配比赛', 'Assigned competitions'),
    athleteIds: L('参赛名单', 'Entries'),
    totalScore: L('总分', 'Total score'),
    dimensions: L('评分细项', 'Score dimensions'),
    faultsCount: L('失误次数', 'Fault count'),
    deductionAmount: L('扣分', 'Deduction'),
    status: L('状态', 'Status'),
    role: L('裁判类型', 'Judge role'),
    roundId: L('回合', 'Round'),
    athleteId: L('选手', 'Athlete'),
    judgeId: L('裁判', 'Judge'),
    competitionId: L('比赛', 'Competition')
  }[field] ?? field);

  const describeValue = (value: unknown, snapshot?: DatabaseSnapshot): string => {
    if (value === undefined || value === null || value === '') return '-';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return itemName(value, snapshot);
    if (Array.isArray(value)) {
      if (!value.length) return '-';
      if (value.every(item => typeof item === 'string')) {
        return value.map(item => itemName(item as string, snapshot)).join(', ');
      }
      return value.map(item => describeEntity('competition', item, snapshot)).join(' | ');
    }
    return stableJson(value);
  };

  const diffRecord = (localValue: unknown, incomingValue: unknown, snapshot?: DatabaseSnapshot): SyncFieldDifference[] => {
    if (!localValue || !incomingValue || typeof localValue !== 'object' || typeof incomingValue !== 'object') {
      return sameRecord(localValue, incomingValue) ? [] : [{
        field: L('内容', 'Content'),
        local: describeValue(localValue, snapshot),
        incoming: describeValue(incomingValue, snapshot)
      }];
    }
    const localRecord = localValue as Record<string, unknown>;
    const incomingRecord = incomingValue as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(localRecord), ...Object.keys(incomingRecord)]))
      .filter(key => key !== 'id')
      .sort((left, right) => left.localeCompare(right));
    return keys
      .filter(key => !sameRecord(localRecord[key], incomingRecord[key]))
      .slice(0, 12)
      .map(key => ({
        field: fieldLabel(key),
        local: describeValue(localRecord[key], snapshot),
        incoming: describeValue(incomingRecord[key], snapshot)
      }));
  };

  const collectConflicts = <T extends { id: string }>(
    entity: SyncEntity,
    localItems: T[],
    incomingItems: T[],
    snapshot: DatabaseSnapshot,
    labelPrefix: string
  ) => {
    let sameCount = 0;
    const conflicts: SyncConflict[] = [];
    const newItems: SyncNewItem[] = [];
    const localMap = new Map(localItems.map(item => [item.id, item]));
    incomingItems.forEach(item => {
      const current = localMap.get(item.id);
      if (!current) {
        newItems.push({
          key: `${entity}:${item.id}:new`,
          entity,
          label: `${labelPrefix}: ${describeEntity(entity, item, snapshot)}`,
          summary: describeEntity(entity, item, snapshot)
        });
        return false;
      }
      if (sameRecord(current, item)) {
        sameCount += 1;
        return false;
      }
      const defaultDecision = defaultConflictDecision(entity, current, item);
      conflicts.push({
        key: `${entity}:${item.id}`,
        entity,
        operation: 'upsert',
        entityId: item.id,
        label: `${labelPrefix}: ${describeEntity(entity, item, snapshot)}`,
        localSummary: describeEntity(entity, current, snapshot),
        incomingSummary: describeEntity(entity, item, snapshot),
        differences: diffRecord(current, item, snapshot),
        recommendedDecision: defaultDecision.decision,
        recommendationReason: defaultDecision.reason
      });
    });
    return {
      entity,
      label: labelPrefix,
      incomingOnlyCount: newItems.length,
      sameCount,
      conflicts,
      newItems
    };
  };

  const collectDeletes = <T extends { id: string }>(
    entity: SyncEntity,
    localItems: T[],
    actions: ActionLogEntry[],
    labelPrefix: string
  ): SyncConflict[] => {
    const localMap = new Map(localItems.map(item => [item.id, item]));
    return actions
      .filter(action => action.actionType === 'delete' && action.entityType === entity && action.entityId && localMap.has(action.entityId))
      .map(action => {
        const current = localMap.get(action.entityId as string) as T;
        return {
          key: `${entity}:${action.entityId}:delete`,
          entity,
          operation: 'delete',
          entityId: action.entityId as string,
          label: `${labelPrefix}: ${describeEntity(entity, current)}`,
          localSummary: describeEntity(entity, current),
          incomingSummary: L('QR 要删除这笔资料', 'QR deletes this record'),
          differences: [{
            field: L('操作', 'Operation'),
            local: L('保留本机资料', 'Keep local record'),
            incoming: L('删除本机资料', 'Delete local record')
          }],
          recommendedDecision: 'local' as SyncDecision,
          recommendationReason: L('删除动作需要现场确认，已预选保留本机。', 'Deletes require field confirmation, so Keep local is preselected.')
        };
      });
  };

  const buildSyncPreview = (snapshot: DatabaseSnapshot, syncPackage?: ActionSyncPackage): SyncPreview => {
    const actions = syncPackage?.actions ?? [];
    const groups = [
      collectConflicts('event', events, snapshot.events, snapshot, L('赛事', 'Event')),
      collectConflicts('competition', competitions, snapshot.competitions, snapshot, L('比赛', 'Competition')),
      collectConflicts('athlete', athletes, snapshot.athletes, snapshot, L('选手', 'Athlete')),
      collectConflicts('judge', judges, snapshot.judges, snapshot, L('裁判', 'Judge')),
      collectConflicts('score', scores, snapshot.scores, snapshot, L('成绩', 'Score')),
      collectConflicts('fault', faults, snapshot.faults, snapshot, L('失误', 'Fault')),
      collectConflicts('admin', admins, snapshot.admins, snapshot, L('管理员', 'Admin'))
    ];
    const deleteConflicts = [
      ...collectDeletes('event', events, actions, L('赛事', 'Event')),
      ...collectDeletes('competition', competitions, actions, L('比赛', 'Competition')),
      ...collectDeletes('athlete', athletes, actions, L('选手', 'Athlete')),
      ...collectDeletes('judge', judges, actions, L('裁判', 'Judge')),
      ...collectDeletes('score', scores, actions, L('成绩', 'Score')),
      ...collectDeletes('fault', faults, actions, L('失误', 'Fault'))
    ];
    const localTransferSettings = sanitizeTransferSettings(settings);
    const incomingTransferSettings = sanitizeTransferSettings(snapshot.settings);
    const settingConflict = sameRecord(localTransferSettings, incomingTransferSettings) ? [] : [{
      key: 'settings:app',
      entity: 'settings' as SyncEntity,
      operation: 'upsert' as const,
      entityId: 'app',
      label: L('系统设置', 'Settings'),
      localSummary: describeEntity('settings', localTransferSettings, snapshot),
      incomingSummary: describeEntity('settings', incomingTransferSettings, snapshot),
      differences: diffRecord(localTransferSettings, incomingTransferSettings, snapshot),
      recommendedDecision: 'local' as SyncDecision,
      recommendationReason: L('系统设置可能影响整场比赛，已预选保留本机。', 'Settings can affect the event, so Keep local is preselected.')
    }];
    const conflicts = [...groups.flatMap(group => group.conflicts), ...deleteConflicts, ...settingConflict];
    const groupSummaries: SyncGroupSummary[] = groups.map(group => ({
      entity: group.entity,
      label: group.label,
      incomingOnlyCount: group.incomingOnlyCount,
      sameCount: group.sameCount,
      conflictCount: group.conflicts.length + (group.entity === 'settings' ? settingConflict.length : 0),
      deleteCount: deleteConflicts.filter(conflict => conflict.entity === group.entity).length,
      newItems: group.newItems
    }));
    if (settingConflict.length) {
      groupSummaries.push({
        entity: 'settings',
        label: L('设置', 'Settings'),
        incomingOnlyCount: 0,
        sameCount: 0,
        conflictCount: 1,
        deleteCount: 0,
        newItems: []
      });
    }
    return {
      snapshot,
      syncPackage,
      incomingOnlyCount: groups.reduce((sum, group) => sum + group.incomingOnlyCount, 0),
      deleteCount: deleteConflicts.length,
      sameCount: groups.reduce((sum, group) => sum + group.sameCount, 0) + (settingConflict.length ? 0 : 1),
      groups: groupSummaries,
      conflicts,
      decisions: Object.fromEntries(conflicts.map(conflict => [conflict.key, conflict.recommendedDecision]))
    };
  };

  const resolveItems = <T extends { id: string }>(entity: SyncEntity, localItems: T[], incomingItems: T[], preview: SyncPreview) => {
    const map = new Map(localItems.map(item => [item.id, item]));
    incomingItems.forEach(item => {
      const current = map.get(item.id);
      if (!current) {
        map.set(item.id, item);
        return;
      }
      if (sameRecord(current, item) || preview.decisions[`${entity}:${item.id}`] === 'incoming') {
        map.set(item.id, item);
      }
    });
    preview.conflicts
      .filter(conflict => conflict.entity === entity && conflict.operation === 'delete' && conflict.entityId && preview.decisions[conflict.key] === 'incoming')
      .forEach(conflict => map.delete(conflict.entityId as string));
    return Array.from(map.values());
  };

  const buildIntegrationLog = (preview: SyncPreview): IntegrationLogEntry => {
    const acceptedConflicts = preview.conflicts.filter(conflict => preview.decisions[conflict.key] === 'incoming');
    const keptConflicts = preview.conflicts.filter(conflict => preview.decisions[conflict.key] !== 'incoming');
    return {
      id: `INT-${Date.now()}`,
      createdAt: new Date().toISOString(),
      packageId: syncPackageIdentity(preview.snapshot, preview.syncPackage),
      sourceExportedAt: preview.syncPackage?.exportedAt ?? preview.snapshot.exportedAt,
      sourceDeviceName: preview.syncPackage?.sourceDeviceName,
      exporterName: preview.syncPackage?.exporterName,
      addedCount: preview.incomingOnlyCount,
      acceptedConflictCount: acceptedConflicts.filter(conflict => conflict.operation !== 'delete').length,
      deleteCount: acceptedConflicts.filter(conflict => conflict.operation === 'delete').length,
      localKeptCount: keptConflicts.length,
      groups: preview.groups
        .map(group => {
          const groupAccepted = acceptedConflicts.filter(conflict => conflict.entity === group.entity);
          const groupKept = keptConflicts.filter(conflict => conflict.entity === group.entity);
          return {
            entity: group.entity,
            label: group.label,
            added: group.incomingOnlyCount,
            accepted: groupAccepted.filter(conflict => conflict.operation !== 'delete').length,
            deleted: groupAccepted.filter(conflict => conflict.operation === 'delete').length,
            kept: groupKept.length,
            newItems: group.newItems.map(item => item.summary).slice(0, 8)
          };
        })
        .filter(group => group.added || group.accepted || group.deleted || group.kept),
      conflicts: preview.conflicts.map(conflict => ({
        label: conflict.label,
        decision: preview.decisions[conflict.key] ?? 'local',
        differences: conflict.differences.map(diff => `${diff.field}: ${diff.local} -> ${diff.incoming}`)
      }))
    };
  };

  const applyDatabaseSnapshot = async (snapshot: DatabaseSnapshot) => {
    try {
      await update<Athlete[]>('athletes', setAthletes, snapshot.athletes);
      await update<Competition[]>('competitions', setCompetitions, snapshot.competitions);
      await update<Judge[]>('judges', setJudges, snapshot.judges);
      await update<EventConfig[]>('events', setEvents, snapshot.events);
      await update<ScoreSubmission[]>('scores', setScores, snapshot.scores);
      await update<FaultSubmission[]>('faults', setFaults, snapshot.faults);
      await update<AdminAccount[]>('admins', setAdmins, snapshot.admins);
      await update<AppSettings>('settings', setSettings, mergeIncomingTransferSettings(settings, snapshot.settings));
    } catch {
      // update() already surfaced the database error in the header notice.
    }
  };

  const applySyncPreview = async () => {
    if (!syncPreview) return;
    const snapshot = syncPreview.snapshot;
    try {
      await update<EventConfig[]>('events', setEvents, resolveItems('event', events, snapshot.events, syncPreview));
      await update<Competition[]>('competitions', setCompetitions, resolveItems('competition', competitions, snapshot.competitions, syncPreview));
      await update<Athlete[]>('athletes', setAthletes, resolveItems('athlete', athletes, snapshot.athletes, syncPreview));
      await update<Judge[]>('judges', setJudges, resolveItems('judge', judges, snapshot.judges, syncPreview));
      await update<ScoreSubmission[]>('scores', setScores, resolveItems('score', scores, snapshot.scores, syncPreview));
      await update<FaultSubmission[]>('faults', setFaults, resolveItems('fault', faults, snapshot.faults, syncPreview));
      await update<AdminAccount[]>('admins', setAdmins, resolveItems('admin', admins, snapshot.admins, syncPreview));
      if (syncPreview.decisions['settings:app'] === 'incoming') {
        await update<AppSettings>('settings', setSettings, mergeIncomingTransferSettings(settings, snapshot.settings));
      }
      const integrationLog = buildIntegrationLog(syncPreview);
      const nextHistory = [integrationLog, ...integrationHistory].slice(0, 50);
      setIntegrationHistory(nextHistory);
      saveLocal('integrationHistory', nextHistory);
      setSyncPreview(null);
      setShowSyncDetails(false);
      setShowImportPanel(false);
      setImportText('');
      resetDatabaseQrChunks();
      setSyncNotice(L(`QR 已整合：新增 ${integrationLog.addedCount}，接受修改 ${integrationLog.acceptedConflictCount}，删除 ${integrationLog.deleteCount}。`, `QR integrated: ${integrationLog.addedCount} new, ${integrationLog.acceptedConflictCount} accepted edits, ${integrationLog.deleteCount} deletes.`));
    } catch {
      // update() already surfaced the database error in the header notice.
    }
  };

  const resetDatabaseQrChunks = () => {
    databaseQrChunksRef.current = {};
    setDatabaseQrChunks({});
    setScannerProgress(null);
  };

  const prepareDatabaseQrScanner = async () => {
    try {
      if (Capacitor.getPlatform() !== 'android') return;
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        setSyncNotice(L('正在准备扫码模块，第一次打开可能需要几秒钟。', 'Preparing the scanner module. The first launch may take a few seconds.'));
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    } catch {
      // Module preparation is best-effort; the camera scanner can still try to start.
    }
  };

  const stopDatabaseQrScanner = async () => {
    try {
      await scannerListenerRef.current?.remove();
    } catch {
      // Listener may already be gone if native scanner closed first.
    }
    scannerListenerRef.current = null;
    try {
      await BarcodeScanner.stopScan();
    } catch {
      // Scanner may already be stopped; keep UI cleanup deterministic.
    }
    document.body.classList.remove('barcode-scanner-active');
    document.documentElement.classList.remove('barcode-scanner-active');
    setScanningDatabaseQr(false);
  };

  const openExportDatabaseQr = async () => {
    const actions = (await repository.loadActionLog())
      .filter(action => action.actionType === 'upsert' || action.actionType === 'delete')
      .map(sanitizeTransferAction);
    const exportedAt = new Date().toISOString();
    const syncPackage = sanitizeTransferPackage({
      protocol: 'mdiabolo-action-sync-v1',
      packageId: `PKG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      exportedAt,
      sourceDeviceName: syncDeviceName.trim() || 'MDiabolo device',
      exporterName: syncExporterName.trim() || undefined,
      actions,
      snapshot: databaseQrSnapshot()
    } satisfies ActionSyncPackage);
    const payload = await encodeBrotliActionSyncQr(syncPackage);
    try {
      const dataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 4, errorCorrectionLevel: 'L' });
      setExportQrPages([{ id: 'ACTION', index: 1, total: 1, data: payload, dataUrl }]);
    } catch {
      const chunks = await encodeBrotliAnimatedActionSyncQr(syncPackage, 850);
      const pages = await Promise.all(chunks.map(async chunk => ({
        ...chunk,
        dataUrl: await QRCode.toDataURL(chunk.data, { width: 260, margin: 4, errorCorrectionLevel: 'L' })
      })));
      setExportQrPages(pages);
      setExportPageIndex(0);
      return;
    }
    setExportPageIndex(0);
  };

  const copyText = async (text: string, successMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setSyncNotice(successMessage);
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
      setSyncNotice(copied ? successMessage : L('复制失败，请手动长按选择文字。', 'Copy failed. Please select the text manually.'));
    }
  };

  const copyExportQrData = async () => {
    const pages = exportQrPages;
    if (!pages.length) return;
    await copyText(
      pages.map(page => page.data).join('\n'),
      L('全部 QR 数据已复制，可在另一台设备粘贴导入。', 'All QR data copied. Paste it on another device to import.')
    );
  };

  const importDatabaseQrPayload = async (payload: string): Promise<boolean> => {
    const payloads = payload
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
    if (payloads.length > 1) {
      resetDatabaseQrChunks();
      let complete = false;
      for (const item of payloads) {
        complete = await importDatabaseQrPayload(item) || complete;
      }
      return complete;
    }
    try {
      const chunk = decodeDatabaseQrChunk(payload);
      const existing = databaseQrChunksRef.current[chunk.id] ?? [];
      const nextChunks = [...existing.filter(item => item.index !== chunk.index), chunk];
      const nextState = { ...databaseQrChunksRef.current, [chunk.id]: nextChunks };
      databaseQrChunksRef.current = nextState;
      setDatabaseQrChunks(nextState);
      setScannerProgress({ scanned: nextChunks.length, total: chunk.total, sessionId: chunk.id });
      if (nextChunks.length < chunk.total) {
        if (payloads.length === 1 && chunk.total > 1) {
          setSyncNotice(L(
            `这只是第 ${chunk.index}/${chunk.total} 页 QR。请继续扫描动画 QR，或一次粘贴全部 ${chunk.total} 行数据。`,
            `This is only QR page ${chunk.index}/${chunk.total}. Keep scanning the animated QR, or paste all ${chunk.total} lines at once.`
          ));
        }
        return false;
      }
      const syncPayload = await rebuildDatabaseSyncPayloadAsync(nextChunks);
      const syncPackage = syncPayload.kind === 'actions' ? sanitizeTransferPackage(syncPayload.package) : undefined;
      const snapshot = syncPayload.kind === 'actions' ? syncPackage!.snapshot : sanitizeTransferSnapshot(syncPayload.snapshot);
      const packageId = syncPackageIdentity(snapshot, syncPackage);
      if (integrationHistory.some(entry => entry.packageId === packageId)) {
        setShowImportPanel(false);
        setImportText('');
        resetDatabaseQrChunks();
        setSyncNotice(L('这包 QR 已经整合过，不需要重复导入。', 'This QR package has already been integrated. No need to import it again.'));
        return true;
      }
      setSyncPreview(buildSyncPreview(snapshot, syncPackage));
      setShowSyncDetails(false);
      setShowImportPanel(false);
      setImportText('');
      resetDatabaseQrChunks();
      setSyncNotice(L('QR 已读取，请点击预览里的详情确认会整合什么。', 'QR read. Open the preview details to confirm what will be integrated.'));
      return true;
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : L('数据库 QR 导入失败。', 'Database QR import failed.'));
      return false;
    }
  };

  const scanDatabaseQr = async () => {
    try {
      await stopDatabaseQrScanner();
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        setSyncNotice(L('此设备不支持原生扫码，请粘贴 QR 内容导入。', 'This device cannot scan natively. Paste QR content to import.'));
        setShowImportPanel(true);
        return;
      }
      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted') {
        setSyncNotice(L('需要相机权限才能导入数据库 QR。', 'Camera permission is required to import database QR.'));
        return;
      }
      await prepareDatabaseQrScanner();
      resetDatabaseQrChunks();
      document.documentElement.classList.add('barcode-scanner-active');
      document.body.classList.add('barcode-scanner-active');
      setScanningDatabaseQr(true);
      scannerListenerRef.current = await BarcodeScanner.addListener('barcodesScanned', event => {
        for (const barcode of event.barcodes) {
          const value = barcode.rawValue ?? barcode.displayValue;
          if (!value) continue;
          void importDatabaseQrPayload(value).then(complete => {
            if (complete) void stopDatabaseQrScanner();
          });
        }
      });
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
        lensFacing: LensFacing.Back,
        resolution: Resolution['1280x720']
      });
    } catch (error) {
      void stopDatabaseQrScanner();
      setSyncNotice(error instanceof Error ? error.message : L('扫码失败。', 'Scanning failed.'));
    }
  };
  const saveScore = async (score: ScoreSubmission): Promise<void> => {
    await repository.saveScoreRecord(score);
    const next = [score, ...scores.filter(item => item.id !== score.id)];
    setScores(next);
    saveLocal('scores', next);
    if (score.syncStatus !== 'synced') void repository.enqueue('score', score.id, score).catch(error => {
      setSyncNotice(error instanceof Error ? error.message : L('同步队列记录失败。', 'Failed to record sync queue.'));
    });
  };
  const saveFault = async (fault: FaultSubmission): Promise<void> => {
    await repository.saveFaultRecord(fault);
    const next = [fault, ...faults.filter(item => item.id !== fault.id)];
    setFaults(next);
    saveLocal('faults', next);
    if (fault.syncStatus !== 'synced') void repository.enqueue('fault', fault.id, fault).catch(error => {
      setSyncNotice(error instanceof Error ? error.message : L('同步队列记录失败。', 'Failed to record sync queue.'));
    });
  };
  const goToScreen = (next: Screen) => {
    setScreenHistory(history => next === screen ? history : [...history, screen]);
    setScreen(next);
  };

  const registerContextualBackHandler = (handler: (() => boolean) | null) => {
    contextualBackRef.current = handler;
  };

  const goBackOneStep = () => {
    if (exportQrPages.length) {
      setExportQrPages([]);
      return true;
    }
    if (showImportPanel) {
      setShowImportPanel(false);
      return true;
    }
    if (syncPreview) {
      setSyncPreview(null);
      return true;
    }
    if (showDisplaySettings) {
      setShowDisplaySettings(false);
      return true;
    }
    if (scanningDatabaseQr) {
      void stopDatabaseQrScanner();
      return true;
    }
    if (contextualBackRef.current?.()) {
      return true;
    }
    if (screenHistory.length) {
      const previous = screenHistory[screenHistory.length - 1];
      setScreenHistory(history => history.slice(0, -1));
      setScreen(previous);
      return true;
    }
    if (screen !== 'role') {
      setScreen('role');
      setScreenHistory([]);
      setSelectedJudge(null);
      return true;
    }
    return false;
  };

  const logout = () => {
    setSelectedJudge(null);
    setScreen('role');
    setScreenHistory([]);
  };
  const activeEvent = events.find(item => item.id === settings.activeEventId);
  const L = (zh: string, en: string) => formatText(zh, en, textMode);
  const T = (zh: string, en: string) => <I18nText zh={zh} en={en} mode={textMode} />;
  const displayNameNode = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => {
    if (!item) return '';
    return <I18nText zh={item.nameZh?.trim() || item.name} en={item.nameEn?.trim() || item.name} mode={textMode} />;
  };
  const personNameNode = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => singleNameNodeForMode(item, textMode);

  useEffect(() => {
    const attach = async () => {
      const handle = await CapacitorApp.addListener('backButton', () => {
        if (goBackOneStep()) return;
        const now = Date.now();
        if (now - lastBackPressRef.current < 1800) {
          lastBackPressRef.current = 0;
          if (window.confirm(L('要退出 MDiabolo 吗？', 'Exit MDiabolo?'))) {
            void CapacitorApp.exitApp();
          }
          return;
        }
        lastBackPressRef.current = now;
        setSyncNotice(L('再按一次返回键确认退出。', 'Press Back again to confirm exit.'));
      });
      return handle;
    };
    const listener = attach();
    return () => {
      void listener.then(handle => handle.remove());
    };
  }, [exportQrPages.length, showImportPanel, syncPreview, showDisplaySettings, scanningDatabaseQr, screenHistory, screen, textMode]);

  if (!hydrated) {
    return <div className="startup">{T('正在载入离线比赛数据库…', 'Loading offline competition database…')}</div>;
  }

  const currentJudge = selectedJudge
    ? judges.find(judge => judge.id === selectedJudge.id) ?? selectedJudge
    : null;
  const showHeaderExitAction = screen === 'admin';

  return (
    <div className="app-shell">
      {/* Background Layer - Only background is affected by opacity */}
      {settings.customBackground && settings.customBackground.type !== 'video' && (
        <div
          className="custom-background"
          aria-hidden="true"
          style={{
            background: settings.customBackground.type === 'gradient' 
              ? settings.customBackground.value 
              : `url(${settings.customBackground.value}) center/cover no-repeat, #0d0d0e`,
            opacity: (settings.customBackground.opacity ?? 100) / 100
          }}
        />
      )}
      
      {/* Video Background */}
      {settings.customBackground?.type === 'video' && settings.customBackground.value && (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="custom-background background-video"
          aria-hidden="true"
          style={{
            objectFit: 'cover',
            opacity: (settings.customBackground.opacity ?? 50) / 100
          }}
        >
          <source src={settings.customBackground.value} />
        </video>
      )}
      <header className={`topbar ${headerCollapsed ? 'topbar-collapsed' : ''}`}>
        <div className="brand" aria-label="MDiabolo">
          <span className="brand-mark"><LogoMark className="brand-logo" /></span>
          <span><strong>MDiabolo</strong><small>{T('离线计分系统', 'Offline scoring system')}</small></span>
        </div>
        <div className={`header-actions ${showHeaderExitAction ? '' : 'header-actions-four'}`}>
          {showHeaderExitAction && (
            <button
              className="sync-action header-logout-button"
              onClick={() => logout()}
              aria-label={L('登出', 'Logout')}
              title={L('登出', 'Logout')}
            >
              <LogOut size={15} />
              <span>{T('登出', 'Logout')}</span>
            </button>
          )}
          <button
            className="sync-action"
            onClick={() => void openExportDatabaseQr()}
            aria-label={L('导出数据库 QR', 'Export database QR')}
          >
            <Download size={15} />
            <span>{T('导出QR', 'Export QR')}</span>
          </button>
          <button
            className="sync-action"
            onClick={() => setShowImportPanel(true)}
            aria-label={L('导入数据库 QR', 'Import database QR')}
          >
            <Upload size={15} />
            <span>{T('导入', 'Import')}</span>
          </button>
          <button
            className="display-toggle language-toggle"
            onClick={() => setTextMode(value => nextTextMode(value))}
            aria-label={textModeLabel(textMode)}
            title={textModeLabel(textMode)}
          >
            <Languages size={17} aria-hidden="true" />
            <span aria-hidden="true">{textModeShortLabel(textMode)}</span>
          </button>
          <button
            className="display-toggle"
            onClick={() => setShowDisplaySettings(value => !value)}
            aria-expanded={showDisplaySettings}
            aria-label={L('显示与字体设置', 'Display and font settings')}
          >
            <span aria-hidden="true">A</span>
          </button>
        </div>
        {syncNotice && (
          <button className="header-notice" onClick={() => setSyncNotice('')} aria-label={L('关闭同步提示', 'Close sync notice')}>
            <span>{syncNotice}</span><span aria-hidden="true">×</span>
          </button>
        )}
        {showDisplaySettings && (
          <div className="display-popover" role="dialog" aria-label={L('显示设置', 'Display settings')}>
            <div className="display-popover-heading">
              <strong>{T('字体大小', 'Font size')}</strong>
              <output>{fontScale}%</output>
            </div>
            <input
              type="range"
              min="80"
              max="140"
              step="5"
              value={fontScale}
              onChange={event => setFontScale(Number(event.target.value))}
              aria-label={L('调整字体大小', 'Adjust font size')}
            />
            <div className="display-presets">
              {[90, 100, 115, 130].map(size => (
                <button key={size} className={fontScale === size ? 'active' : ''} onClick={() => setFontScale(size)}>
                  {size}%
                </button>
              ))}
            </div>
            <button className={`simple-mode-toggle ${simpleMode ? 'active' : ''}`} onClick={() => setSimpleMode(value => !value)}>
              {simpleMode ? T('简易模式开启', 'Simple mode on') : T('简易模式关闭', 'Simple mode off')}
            </button>
            <small>{T('只保存在这台设备上', 'Saved only on this device')}</small>
          </div>
        )}
      </header>

      {scanningDatabaseQr && (
        <div className="barcode-scanner-modal" role="dialog" aria-live="polite" aria-label={L('正在扫描同步 QR', 'Scanning sync QR')}>
          <div className="scanner-frame">
            <QrCode size={42} />
            <strong>{T('对准 Animated QR', 'Point at animated QR')}</strong>
            <span>
              {scannerProgress
                ? T(`已收到 ${scannerProgress.scanned}/${scannerProgress.total} 帧`, `Received ${scannerProgress.scanned}/${scannerProgress.total} frames`)
                : T('等待第一帧', 'Waiting for first frame')}
            </span>
          </div>
          <button className="secondary-button scanner-stop-button" onClick={() => void stopDatabaseQrScanner()}>
            {T('停止扫码', 'Stop scanner')}
          </button>
        </div>
      )}

      {exportQrPages.length > 0 && (
        <div className="modal-backdrop" role="presentation" onClick={() => setExportQrPages([])}>
          <div className="modal-card qr-card simple-qr-card" role="dialog" aria-modal="true" aria-label={L('导出 QR', 'Export QR')} onClick={event => event.stopPropagation()}>
            <h2>{T('同步 QR', 'Sync QR')}</h2>
            <p>{exportQrPages.length > 1 ? T('另一台手机点「导入」后保持相机对准这里，QR 会自动播放。', 'Tap Import on the other phone and keep the camera pointed here. The QR plays automatically.') : T('另一台手机点「导入」扫描这一张 QR。', 'Tap Import on the other phone and scan this QR.')}</p>
            <div className="sync-source-card">
              <span><strong>{T('来源设备', 'Source device')}</strong>{syncDeviceName.trim() || T('MDiabolo 设备', 'MDiabolo device')}</span>
              <span><strong>{T('导出者', 'Exporter')}</strong>{syncExporterName.trim() || T('未填写', 'Not set')}</span>
            </div>
            <strong className="qr-page-label">{exportQrPages.length > 1 ? T(`自动 ${exportQrPages[exportPageIndex]?.index ?? 1}/${exportQrPages[exportPageIndex]?.total ?? 1}`, `Auto ${exportQrPages[exportPageIndex]?.index ?? 1}/${exportQrPages[exportPageIndex]?.total ?? 1}`) : T('单张', 'Single')}</strong>
            {exportQrPages[exportPageIndex] && <img src={exportQrPages[exportPageIndex].dataUrl} alt={L('数据库同步 QR', 'Database sync QR')} />}
            <small>{T('包含本机可同步的数据；导入时会先让你确认冲突。', 'Includes syncable data from this device. Import will ask you to review conflicts first.')}</small>
            <div className="qr-export-actions">
              <button className="secondary-button" onClick={() => void copyExportQrData()}>{T('复制导入数据', 'Copy import data')}</button>
            </div>
            <textarea
              className="qr-data-copy"
              readOnly
              rows={3}
              value={exportQrPages.map(page => page.data).join('\n')}
              onFocus={event => event.currentTarget.select()}
              onClick={event => event.currentTarget.select()}
              aria-label={L('可复制的导入数据', 'Copyable import data')}
            />
            <button className="primary-button" onClick={() => setExportQrPages([])}>{T('完成', 'Done')}</button>
          </div>
        </div>
      )}
      {showImportPanel && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowImportPanel(false)}>
          <div className="modal-card import-card" role="dialog" aria-modal="true" aria-label={L('导入数据库', 'Import database')} onClick={event => event.stopPropagation()}>
            <h2>{T('导入 QR', 'Import QR')}</h2>
            <p>{T('扫描对方手机上的同步 QR。', 'Scan the sync QR on the other phone.')}</p>
            <button className="primary-button" onClick={() => void scanDatabaseQr()}><QrCode size={18} />{T('打开相机扫码', 'Open camera scanner')}</button>
            <textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder="MDACTB|... / MDDBZ|..." rows={5} />
            <button className="secondary-button" disabled={!importText.trim()} onClick={() => void importDatabaseQrPayload(importText)}>{T('粘贴导入', 'Import pasted data')}</button>
          </div>
        </div>
      )}

      {syncPreview && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setSyncPreview(null); setShowSyncDetails(false); }}>
          <div className="modal-card sync-preview-card" role="dialog" aria-modal="true" aria-label={L('确认 QR 同步', 'Confirm QR sync')} onClick={event => event.stopPropagation()}>
            <h2>{T('确认 QR 同步', 'Confirm QR sync')}</h2>
            <p>{T('导入前先检查差异。新增记录会加入本机；修改或删除必须由你确认。', 'Review changes before import. New records will be added; edits or deletes require your confirmation.')}</p>
            <div className="sync-source-card">
              <span><strong>{T('来源设备', 'Source device')}</strong>{syncPreview.syncPackage?.sourceDeviceName || T('未标记', 'Not labeled')}</span>
              <span><strong>{T('导出者', 'Exporter')}</strong>{syncPreview.syncPackage?.exporterName || T('未填写', 'Not set')}</span>
              <span><strong>{T('导出时间', 'Exported at')}</strong>{new Date(syncPreview.syncPackage?.exportedAt ?? syncPreview.snapshot.exportedAt).toLocaleString()}</span>
            </div>
            <div className="sync-preview-summary">
              <span><strong>{syncPreview.incomingOnlyCount}</strong>{T('新增', 'New')}</span>
              <span><strong>{syncPreview.deleteCount}</strong>{T('删除', 'Deletes')}</span>
              <span><strong>{syncPreview.sameCount}</strong>{T('相同', 'Same')}</span>
              <span><strong>{syncPreview.conflicts.length}</strong>{T('冲突', 'Conflicts')}</span>
            </div>
            <button className="secondary-button sync-detail-toggle" onClick={() => setShowSyncDetails(value => !value)}>
              {showSyncDetails ? L('收起整合详情', 'Hide integration details') : L('查看整合详情', 'Review integration details')}
            </button>
            {showSyncDetails && (
              <div className="sync-group-list">
                {syncPreview.groups
                  .filter(group => group.incomingOnlyCount || group.conflictCount || group.deleteCount || group.sameCount)
                  .map(group => (
                    <article className="sync-group-card" key={group.entity}>
                      <h3>{group.label}</h3>
                      <div className="sync-group-metrics">
                        <span><strong>{group.incomingOnlyCount}</strong>{T('新增', 'New')}</span>
                        <span><strong>{group.conflictCount}</strong>{T('冲突', 'Conflicts')}</span>
                        <span><strong>{group.deleteCount}</strong>{T('删除', 'Deletes')}</span>
                        <span><strong>{group.sameCount}</strong>{T('相同', 'Same')}</span>
                      </div>
                      {group.newItems.length > 0 && (
                        <ul className="sync-new-list">
                          {group.newItems.slice(0, 8).map(item => <li key={item.key}>{item.summary}</li>)}
                          {group.newItems.length > 8 && <li>{L(`还有 ${group.newItems.length - 8} 笔`, `${group.newItems.length - 8} more`)}</li>}
                        </ul>
                      )}
                    </article>
                  ))}
              </div>
            )}
            {syncPreview.conflicts.length > 0 ? (
              <div className="conflict-list">
                {syncPreview.conflicts.map(conflict => (
                  <article className="conflict-card" key={conflict.key}>
                    <h3>{conflict.label}</h3>
                    <div className="conflict-version">
                      <strong>{T('本机版本', 'This device')}</strong>
                      <span>{conflict.localSummary}</span>
                    </div>
                    <div className="conflict-version">
                      <strong>{T('QR 版本', 'QR version')}</strong>
                      <span>{conflict.incomingSummary}</span>
                    </div>
                    {conflict.differences.length > 0 && (
                      <div className="conflict-diff-list">
                        {conflict.differences.map(diff => (
                          <div className="conflict-diff" key={`${conflict.key}-${diff.field}`}>
                            <strong>{diff.field}</strong>
                            <span>{diff.local}</span>
                            <span>{diff.incoming}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {conflict.recommendationReason && <small className="conflict-recommendation">{conflict.recommendationReason}</small>}
                    <div className="conflict-actions">
                      <button
                        className={syncPreview.decisions[conflict.key] !== 'incoming' ? 'primary-button' : 'secondary-button'}
                        onClick={() => setSyncPreview(current => current && ({
                          ...current,
                          decisions: { ...current.decisions, [conflict.key]: 'local' }
                        }))}
                      >
                        {T('保留本机', 'Keep local')}
                      </button>
                      <button
                        className={syncPreview.decisions[conflict.key] === 'incoming' ? 'primary-button' : 'secondary-button'}
                        onClick={() => setSyncPreview(current => current && ({
                          ...current,
                          decisions: { ...current.decisions, [conflict.key]: 'incoming' }
                        }))}
                      >
                        {T('接受 QR', 'Accept QR')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">{syncPreview.incomingOnlyCount > 0 ? L('没有冲突，可以直接导入新增记录。', 'No conflicts. New records can be imported safely.') : L('没有需要同步的新内容。', 'Nothing new needs to be synced.')}</div>
            )}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setSyncPreview(null); setShowSyncDetails(false); }}>{T('取消', 'Cancel')}</button>
              <button className="primary-button" onClick={applySyncPreview}>{T('确认保存', 'Save selected')}</button>
            </div>
          </div>
        </div>
      )}

      <main className="page">
        {screen === 'role' && (
          <section className="welcome">
            <div className="current-competition">
              <small>{T('当前赛事', 'Current event')}</small>
              <strong>{activeEvent ? displayNameNode(activeEvent) : T('管理员尚未选择', 'Not selected by administrator')}</strong>
            </div>
            <div className="eyebrow">{T('比赛现场入口', 'Competition access')}</div>
            <h1>{T('选择你的身份', 'Choose your role')}</h1>
            <p>{T('所有评分会先保存在本机。即使断网，也不会中断比赛。', 'All scores are saved on this device first. The competition continues even without internet.')}</p>
            <div className="role-grid">
              <button className="role-card" onClick={() => goToScreen('judge-select')}>
                <UserRound aria-hidden="true" />
                <span><strong>{T('我是裁判', 'I am a judge')}</strong><small>{T('选择姓名后开始评分', 'Select your name to start scoring')}</small></span>
              </button>
              <button className="role-card" onClick={() => goToScreen('admin')}>
                <Settings2 aria-hidden="true" />
                <span><strong>{T('管理员', 'Administrator')}</strong><small>{T('管理比赛、人员与排名', 'Manage competitions, people and rankings')}</small></span>
              </button>
            </div>
          </section>
        )}

        {screen === 'judge-select' && (
          <section className="narrow">
            <div className="section-heading">
              <div><div className="eyebrow">{T('裁判入口', 'Judge access')}</div><h1>{T('请选择姓名', 'Select your name')}</h1></div>
            </div>
            <div className="stack">
              {judges.map(judge => (
                <button
                  className="list-button"
                  key={judge.id}
                  onClick={() => { setSelectedJudge(judge); goToScreen('judge'); }}
                >
                  <span><strong>{personNameNode(judge)}</strong><small>{judge.id}</small></span>
                  <span className="tag">{judge.role === 'Technical' ? L('技术裁判', 'Technical') : L('评分裁判', 'Scoring')}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === 'judge' && currentJudge && (
          <JudgePanel
            judge={currentJudge}
            competitions={competitions}
            athletes={athletes}
            scores={scores}
            faults={faults}
            onSaveScore={saveScore}
            onSaveFault={saveFault}
            onRegisterBackHandler={registerContextualBackHandler}
            language={language}
            textMode={textMode}
          />
        )}

        {screen === 'admin' && (
          <AdminPanel
            athletes={athletes}
            competitions={competitions}
            judges={judges}
            events={events}
            scores={scores}
            faults={faults}
            admins={admins}
            online={online}
            language={language}
            settings={settings}
            onChangeAthletes={value => update<Athlete[]>('athletes', setAthletes, value)}
            onChangeCompetitions={value => update<Competition[]>('competitions', setCompetitions, value)}
            onChangeJudges={value => update<Judge[]>('judges', setJudges, value)}
            onChangeEvents={value => update<EventConfig[]>('events', setEvents, value)}
            onChangeAdmins={value => update<AdminAccount[]>('admins', setAdmins, value)}
            onChangeSettings={value => update<AppSettings>('settings', setSettings, value)}
            onSaveScore={saveScore}
            onSaveFault={saveFault}
            databaseSnapshot={databaseSnapshot()}
            integrationHistory={integrationHistory}
            syncDeviceName={syncDeviceName}
            syncExporterName={syncExporterName}
            onChangeSyncDeviceName={setSyncDeviceName}
            onChangeSyncExporterName={setSyncExporterName}
            onRegisterBackHandler={registerContextualBackHandler}
            onLogout={logout}
            textMode={textMode}
          />
        )}
      </main>
    </div>
  );
}
