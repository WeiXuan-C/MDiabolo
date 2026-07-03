import React, { useState, useEffect } from 'react';
import { Athlete, Competition, Judge, EventConfig, ScoreSubmission, FaultSubmission, SEEDED_JUDGES } from '../initialData';
import { calculatePlaceMethodRankings, CalculatedRow } from '../utils/ranking';
import { 
  Database, Award, Users, ShieldAlert, Plus, Trash2, Edit3, Save, 
  CheckCircle, Sliders, Play, Settings, QrCode, Clipboard, AlertCircle, RefreshCw, Key
} from 'lucide-react';

interface AdminPanelProps {
  competitions: Competition[];
  athletes: Athlete[];
  judges: Judge[];
  events: EventConfig[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  activeEvent: EventConfig;
  onUpdateCompetitions: (comps: Competition[]) => void;
  onUpdateAthletes: (aths: Athlete[]) => void;
  onUpdateJudges: (jds: Judge[]) => void;
  onUpdateEvents: (evts: EventConfig[]) => void;
  onSetActiveEvent: (evt: EventConfig) => void;
  onImportScore: (score: ScoreSubmission) => void;
  onImportFault: (fault: FaultSubmission) => void;
  onLogout: () => void;
}

export default function AdminPanel({
  competitions,
  athletes,
  judges,
  events,
  scores,
  faults,
  activeEvent,
  onUpdateCompetitions,
  onUpdateAthletes,
  onUpdateJudges,
  onUpdateEvents,
  onSetActiveEvent,
  onImportScore,
  onImportFault,
  onLogout
}: AdminPanelProps) {
  // Navigation tabs: 'rankings' | 'athletes' | 'competitions' | 'judges' | 'events' | 'sync'
  const [activeTab, setActiveTab] = useState<'rankings' | 'athletes' | 'competitions' | 'judges' | 'events' | 'sync'>('rankings');
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [expandedAthleteId, setExpandedAthleteId] = useState<string | null>(null);

  // Password Login security state
  const [isLocked, setIsLocked] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [adminCount, setAdminCount] = useState(1); // Standard limitation is max 2 admins registered

  // CRUD Forms State
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
  const [newAthlete, setNewAthlete] = useState<Partial<Athlete>>({
    name: '', school: '', age: 16, gender: 'Male', country: 'Taiwan', teamName: ''
  });

  const [editingComp, setEditingComp] = useState<Competition | null>(null);
  const [newComp, setNewComp] = useState<Partial<Competition>>({
    id: '', name: '', type: 'Individual Stage', region: 'Taiwan', division: '', status: 'Draft'
  });

  const [newJudge, setNewJudge] = useState<Partial<Judge>>({
    id: '', name: '', role: 'Scoring'
  });

  const [newEvent, setNewEvent] = useState<Partial<EventConfig>>({
    id: '', name: '', poster: '', backgroundTheme: 'Ember'
  });

  // Manual code paste sync
  const [manualSyncString, setManualSyncString] = useState('');
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // Set default competition on load
  useEffect(() => {
    if (competitions.length > 0 && !selectedCompId) {
      setSelectedCompId(competitions[0].id);
    }
  }, [competitions, selectedCompId]);

  // Handle password login verification
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'mdiabolo') {
      setIsLocked(false);
      setAuthError('');
    } else {
      setAuthError('Unauthorized: Access Decryption Failure. Use "mdiabolo" to login.');
    }
  };

  const activeComp = competitions.find(c => c.id === selectedCompId) || competitions[0];

  // Scoring Judges list
  const scoringJudgesList = judges.filter(j => j.role === 'Scoring');

  // Compute ranking rows using the Place Method utility
  const rankingRows = activeComp 
    ? calculatePlaceMethodRankings(activeComp, athletes, scores, faults, scoringJudgesList) 
    : [];

  // ATHLETES CRUD
  const handleSaveAthlete = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAthlete) {
      const updated = athletes.map(a => a.id === editingAthlete.id ? editingAthlete : a);
      onUpdateAthletes(updated);
      setEditingAthlete(null);
    } else {
      if (!newAthlete.name) return;
      const nextOrder = athletes.length > 0 ? Math.max(...athletes.map(a => a.order)) + 1 : 1;
      const created: Athlete = {
        id: `ATH-${Math.floor(1000 + Math.random() * 9000)}`,
        order: nextOrder,
        name: newAthlete.name,
        school: newAthlete.school || 'Independent',
        age: Number(newAthlete.age) || 16,
        gender: (newAthlete.gender as any) || 'Male',
        country: newAthlete.country || 'Taiwan',
        teamName: newAthlete.teamName || null
      };
      onUpdateAthletes([...athletes, created]);
      setNewAthlete({ name: '', school: '', age: 16, gender: 'Male', country: 'Taiwan', teamName: '' });
    }
  };

  const handleDeleteAthlete = (id: string) => {
    onUpdateAthletes(athletes.filter(a => a.id !== id));
  };

  // COMPETITIONS CRUD
  const handleSaveComp = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingComp) {
      const updated = competitions.map(c => c.id === editingComp.id ? editingComp : c);
      onUpdateCompetitions(updated);
      setEditingComp(null);
    } else {
      if (!newComp.id || !newComp.name) return;
      const created: Competition = {
        id: newComp.id.toUpperCase().replace(/\s+/g, '-'),
        name: newComp.name,
        type: (newComp.type as any) || 'Individual Stage',
        region: newComp.region || 'Taiwan',
        division: newComp.division || 'Open Division',
        status: (newComp.status as any) || 'Draft'
      };
      onUpdateCompetitions([...competitions, created]);
      setNewComp({ id: '', name: '', type: 'Individual Stage', region: 'Taiwan', division: '', status: 'Draft' });
    }
  };

  const handleDeleteComp = (id: string) => {
    onUpdateCompetitions(competitions.filter(c => c.id !== id));
  };

  // JUDGES CRUD
  const handleSaveJudge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJudge.id || !newJudge.name) return;
    const created: Judge = {
      id: newJudge.id.toUpperCase(),
      name: newJudge.name,
      role: (newJudge.role as any) || 'Scoring'
    };
    onUpdateJudges([...judges, created]);
    setNewJudge({ id: '', name: '', role: 'Scoring' });
  };

  const handleDeleteJudge = (id: string) => {
    onUpdateJudges(judges.filter(j => j.id !== id));
  };

  // EVENTS CRUD
  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.id || !newEvent.name) return;
    const created: EventConfig = {
      id: newEvent.id.toUpperCase(),
      name: newEvent.name,
      poster: newEvent.poster || 'https://images.unsplash.com/photo-1564981797816-1043664bf78d?q=80&w=400',
      backgroundTheme: newEvent.backgroundTheme || 'Ember'
    };
    onUpdateEvents([...events, created]);
    setNewEvent({ id: '', name: '', poster: '', backgroundTheme: 'Ember' });
  };

  const handleDeleteEvent = (id: string) => {
    onUpdateEvents(events.filter(e => e.id !== id));
  };

  // MOCK DATA GENERATOR & QR IMPORT SYNC HANDLER
  const parseAndSyncString = (syncStr: string) => {
    const trimmed = syncStr.trim();
    if (!trimmed) return false;

    try {
      const parts = trimmed.split('|');
      const type = parts[0];

      if (type === 'SCORE') {
        // Format: SCORE|comp_id|athlete_id|judge_id|judge_name|scores_joined_by_comma|total_score
        const [_, compId, athleteId, judgeId, judgeName, scoresStr, totalScoreStr] = parts;
        const scoresArr = scoresStr.split(',').map(Number);
        const totalScore = Number(totalScoreStr);

        // Map dimensions dynamically based on competition type
        const comp = competitions.find(c => c.id === compId);
        if (!comp) throw new Error('Competition not found in database');

        const dimensions: { [key: string]: number } = {};
        if (comp.type === 'Individual Stage') {
          const keys = ['action_difficulty', 'stage_artistry', 'action_creativity', 'action_fluency', 'costume_styling'];
          keys.forEach((k, idx) => dimensions[k] = scoresArr[idx] || 0);
        } else if (comp.type === 'Duo/Team Stage') {
          const keys = ['action_difficulty', 'stage_artistry', 'action_interaction', 'action_creativity', 'costume_styling'];
          keys.forEach((k, idx) => dimensions[k] = scoresArr[idx] || 0);
        } else {
          const keys = ['action_difficulty', 'action_creativity', 'action_fluency'];
          keys.forEach((k, idx) => dimensions[k] = scoresArr[idx] || 0);
        }

        const newSubmission: ScoreSubmission = {
          id: `${compId}_${athleteId}_${judgeId}`,
          competitionId: compId,
          athleteId,
          judgeId,
          judgeName,
          dimensions: dimensions as any,
          totalScore,
          submittedAt: new Date().toISOString()
        };

        onImportScore(newSubmission);
        return { type: 'success' as const, msg: `Synced Judge ${judgeId} scores for Athlete ${athleteId} successfully!` };
      } else if (type === 'FAULT') {
        // Format: FAULT|comp_id|athlete_id|fault_count
        const [_, compId, athleteId, faultsCountStr] = parts;
        const faultsCount = Number(faultsCountStr);

        const newFault: FaultSubmission = {
          id: `${compId}_${athleteId}_tech`,
          competitionId: compId,
          athleteId,
          faultsCount,
          deductionAmount: faultsCount * 0.5,
          submittedAt: new Date().toISOString()
        };

        onImportFault(newFault);
        return { type: 'success' as const, msg: `Synced Technical Faults (${faultsCount}) for Athlete ${athleteId} successfully!` };
      }

      throw new Error('Unsupported sync string protocol');
    } catch (err: any) {
      return { type: 'error' as const, msg: `Sync Failed: ${err.message || 'Invalid string format'}` };
    }
  };

  const handleManualSyncSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = parseAndSyncString(manualSyncString);
    if (result) {
      setSyncStatus({ type: result.type, msg: result.msg });
      if (result.type === 'success') {
        setManualSyncString('');
      }
    } else {
      setSyncStatus({ type: 'error', msg: 'Sync string cannot be empty' });
    }
  };

  // Simulated Wireless Local Device Discovery (Instant Emulator)
  // Generates complete scored combinations instantly so user can see rankings build
  const runLocalEmulateSync = (judgeId: string, athleteId: string) => {
    const comp = activeComp;
    const athlete = athletes.find(a => a.id === athleteId);
    const judge = judges.find(j => j.id === judgeId);

    if (!comp || !athlete || !judge) return;

    if (judge.role === 'Technical') {
      const simulatedCount = Math.floor(Math.random() * 4);
      const str = `FAULT|${comp.id}|${athlete.id}|${simulatedCount}`;
      const result = parseAndSyncString(str);
      if (result) setSyncStatus(result);
    } else {
      const difficulty = 18 + Math.random() * 11.5;
      const artistry = 18 + Math.random() * 11.5;
      const creativity = 18 + Math.random() * 11.5;
      const fluency = comp.type !== 'Duo/Team Stage' ? (18 + Math.random() * 11.5) : undefined;
      const interaction = comp.type === 'Duo/Team Stage' ? (18 + Math.random() * 11.5) : undefined;
      const costume = comp.type !== 'Challenge' ? (5 + Math.random() * 4.5) : undefined;

      const scoresList = [difficulty, artistry, interaction, creativity, fluency, costume].filter(v => v !== undefined) as number[];
      const total = scoresList.reduce((sum, v) => sum + v, 0);

      const str = `SCORE|${comp.id}|${athlete.id}|${judge.id}|${judge.name}|${scoresList.map(v => v.toFixed(1)).join(',')}|${total.toFixed(1)}`;
      const result = parseAndSyncString(str);
      if (result) setSyncStatus(result);
    }
  };

  if (isLocked) {
    return (
      <div id="admin-lock-screen" className="flex-1 flex flex-col items-center justify-center bg-[#0D0D0D] p-4 text-center">
        <div className="w-full max-w-sm bg-[#121212] border border-[#333] rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF4E00]"></div>
          
          <div className="w-14 h-14 bg-[#FF4E00]/10 border border-[#FF4E00]/30 rounded-full flex items-center justify-center text-[#FF4E00] mx-auto mb-4">
            <Key size={24} />
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">Admin Terminal Decryption</h2>
          <p className="text-xs text-[#666] mt-1.5 mb-6 leading-relaxed">
            Authentication is required to unlock tournament parameters, rankings compilation, and database configurations.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-left">
              <label className="text-[10px] uppercase tracking-widest text-[#666] block mb-1.5 font-mono">Terminal Passphrase</label>
              <input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-[#161616] border border-[#333] rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF4E00] transition-colors"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-400 font-mono text-left bg-red-950/20 border border-red-900/40 p-2.5 rounded">
                {authError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-[#FF4E00] text-black font-black uppercase text-xs tracking-widest rounded-lg shadow-[0_10px_20px_rgba(255,78,0,0.15)] hover:bg-[#FF6622] transition-all"
            >
              Decrypt Terminal
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#222] text-center">
            <span className="text-[10px] text-[#444] font-mono">PASS: mdiabolo • MAX ADMIN DEVICE CAPACITY: 2</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="admin-root-container" className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#0D0D0D]">
      
      {/* SIDEBAR NAVIGATION */}
      <aside id="admin-sidebar" className="w-full md:w-[240px] bg-[#121212] border-b md:border-b-0 md:border-r border-[#222] p-4 md:p-5 shrink-0 flex flex-col overflow-y-auto">
        {/* Title block - hidden on small mobile screen, visible on tablet (md) */}
        <div className="hidden md:block mb-6 pb-4 border-b border-[#222]">
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono leading-none">ROOT ACCESS</span>
          <h2 className="text-lg font-bold text-white mt-1">Admin Dashboard</h2>
          <span className="text-[10px] text-green-400 font-mono flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Terminal Authenticated
          </span>
        </div>

        {/* Mobile Header block - only on small screens */}
        <div className="flex md:hidden justify-between items-center mb-3">
          <div>
            <span className="text-[8px] uppercase tracking-widest text-[#FF4E00] font-mono">ADMIN SYSTEM</span>
            <h2 className="text-base font-bold text-white leading-tight">Control Panel</h2>
          </div>
          <button
            onClick={() => setIsLocked(true)}
            className="px-3 py-1 bg-red-950/20 text-red-400 hover:text-red-300 border border-red-900/40 rounded text-[9px] uppercase font-mono font-bold tracking-widest active:scale-95 transition-all"
          >
            Lock
          </button>
        </div>

        <nav className="flex flex-row md:flex-col overflow-x-auto md:overflow-visible gap-1 md:gap-2 pb-2 md:pb-0 scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('rankings')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'rankings' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <Award size={13} /> Rankings
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'sync' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <QrCode size={13} /> Sync Data
          </button>
          <button
            onClick={() => setActiveTab('athletes')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'athletes' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <Users size={13} /> Athletes
          </button>
          <button
            onClick={() => setActiveTab('competitions')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'competitions' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <Database size={13} /> Contests
          </button>
          <button
            onClick={() => setActiveTab('judges')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'judges' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <Sliders size={13} /> Judges
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-lg flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-wider font-bold transition-all shrink-0 ${
              activeTab === 'events' ? 'bg-[#1D1614] text-[#FF4E00] border-b-2 md:border-b-0 md:border-l-2 border-[#FF4E00]' : 'text-[#888] hover:bg-[#1A1A1A] hover:text-[#CCC]'
            }`}
          >
            <Settings size={13} /> Events
          </button>
        </nav>

        <div className="hidden md:block pt-4 border-t border-[#222] mt-auto">
          <button
            onClick={() => setIsLocked(true)}
            className="w-full py-2 bg-[#222] hover:bg-red-950/20 hover:text-red-400 hover:border-red-900/30 border border-[#333] rounded-lg text-[10px] uppercase tracking-widest font-bold text-[#999] transition-colors"
          >
            Lock Dashboard
          </button>
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <main id="admin-main-view" className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-6">

        {/* TAB 1: RANKINGS & PLACE METHOD */}
        {activeTab === 'rankings' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#222] pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">OFFLINE RANKING SYSTEMS</span>
                <h1 className="text-2xl font-bold tracking-tight text-white">Place Method Matrix (席次法評分盤)</h1>
              </div>
              
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#999] font-mono">Competition Select:</label>
                <select
                  value={selectedCompId}
                  onChange={(e) => setSelectedCompId(e.target.value)}
                  className="bg-[#161616] border border-[#333] text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#FF4E00] font-mono"
                >
                  {competitions.map(c => (
                    <option key={c.id} value={c.id}>{c.id} ({c.type})</option>
                  ))}
                </select>
              </div>
            </div>

             {/* Desktop & Tablet Standings Grid (Place Method) */}
             <div className="hidden md:block bg-[#121212] border border-[#222] rounded-xl overflow-x-auto">
               <div className="p-4 bg-[#161616] border-b border-[#222] flex justify-between items-center">
                 <div className="flex gap-4 text-xs font-mono text-[#666]">
                   <span>COMP: {activeComp?.name}</span>
                   <span>|</span>
                   <span>TYPE: <span className="text-[#FF4E00] font-bold">{activeComp?.type}</span></span>
                 </div>
                 <div className="text-[10px] text-green-400 font-mono bg-green-500/5 px-2.5 py-1 rounded border border-green-500/10">
                   Calculated automatically via Offline Rank Engine
                 </div>
               </div>

               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-[#222] bg-[#161616] text-[10px] uppercase tracking-widest text-[#666] font-mono">
                     <th className="p-4">Final Rank</th>
                     <th className="p-4">Order / ID</th>
                     <th className="p-4">Athlete / School</th>
                     {scoringJudgesList.map(judge => (
                       <th key={judge.id} className="p-4 text-center">{judge.name.split(' ')[0]} Place</th>
                     ))}
                     <th className="p-4 text-center">Technical Faults (Deduction)</th>
                     <th className="p-4 text-center text-[#FF4E00] font-bold">Total Places (席次和)</th>
                     <th className="p-4 text-center">Total Score (分和)</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-[#222] text-sm text-[#CCC]">
                   {rankingRows.map(row => (
                     <tr key={row.athlete.id} className="hover:bg-[#161616]/50 transition-colors">
                       <td className="p-4 font-mono font-black text-lg">
                         {row.finalRank === 1 ? (
                           <span className="text-yellow-500 font-bold flex items-center gap-1">🥇 1st</span>
                         ) : row.finalRank === 2 ? (
                           <span className="text-gray-400 font-bold flex items-center gap-1">🥈 2nd</span>
                         ) : row.finalRank === 3 ? (
                           <span className="text-amber-600 font-bold flex items-center gap-1">🥉 3rd</span>
                         ) : (
                           <span className="text-[#999]">{row.finalRank}th</span>
                         )}
                       </td>
                       <td className="p-4 font-mono text-xs">
                         <span className="text-[#666]">#{row.athlete.order}</span>
                         <span className="block text-[#444]">{row.athlete.id}</span>
                       </td>
                       <td className="p-4">
                         <p className="font-bold text-white">{row.athlete.name}</p>
                         <p className="text-xs text-[#666]">{row.athlete.school} ({row.athlete.country})</p>
                       </td>
                       
                       {/* Individual Judges placements */}
                       {scoringJudgesList.map(judge => {
                         const jData = row.scoresByJudge[judge.id];
                         return (
                           <td key={judge.id} className="p-4 text-center font-mono">
                             {jData ? (
                               <div>
                                 <span className="font-bold text-white">{jData.score.toFixed(1)}</span>
                                 <span className="block text-[10px] text-[#FF4E00]">Rank: {jData.rank}</span>
                               </div>
                             ) : (
                               <span className="text-[#444]">-</span>
                             )}
                           </td>
                         );
                       })}

                       {/* Technical Faults deduction info */}
                       <td className="p-4 text-center font-mono">
                         <span className="text-white font-bold">{row.faultsCount} faults</span>
                         <span className="block text-[10px] text-red-400">-{row.deduction.toFixed(1)} pts</span>
                       </td>

                       {/* Total Places (席次和) */}
                       <td className="p-4 text-center font-mono text-base font-black text-white bg-[#1D1614]">
                         {row.totalPlaces.toFixed(1)}
                       </td>

                       {/* Total Score */}
                       <td className="p-4 text-center font-mono text-xs text-[#888]">
                         {row.totalScore.toFixed(1)} pts
                       </td>
                     </tr>
                   ))}

                   {rankingRows.length === 0 && (
                     <tr>
                       <td colSpan={5 + scoringJudgesList.length} className="p-8 text-center text-[#555] font-mono">
                         No participating athletes registered in this competition yet.
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>

             {/* Smartphone Standing Cards (Place Method) */}
             <div className="block md:hidden space-y-3">
               <div className="p-3 bg-[#161616] border border-[#222] rounded-xl flex justify-between items-center text-xs font-mono text-[#888]">
                 <span>COMP: {activeComp?.name}</span>
                 <span className="text-[10px] text-green-400 font-mono bg-green-500/5 px-2 py-0.5 rounded border border-green-500/10">
                   Auto Calculated
                 </span>
               </div>

               {rankingRows.map(row => {
                 const isExpanded = expandedAthleteId === row.athlete.id;
                 return (
                   <div 
                     key={row.athlete.id}
                     className="bg-[#121212] border border-[#222] rounded-xl p-4 flex flex-col gap-3 transition-all"
                   >
                     {/* Rank Row */}
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                         <span className="text-xl font-mono font-black shrink-0">
                           {row.finalRank === 1 ? '🥇 1st' : row.finalRank === 2 ? '🥈 2nd' : row.finalRank === 3 ? '🥉 3rd' : `${row.finalRank}th`}
                         </span>
                         <div className="min-w-0">
                           <p className="font-bold text-white text-sm leading-tight truncate">{row.athlete.name}</p>
                           <p className="text-[11px] text-[#666] truncate">#{row.athlete.order} • {row.athlete.school}</p>
                         </div>
                       </div>

                       <div className="text-right shrink-0">
                         <span className="text-[9px] uppercase tracking-widest text-[#666] block font-mono">PLACES (席次和)</span>
                         <span className="text-lg font-black text-[#FF4E00] font-mono leading-none">{row.totalPlaces.toFixed(1)}</span>
                       </div>
                     </div>

                     {/* Key Stats Row */}
                     <div className="grid grid-cols-2 gap-2 bg-[#161616] p-2 rounded-lg text-xs border border-[#222]/50 font-mono">
                       <div>
                         <span className="text-[#666] block text-[9px] uppercase">TOTAL POINTS (分和)</span>
                         <span className="text-[#CCC] font-bold">{row.totalScore.toFixed(1)} Pts</span>
                       </div>
                       <div>
                         <span className="text-[#666] block text-[9px] uppercase">TECH FAULTS</span>
                         <span className="text-red-400 font-bold">{row.faultsCount} faults (-{row.deduction.toFixed(1)})</span>
                       </div>
                     </div>

                     {/* Expand Details Trigger */}
                     <button
                       onClick={() => setExpandedAthleteId(isExpanded ? null : row.athlete.id)}
                       className="w-full py-2 bg-[#181818] hover:bg-[#222] border border-[#222] rounded-lg text-[10px] uppercase font-mono font-bold tracking-widest text-[#999] hover:text-white transition-all flex items-center justify-center gap-1 active:scale-95"
                     >
                       {isExpanded ? 'Hide Placements ▲' : 'Show Judge Placements ▼'}
                     </button>

                     {/* Expanded Placings Drawer */}
                     {isExpanded && (
                       <div className="border-t border-[#222]/80 pt-3 space-y-2 animate-fade-in">
                         <span className="text-[9px] uppercase tracking-widest text-[#666] block font-mono mb-1">INDIVIDUAL JUDGES:</span>
                         <div className="grid grid-cols-1 gap-1.5">
                           {scoringJudgesList.map(judge => {
                             const jData = row.scoresByJudge[judge.id];
                             return (
                               <div key={judge.id} className="flex justify-between items-center text-xs bg-[#161616] px-3 py-2 rounded border border-[#222]/40 font-mono">
                                 <span className="text-[#888]">{judge.name}</span>
                                 <div className="text-right flex items-center gap-2">
                                   <span className="text-[#AAA]">{jData ? `${jData.score.toFixed(1)} Pts` : '-'}</span>
                                   <span className="px-2 py-0.5 bg-[#FF4E00]/10 text-[#FF4E00] rounded text-[10px] font-bold border border-[#FF4E00]/20">
                                     Rank: {jData ? jData.rank : '-'}
                                   </span>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}
                   </div>
                 );
               })}

               {rankingRows.length === 0 && (
                 <div className="p-8 text-center text-[#555] font-mono text-xs bg-[#121212] border border-[#222] rounded-xl">
                   No participating athletes registered in this competition yet.
                 </div>
               )}
             </div>

            {/* Explanatory box on the Place Method */}
            <div className="p-5 bg-[#161616] border border-[#222] rounded-xl flex items-start gap-4">
              <AlertCircle className="text-[#FF4E00] shrink-0 mt-0.5" size={18} />
              <div className="text-xs leading-relaxed text-[#888]">
                <h4 className="font-bold text-white mb-1">About the Place Method (席次法說明)</h4>
                <p className="mb-2">
                  1. Each individual scoring judge scores athletes independently on active dimensions.
                </p>
                <p className="mb-2">
                  2. For each judge, athletes are ranked descending from 1 to N. Tie scores are averaged (e.g., sharing 1st & 2nd place yields rank 1.5).
                </p>
                <p className="mb-2">
                  3. The **Total Places (席次和)** is the sum of ranks from all judges. The athlete with the **lowest** Total Places is ranked 1st overall.
                </p>
                <p>
                  4. **Tiebreakers**: 1st Tiebreaker: Highest Total Score sum. 2nd Tiebreaker: Least recorded technical faults.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DATA SYNC & TRANSFER */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            <div className="border-b border-[#222] pb-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">OFFLINE DATA INTEGRITY</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">QR Sync & Data Center (數據同步中心)</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* PASTE COMPONENT */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Paste Score / Fault Sync Code</h3>
                  <p className="text-xs text-[#666] mt-1">Paste the backup text sync code copied from any Judge's device screen to import scores instantly.</p>
                </div>

                <form onSubmit={handleManualSyncSubmit} className="space-y-4">
                  <textarea
                    rows={4}
                    placeholder="e.g. SCORE|INTL-2026-IND|ATH-0821|J-01|Marcus Wong|26.5,24.0,25.5,23.0,8.5|107.5"
                    value={manualSyncString}
                    onChange={(e) => setManualSyncString(e.target.value)}
                    className="w-full bg-[#161616] border border-[#333] rounded-lg p-3 text-xs text-[#CCC] font-mono focus:outline-none focus:border-[#FF4E00]"
                  />

                  {syncStatus && (
                    <div className={`p-3 rounded text-xs font-mono border ${
                      syncStatus.type === 'success' 
                        ? 'bg-green-950/20 text-green-400 border-green-500/20' 
                        : 'bg-red-950/20 text-red-400 border-red-500/20'
                    }`}>
                      {syncStatus.msg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#FF4E00] text-black font-black uppercase text-xs tracking-widest rounded-lg hover:bg-[#FF6622] transition-all"
                  >
                    Sync This Record
                  </button>
                </form>
              </div>

              {/* SIMULATION CONTROLLER (IMPORTANT FOR USER PLAY TESTING IN SANDBOX) */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[#FF4E00] uppercase tracking-wider">Local Wireless Emulator</h3>
                  <p className="text-xs text-[#666] mt-1">In an offline environment, judges scan their QR codes. For testing inside this browser window, select a target below to instantly simulate a wireless score sync!</p>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-[#666] font-mono block">Simulate Synchronization For Athlete:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {athletes.map(ath => (
                      <div key={ath.id} className="p-2.5 bg-[#161616] border border-[#222] rounded-lg flex flex-col gap-2">
                        <span className="text-xs font-bold text-white block truncate">{ath.name}</span>
                        <div className="flex flex-col gap-1.5">
                          {judges.map(judge => (
                            <button
                              key={judge.id}
                              onClick={() => runLocalEmulateSync(judge.id, ath.id)}
                              className="w-full py-1 bg-[#222] hover:bg-[#FF4E00]/10 border border-[#333] hover:border-[#FF4E00]/40 rounded text-[9px] font-mono text-left px-2 truncate text-[#999] hover:text-white transition-all"
                            >
                              Sync {judge.id} ({judge.role === 'Technical' ? 'Faults' : 'Score'})
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ATHLETES MANAGEMENT */}
        {activeTab === 'athletes' && (
          <div className="space-y-6">
            <div className="border-b border-[#222] pb-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">ATHLETE DATABASE</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Manage Competitors</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Athlete Form */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4 self-start">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {editingAthlete ? 'Edit Athlete Record' : 'Add New Athlete'}
                </h3>

                <form onSubmit={handleSaveAthlete} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Athlete Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chen Wei Ting"
                      value={editingAthlete ? editingAthlete.name : newAthlete.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingAthlete) setEditingAthlete({ ...editingAthlete, name: v });
                        else setNewAthlete({ ...newAthlete, name: v });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">School / Club</label>
                    <input
                      type="text"
                      placeholder="e.g. Taipei Association"
                      value={editingAthlete ? editingAthlete.school : newAthlete.school}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingAthlete) setEditingAthlete({ ...editingAthlete, school: v });
                        else setNewAthlete({ ...newAthlete, school: v });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Age</label>
                      <input
                        type="number"
                        value={editingAthlete ? editingAthlete.age : newAthlete.age}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (editingAthlete) setEditingAthlete({ ...editingAthlete, age: v });
                          else setNewAthlete({ ...newAthlete, age: v });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Gender</label>
                      <select
                        value={editingAthlete ? editingAthlete.gender : newAthlete.gender}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (editingAthlete) setEditingAthlete({ ...editingAthlete, gender: v as any });
                          else setNewAthlete({ ...newAthlete, gender: v as any });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Co-ed">Co-ed</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Country</label>
                      <input
                        type="text"
                        placeholder="e.g. Taiwan"
                        value={editingAthlete ? editingAthlete.country : newAthlete.country}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (editingAthlete) setEditingAthlete({ ...editingAthlete, country: v });
                          else setNewAthlete({ ...newAthlete, country: v });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Team Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Elite Alpha"
                        value={editingAthlete ? (editingAthlete.teamName || '') : (newAthlete.teamName || '')}
                        onChange={(e) => {
                          const v = e.target.value || '';
                          if (editingAthlete) setEditingAthlete({ ...editingAthlete, teamName: v || null });
                          else setNewAthlete({ ...newAthlete, teamName: v || null });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-[#FF4E00] text-black font-bold uppercase text-xs rounded hover:bg-[#FF6622]"
                    >
                      {editingAthlete ? 'Save Changes' : 'Register Athlete'}
                    </button>
                    {editingAthlete && (
                      <button
                        type="button"
                        onClick={() => setEditingAthlete(null)}
                        className="px-3 py-2 bg-[#222] text-[#999] border border-[#333] rounded uppercase text-xs hover:bg-[#333]"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Athletes list table */}
              <div className="lg:col-span-2 bg-[#121212] border border-[#222] rounded-xl overflow-hidden">
                <div className="p-4 bg-[#161616] border-b border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-[#666] font-mono font-bold">ATHLETE DIRECTORY</span>
                  <span className="px-2 py-0.5 bg-[#222] text-[#999] font-mono text-[10px] rounded border border-[#333]">
                    {athletes.length} Registered Athletes
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616]/50 text-[#666] font-mono uppercase">
                        <th className="p-3 text-center">Order</th>
                        <th className="p-3">ID</th>
                        <th className="p-3">Competitor Details</th>
                        <th className="p-3">Country / Team</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222] text-[#CCC]">
                      {athletes
                        .sort((a, b) => a.order - b.order)
                        .map(athlete => (
                          <tr key={athlete.id} className="hover:bg-[#161616]/30 transition-colors">
                            <td className="p-3 text-center font-mono font-bold text-white text-sm">{athlete.order}</td>
                            <td className="p-3 font-mono text-[#666]">{athlete.id}</td>
                            <td className="p-3">
                              <p className="font-bold text-white">{athlete.name}</p>
                              <p className="text-[#888]">{athlete.school} • {athlete.age}y.o ({athlete.gender})</p>
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{athlete.country}</p>
                              <p className="text-[#666] font-mono">{athlete.teamName || 'Independent'}</p>
                            </td>
                            <td className="p-3">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => setEditingAthlete(athlete)}
                                  className="p-1.5 bg-[#222] hover:bg-[#333] text-[#CCC] rounded hover:text-white"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteAthlete(athlete.id)}
                                  className="p-1.5 bg-[#222] hover:bg-red-950/20 text-red-400 rounded hover:text-red-300"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: COMPETITIONS MANAGEMENT */}
        {activeTab === 'competitions' && (
          <div className="space-y-6">
            <div className="border-b border-[#222] pb-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">CONTEST DIRECTORY</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Manage Competitions</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Competition Form */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4 self-start">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {editingComp ? 'Edit Competition' : 'Add New Competition'}
                </h3>

                <form onSubmit={handleSaveComp} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Manual ID Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INTL-2026-IND"
                      value={editingComp ? editingComp.id : newComp.id}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingComp) setEditingComp({ ...editingComp, id: v });
                        else setNewComp({ ...newComp, id: v });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00] font-mono uppercase"
                      disabled={!!editingComp}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. International Individual Finals"
                      value={editingComp ? editingComp.name : newComp.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingComp) setEditingComp({ ...editingComp, name: v });
                        else setNewComp({ ...newComp, name: v });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Contest Type</label>
                    <select
                      value={editingComp ? editingComp.type : newComp.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingComp) setEditingComp({ ...editingComp, type: v as any });
                        else setNewComp({ ...newComp, type: v as any });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    >
                      <option value="Individual Stage">Individual Stage (個人賽 - 5 Dimensions)</option>
                      <option value="Duo/Team Stage">Duo/Team Stage (雙人/團隊賽 - 5 Dimensions)</option>
                      <option value="Challenge">Challenge (挑戰賽 - 3 Dimensions)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Division</label>
                    <input
                      type="text"
                      placeholder="e.g. Open Individual / Male"
                      value={editingComp ? editingComp.division : newComp.division}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (editingComp) setEditingComp({ ...editingComp, division: v });
                        else setNewComp({ ...newComp, division: v });
                      }}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Region</label>
                      <input
                        type="text"
                        placeholder="e.g. Malaysia"
                        value={editingComp ? editingComp.region : newComp.region}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (editingComp) setEditingComp({ ...editingComp, region: v });
                          else setNewComp({ ...newComp, region: v });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Status</label>
                      <select
                        value={editingComp ? editingComp.status : newComp.status}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (editingComp) setEditingComp({ ...editingComp, status: v as any });
                          else setNewComp({ ...newComp, status: v as any });
                        }}
                        className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Active">Active</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-[#FF4E00] text-black font-bold uppercase text-xs rounded hover:bg-[#FF6622]"
                    >
                      {editingComp ? 'Save Changes' : 'Create Contest'}
                    </button>
                    {editingComp && (
                      <button
                        type="button"
                        onClick={() => setEditingComp(null)}
                        className="px-3 py-2 bg-[#222] text-[#999] border border-[#333] rounded uppercase text-xs hover:bg-[#333]"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Competitions lists table */}
              <div className="lg:col-span-2 bg-[#121212] border border-[#222] rounded-xl overflow-hidden">
                <div className="p-4 bg-[#161616] border-b border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-[#666] font-mono font-bold">COMPETITIONS DIRECTORY</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616]/50 text-[#666] font-mono uppercase">
                        <th className="p-3">ID Code</th>
                        <th className="p-3">Competition Details</th>
                        <th className="p-3">Region / Division</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222] text-[#CCC]">
                      {competitions.map(comp => (
                        <tr key={comp.id} className="hover:bg-[#161616]/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-white text-sm">{comp.id}</td>
                          <td className="p-3">
                            <p className="font-bold text-white">{comp.name}</p>
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-[#222] text-[#666] text-[9px] rounded uppercase font-mono font-bold tracking-wider">
                              {comp.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{comp.region}</p>
                            <p className="text-[#666]">{comp.division}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold border ${
                              comp.status === 'Active' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : comp.status === 'Completed'
                                  ? 'bg-[#FF4E00]/10 text-[#FF4E00] border-[#FF4E00]/20'
                                  : 'bg-[#222] text-[#666] border-[#333]'
                            }`}>
                              {comp.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => setEditingComp(comp)}
                                className="p-1.5 bg-[#222] hover:bg-[#333] text-[#CCC] rounded hover:text-white"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteComp(comp.id)}
                                className="p-1.5 bg-[#222] hover:bg-red-950/20 text-red-400 rounded hover:text-red-300"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: JUDGES REGISTRY */}
        {activeTab === 'judges' && (
          <div className="space-y-6">
            <div className="border-b border-[#222] pb-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">OPERATOR ACCREDITATION</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Manage Judges & Observers</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Judge Form */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4 self-start">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Accredit New Judge</h3>

                <form onSubmit={handleSaveJudge} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Judge ID Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. J-04"
                      value={newJudge.id}
                      onChange={(e) => setNewJudge({ ...newJudge, id: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00] font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Connor"
                      value={newJudge.name}
                      onChange={(e) => setNewJudge({ ...newJudge, name: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Judge Role</label>
                    <select
                      value={newJudge.role}
                      onChange={(e) => setNewJudge({ ...newJudge, role: e.target.value as any })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    >
                      <option value="Scoring">Scoring Judge (評審 - Scores active dimensions)</option>
                      <option value="Technical">Technical Judge (技術失誤裁判 - Logs drop faults)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-[#FF4E00] text-black font-bold uppercase text-xs rounded hover:bg-[#FF6622] pt-2"
                  >
                    Accredit Operator
                  </button>
                </form>
              </div>

              {/* Judges Registry table */}
              <div className="lg:col-span-2 bg-[#121212] border border-[#222] rounded-xl overflow-hidden">
                <div className="p-4 bg-[#161616] border-b border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-[#666] font-mono font-bold">ACTIVE REGISTRY</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616]/50 text-[#666] font-mono uppercase">
                        <th className="p-3">ID Code</th>
                        <th className="p-3">Judge Name</th>
                        <th className="p-3">Assigned Role</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222] text-[#CCC]">
                      {judges.map(j => (
                        <tr key={j.id} className="hover:bg-[#161616]/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-white text-sm">{j.id}</td>
                          <td className="p-3 font-bold text-white">{j.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              j.role === 'Technical' 
                                ? 'bg-[#FF4E00]/10 text-[#FF4E00] border-[#FF4E00]/20' 
                                : 'bg-green-500/10 text-green-400 border-green-500/20'
                            }`}>
                              {j.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center">
                              <button
                                onClick={() => handleDeleteJudge(j.id)}
                                className="p-1.5 bg-[#222] hover:bg-red-950/20 text-red-400 rounded hover:text-red-300"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: CUSTOMIZABLE EVENTS */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="border-b border-[#222] pb-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">BRAND & CONTEXT SETUP</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">Custom Event Themes & Branding</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Event Form */}
              <div className="p-6 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-4 self-start">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configure New Event Theme</h3>

                <form onSubmit={handleSaveEvent} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Event ID Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ASIA-2026-SG"
                      value={newEvent.id}
                      onChange={(e) => setNewEvent({ ...newEvent, id: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00] font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Tournament Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Asia Pacific Diabolo Open"
                      value={newEvent.name}
                      onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Poster Poster Image URL</label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/photo-..."
                      value={newEvent.poster}
                      onChange={(e) => setNewEvent({ ...newEvent, poster: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00] font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[#666] uppercase font-mono tracking-widest block mb-1">Background Aesthetics Color Preset</label>
                    <select
                      value={newEvent.backgroundTheme}
                      onChange={(e) => setNewEvent({ ...newEvent, backgroundTheme: e.target.value })}
                      className="w-full bg-[#161616] border border-[#333] rounded px-3 py-2 text-white focus:outline-none focus:border-[#FF4E00]"
                    >
                      <option value="Ember">Ember Gold & Neon Orange (Aesthetic Black Theme)</option>
                      <option value="Cosmic">Cosmic Space Blue & Aurora Violet</option>
                      <option value="Terminal">Retro Industrial Terminal Green</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-[#FF4E00] text-black font-bold uppercase text-xs rounded hover:bg-[#FF6622] pt-2"
                  >
                    Register Event Brand
                  </button>
                </form>
              </div>

              {/* Events list and active switcher */}
              <div className="lg:col-span-2 bg-[#121212] border border-[#222] rounded-xl overflow-hidden">
                <div className="p-4 bg-[#161616] border-b border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-[#666] font-mono font-bold">EVENTS THEMES DIRECTORY</span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map(evt => {
                    const isActive = evt.id === activeEvent.id;
                    return (
                      <div
                        key={evt.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between h-40 relative overflow-hidden transition-all ${
                          isActive 
                            ? 'bg-gradient-to-br from-[#1D1614] to-[#121212] border-[#FF4E00] shadow-[0_8px_20px_rgba(255,78,0,0.15)]' 
                            : 'bg-[#161616] border-[#222] hover:border-[#444]'
                        }`}
                      >
                        <div>
                          <p className="text-[10px] font-mono text-[#666] mb-0.5">THEME: {evt.backgroundTheme}</p>
                          <h4 className="text-sm font-bold text-white line-clamp-2 leading-tight">{evt.name}</h4>
                          <span className="text-[10px] font-mono text-[#FF4E00] block mt-1">ID: #{evt.id}</span>
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#222]">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-mono">
                              <CheckCircle size={10} /> CURRENT ACTIVE EVENT
                            </span>
                          ) : (
                            <button
                              onClick={() => onSetActiveEvent(evt)}
                              className="px-3 py-1 bg-[#222] text-[#999] rounded text-[10px] uppercase tracking-wider font-bold hover:bg-[#FF4E00] hover:text-black transition-colors"
                            >
                              Activate Event Theme
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="p-1.5 bg-[#222]/50 hover:bg-red-950/20 text-red-400 rounded hover:text-red-300"
                            disabled={isActive}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
