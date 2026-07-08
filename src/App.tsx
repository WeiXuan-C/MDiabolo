import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Download, QrCode, Settings2, Upload, UserRound } from 'lucide-react';
import QRCode from 'qrcode';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
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
  SEEDED_FAULTS,
  SEEDED_JUDGES,
  SEEDED_SCORES,
  localizedName
} from './initialData';
import { AdminPanel } from './components/AdminPanel';
import { JudgePanel } from './components/JudgePanel';
import { loadLocal, saveLocal } from './utils/storage';
import { repository } from './utils/repository';
import { migrateAthletes, migrateCompetitions, migrateEvents, migrateJudges } from './utils/bilingual';
import {
  decodeDatabaseQrChunk,
  encodeDatabaseSnapshot,
  rebuildDatabaseSnapshot,
  type DatabaseQrChunk,
  type DatabaseSnapshot
} from './utils/qr';

type Screen = 'role' | 'judge-select' | 'judge' | 'admin';

interface ExportQrPage extends DatabaseQrChunk {
  dataUrl: string;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('role');
  const [selectedJudge, setSelectedJudge] = useState<Judge | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const language: Language = 'zh';
  const [fontScale, setFontScale] = useState<number>(() => loadLocal('fontScale', 100));
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [athletes, setAthletes] = useState(() => loadLocal('athletes', SEEDED_ATHLETES));
  const [competitions, setCompetitions] = useState(() => loadLocal('competitions', SEEDED_COMPETITIONS));
  const [judges, setJudges] = useState(() => loadLocal('judges', SEEDED_JUDGES));
  const [events, setEvents] = useState(() => loadLocal('events', SEEDED_EVENTS));
  const [scores, setScores] = useState(() => loadLocal('scores', SEEDED_SCORES));
  const [faults, setFaults] = useState(() => loadLocal('faults', SEEDED_FAULTS));
  const [admins, setAdmins] = useState<AdminAccount[]>(() => loadLocal('admins', []));
  const [settings, setSettings] = useState<AppSettings>(() => loadLocal('settings', {
    activeEventId: SEEDED_EVENTS[0]?.id ?? ''
  }));
  const [hydrated, setHydrated] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const [exportQrPages, setExportQrPages] = useState<ExportQrPage[]>([]);
  const [exportPageIndex, setExportPageIndex] = useState(0);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [databaseQrChunks, setDatabaseQrChunks] = useState<Record<string, DatabaseQrChunk[]>>({});

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const safeScale = Math.min(140, Math.max(80, fontScale));
    document.documentElement.style.setProperty('--user-font-scale', String(safeScale / 100));
    saveLocal('fontScale', safeScale);
  }, [fontScale]);

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.load('athletes', SEEDED_ATHLETES),
      repository.load('competitions', SEEDED_COMPETITIONS),
      repository.load('judges', SEEDED_JUDGES),
      repository.load('events', SEEDED_EVENTS),
      repository.load('scores', SEEDED_SCORES),
      repository.load('faults', SEEDED_FAULTS),
      repository.load<AdminAccount[]>('admins', [])
      , repository.load<AppSettings>('settings', { activeEventId: SEEDED_EVENTS[0]?.id ?? '' })
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
          storedCompetitions.find(item => item.id === storedSettings.activeCompetitionId)?.eventId ||
          storedEvents[0]?.id ||
          ''
      };
      setSettings(migratedSettings);
      void repository.save('athletes', migratedAthletes);
      void repository.save('competitions', migratedCompetitions);
      void repository.save('judges', migratedJudges);
      void repository.save('events', migratedEvents);
      void repository.save('settings', migratedSettings);
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const update = <T,>(key: string, setter: (value: T) => void, value: T) => {
    setter(value);
    saveLocal(key, value);
    void repository.save(key, value);
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

  const mergeById = <T extends { id: string; submittedAt?: string }>(local: T[], incoming: T[]) => {
    const map = new Map<string, T>();
    local.forEach(item => map.set(item.id, item));
    incoming.forEach(item => {
      const current = map.get(item.id);
      if (!current || (item.submittedAt ?? '') >= (current.submittedAt ?? '')) map.set(item.id, item);
    });
    return Array.from(map.values());
  };

  const applyDatabaseSnapshot = (snapshot: DatabaseSnapshot) => {
    const nextScores = mergeById(scores, snapshot.scores);
    const nextFaults = mergeById(faults, snapshot.faults);
    update<Athlete[]>('athletes', setAthletes, snapshot.athletes);
    update<Competition[]>('competitions', setCompetitions, snapshot.competitions);
    update<Judge[]>('judges', setJudges, snapshot.judges);
    update<EventConfig[]>('events', setEvents, snapshot.events);
    update<ScoreSubmission[]>('scores', setScores, nextScores);
    update<FaultSubmission[]>('faults', setFaults, nextFaults);
    update<AdminAccount[]>('admins', setAdmins, snapshot.admins);
    update<AppSettings>('settings', setSettings, snapshot.settings);
  };

  const openExportDatabaseQr = async () => {
    const chunks = encodeDatabaseSnapshot(databaseSnapshot());
    const pages = await Promise.all(chunks.map(async chunk => ({
      ...chunk,
      dataUrl: await QRCode.toDataURL(chunk.data, { width: 360, margin: 2, errorCorrectionLevel: 'M' })
    })));
    setExportQrPages(pages);
    setExportPageIndex(0);
    setSyncNotice(L(`数据库 QR 已生成：共 ${pages.length} 页。`, `Database QR generated: ${pages.length} pages.`));
  };

  const saveCurrentExportQrImage = async () => {
    const page = exportQrPages[exportPageIndex];
    if (!page) return;
    const link = document.createElement('a');
    link.href = page.dataUrl;
    link.download = `MDiabolo-database-${page.index}-of-${page.total}.png`;
    link.click();
  };

  const importDatabaseQrPayload = (payload: string) => {
    try {
      const chunk = decodeDatabaseQrChunk(payload);
      const existing = databaseQrChunks[chunk.id] ?? [];
      const nextChunks = [...existing.filter(item => item.index !== chunk.index), chunk];
      setDatabaseQrChunks({ ...databaseQrChunks, [chunk.id]: nextChunks });
      if (nextChunks.length < chunk.total) {
        setSyncNotice(L(`已扫描 ${nextChunks.length}/${chunk.total} 页，请继续扫描下一页。`, `Scanned ${nextChunks.length}/${chunk.total} pages. Continue scanning.`));
        return;
      }
      const snapshot = rebuildDatabaseSnapshot(nextChunks);
      applyDatabaseSnapshot(snapshot);
      setShowImportPanel(false);
      setImportText('');
      setDatabaseQrChunks({});
      setSyncNotice(L('数据库导入完成。背景、赛事、人员和成绩已同步到本机。', 'Database import complete. Background, events, people and scores are synced to this device.'));
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : L('数据库 QR 导入失败。', 'Database QR import failed.'));
    }
  };

  const scanDatabaseQr = async () => {
    try {
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
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
      const value = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
      if (!value) throw new Error(L('没有读取到 QR 数据', 'No QR data was detected'));
      importDatabaseQrPayload(value);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : L('扫码失败。', 'Scanning failed.'));
    }
  };
  const saveScore = (score: ScoreSubmission) => {
    const next = [score, ...scores.filter(item => item.id !== score.id)];
    update('scores', setScores, next);
    if (score.syncStatus !== 'synced') void repository.enqueue('score', score.id, score);
  };
  const saveFault = (fault: FaultSubmission) => {
    const next = [fault, ...faults.filter(item => item.id !== fault.id)];
    update('faults', setFaults, next);
    if (fault.syncStatus !== 'synced') void repository.enqueue('fault', fault.id, fault);
  };
  const logout = () => {
    setSelectedJudge(null);
    setScreen('role');
  };
  const activeEvent = events.find(item => item.id === settings.activeEventId);
  const L = (zh: string, en: string) => `${zh} · ${en}`;

  if (!hydrated) {
    return <div className="startup">正在载入离线比赛数据库… · Loading offline competition database…</div>;
  }

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
          <source src={settings.customBackground.value} type="video/mp4" />
        </video>
      )}
      <header className="topbar">
        <button className="brand" onClick={logout} aria-label={L('返回首页', 'Return home')}>
          <span className="brand-mark">M</span>
          <span><strong>MDiabolo</strong><small>{L('离线计分系统', 'Offline scoring system')}</small></span>
        </button>
        <div className="header-actions">
          <button
            className="sync-action"
            onClick={() => void openExportDatabaseQr()}
            aria-label={L('导出数据库 QR', 'Export database QR')}
          >
            <Download size={15} />
            <span>{L('导出QR', 'Export QR')}</span>
          </button>
          <button
            className="sync-action"
            onClick={() => setShowImportPanel(true)}
            aria-label={L('导入数据库 QR', 'Import database QR')}
          >
            <Upload size={15} />
            <span>{L('导入', 'Import')}</span>
          </button>
          <button
            className="display-toggle"
            onClick={() => setShowDisplaySettings(value => !value)}
            aria-expanded={showDisplaySettings}
            aria-label={L('显示与字体设置', 'Display and font settings')}
          >
            <span aria-hidden="true">A</span>
          </button>
          <span className={`network-pill ${online ? 'online' : ''}`}>
            {online ? <Cloud size={15} /> : <CloudOff size={15} />}
            {online ? L('在线 · 可同步', 'Online · Sync ready') : L('离线 · 本机保存', 'Offline · Saved locally')}
          </span>
        </div>
        {syncNotice && (
          <button className="header-notice" onClick={() => setSyncNotice('')} aria-label={L('关闭同步提示', 'Close sync notice')}>
            {syncNotice}
          </button>
        )}
        {showDisplaySettings && (
          <div className="display-popover" role="dialog" aria-label={L('显示设置', 'Display settings')}>
            <div className="display-popover-heading">
              <strong>{L('字体大小', 'Font size')}</strong>
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
            <small>{L('只保存在这台设备上', 'Saved only on this device')}</small>
          </div>
        )}
        {exportQrPages.length > 0 && (
          <div className="modal-backdrop" role="presentation" onClick={() => setExportQrPages([])}>
            <div className="modal-card qr-card" role="dialog" aria-modal="true" aria-label={L('导出数据库 QR', 'Export database QR')} onClick={event => event.stopPropagation()}>
              <h2>{L('导出数据库 QR', 'Export database QR')}</h2>
              <p>{L('另一台设备点击「导入」后，依序扫描所有页面。', 'On another device, tap Import and scan every page in order.')}</p>
              <strong>{L(`第 ${exportQrPages[exportPageIndex]?.index ?? 1} / ${exportQrPages[exportPageIndex]?.total ?? 1} 页`, `Page ${exportQrPages[exportPageIndex]?.index ?? 1} / ${exportQrPages[exportPageIndex]?.total ?? 1}`)}</strong>
              {exportQrPages[exportPageIndex] && <img src={exportQrPages[exportPageIndex].dataUrl} alt={L('数据库同步 QR', 'Database sync QR')} />}
              <div className="qr-page-actions">
                <button className="secondary-button" disabled={exportPageIndex === 0} onClick={() => setExportPageIndex(index => Math.max(0, index - 1))}>{L('上一页', 'Previous')}</button>
                <button className="secondary-button" disabled={exportPageIndex >= exportQrPages.length - 1} onClick={() => setExportPageIndex(index => Math.min(exportQrPages.length - 1, index + 1))}>{L('下一页', 'Next')}</button>
              </div>
              <button className="secondary-button" onClick={() => void saveCurrentExportQrImage()}>{L('保存当前 QR 图片', 'Save current QR image')}</button>
              <button className="primary-button" onClick={() => setExportQrPages([])}>{L('完成', 'Done')}</button>
            </div>
          </div>
        )}
        {showImportPanel && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowImportPanel(false)}>
            <div className="modal-card" role="dialog" aria-modal="true" aria-label={L('导入数据库', 'Import database')} onClick={event => event.stopPropagation()}>
              <h2>{L('导入数据库', 'Import database')}</h2>
              <p>{L('扫描另一台设备导出的数据库 QR。若有多页，请每页都扫描一次。', 'Scan the database QR from another device. If it has multiple pages, scan every page once.')}</p>
              <button className="primary-button" onClick={() => void scanDatabaseQr()}><QrCode size={18} />{L('打开相机扫码', 'Open camera scanner')}</button>
              <textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder="MDDB|..." rows={5} />
              <button className="secondary-button" disabled={!importText.trim()} onClick={() => importDatabaseQrPayload(importText)}>{L('粘贴导入', 'Import pasted data')}</button>
            </div>
          </div>
        )}
      </header>

      <main className="page">
        {screen === 'role' && (
          <section className="welcome">
            <div className="current-competition">
              <small>{L('当前赛事', 'Current event')}</small>
              <strong>{activeEvent ? localizedName(activeEvent, language) : L('管理员尚未选择', 'Not selected by administrator')}</strong>
            </div>
            <div className="eyebrow">{L('比赛现场入口', 'Competition access')}</div>
            <h1>{L('选择你的身份', 'Choose your role')}</h1>
            <p>{L('所有评分会先保存在本机。即使断网，也不会中断比赛。', 'All scores are saved on this device first. The competition continues even without internet.')}</p>
            <div className="role-grid">
              <button className="role-card" onClick={() => setScreen('judge-select')}>
                <UserRound aria-hidden="true" />
                <span><strong>{L('我是裁判', 'I am a judge')}</strong><small>{L('选择姓名后开始评分', 'Select your name to start scoring')}</small></span>
              </button>
              <button className="role-card" onClick={() => setScreen('admin')}>
                <Settings2 aria-hidden="true" />
                <span><strong>{L('管理员', 'Administrator')}</strong><small>{L('管理比赛、回合与排名', 'Manage competitions, rounds and rankings')}</small></span>
              </button>
            </div>
          </section>
        )}

        {screen === 'judge-select' && (
          <section className="narrow">
            <div className="section-heading">
              <div><div className="eyebrow">{L('裁判入口', 'Judge access')}</div><h1>{L('请选择姓名', 'Select your name')}</h1></div>
              <button className="text-button" onClick={() => setScreen('role')}>{L('返回', 'Back')}</button>
            </div>
            <div className="stack">
              {judges.map(judge => (
                <button
                  className="list-button"
                  key={judge.id}
                  onClick={() => { setSelectedJudge(judge); setScreen('judge'); }}
                >
                  <span><strong>{localizedName(judge, language)}</strong><small>{judge.id}</small></span>
                  <span className="tag">{judge.role === 'Technical' ? L('技术裁判', 'Technical') : L('评分裁判', 'Scoring')}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === 'judge' && selectedJudge && (
          <JudgePanel
            judge={selectedJudge}
            competitions={competitions}
            athletes={athletes}
            scores={scores}
            faults={faults}
            onSaveScore={saveScore}
            onSaveFault={saveFault}
            onLogout={logout}
            language={language}
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
            onApplyDatabaseSnapshot={applyDatabaseSnapshot}
            onLogout={logout}
          />
        )}
      </main>
    </div>
  );
}
