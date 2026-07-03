import React, { useState, useEffect } from 'react';
import { 
  Athlete, Competition, Judge, EventConfig, ScoreSubmission, FaultSubmission,
  SEEDED_ATHLETES, SEEDED_COMPETITIONS, SEEDED_JUDGES, SEEDED_EVENTS, SEEDED_SCORES, SEEDED_FAULTS
} from './initialData';
import JudgePanel from './components/JudgePanel';
import AdminPanel from './components/AdminPanel';
import { Sliders, Database, ShieldAlert, Award, QrCode, Zap, HelpCircle } from 'lucide-react';

export default function App() {
  // Identity routing: 'select_role' | 'judge_select' | 'judge' | 'admin'
  const [currentRole, setCurrentRole] = useState<'select_role' | 'judge_select' | 'judge' | 'admin'>('select_role');
  const [selectedJudge, setSelectedJudge] = useState<Judge | null>(null);

  // Core Persistent State
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [events, setEvents] = useState<EventConfig[]>([]);
  const [scores, setScores] = useState<ScoreSubmission[]>([]);
  const [faults, setFaults] = useState<FaultSubmission[]>([]);
  const [activeEvent, setActiveEvent] = useState<EventConfig | null>(null);

  // Load from local cache on mount
  useEffect(() => {
    const cachedComps = localStorage.getItem('md_competitions');
    const cachedAthletes = localStorage.getItem('md_athletes');
    const cachedJudges = localStorage.getItem('md_judges');
    const cachedEvents = localStorage.getItem('md_events');
    const cachedScores = localStorage.getItem('md_scores');
    const cachedFaults = localStorage.getItem('md_faults');
    const cachedActiveEvent = localStorage.getItem('md_active_event');

    setCompetitions(cachedComps ? JSON.parse(cachedComps) : SEEDED_COMPETITIONS);
    setAthletes(cachedAthletes ? JSON.parse(cachedAthletes) : SEEDED_ATHLETES);
    setJudges(cachedJudges ? JSON.parse(cachedJudges) : SEEDED_JUDGES);
    setEvents(cachedEvents ? JSON.parse(cachedEvents) : SEEDED_EVENTS);
    setScores(cachedScores ? JSON.parse(cachedScores) : SEEDED_SCORES);
    setFaults(cachedFaults ? JSON.parse(cachedFaults) : SEEDED_FAULTS);
    setActiveEvent(cachedActiveEvent ? JSON.parse(cachedActiveEvent) : SEEDED_EVENTS[0]);
  }, []);

  // Sync state helpers
  const saveToLocal = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleUpdateCompetitions = (newComps: Competition[]) => {
    setCompetitions(newComps);
    saveToLocal('md_competitions', newComps);
  };

  const handleUpdateAthletes = (newAthletes: Athlete[]) => {
    setAthletes(newAthletes);
    saveToLocal('md_athletes', newAthletes);
  };

  const handleUpdateJudges = (newJudges: Judge[]) => {
    setJudges(newJudges);
    saveToLocal('md_judges', newJudges);
  };

  const handleUpdateEvents = (newEvents: EventConfig[]) => {
    setEvents(newEvents);
    saveToLocal('md_events', newEvents);
  };

  const handleSetActiveEvent = (newEvent: EventConfig) => {
    setActiveEvent(newEvent);
    saveToLocal('md_active_event', newEvent);
  };

  const handleAddScore = (newScore: ScoreSubmission) => {
    const updated = [newScore, ...scores.filter(s => s.id !== newScore.id)];
    setScores(updated);
    saveToLocal('md_scores', updated);
  };

  const handleAddFault = (newFault: FaultSubmission) => {
    const updated = [newFault, ...faults.filter(f => f.id !== newFault.id)];
    setFaults(updated);
    saveToLocal('md_faults', updated);
  };

  const handleLogout = () => {
    setCurrentRole('select_role');
    setSelectedJudge(null);
  };

  if (!activeEvent) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-[#E0E0E0] flex items-center justify-center font-mono">
        LOADING CORE TOURNAMENT DATA ENGINE...
      </div>
    );
  }

  // Handle active background gradient accents
  const getThemeBgAccents = () => {
    switch (activeEvent.backgroundTheme) {
      case 'Cosmic':
        return 'from-purple-950/10 via-indigo-950/5 to-black';
      case 'Terminal':
        return 'from-emerald-950/5 via-stone-950/5 to-black';
      default: // Ember
        return 'from-orange-950/10 via-stone-950/5 to-black';
    }
  };

  return (
    <div className={`w-full min-h-screen bg-[#0D0D0D] text-[#E0E0E0] font-sans flex flex-col justify-between overflow-hidden relative`}>
      
      {/* BACKGROUND ACCENT LAYERS */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getThemeBgAccents()} pointer-events-none z-0`}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#FF4E00]/2 pointer-events-none blur-[120px] z-0"></div>

      {/* HEADER SECTION */}
      <header className="h-16 bg-[#161616]/90 border-b border-[#222] flex items-center justify-between px-6 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FF4E00] rounded-sm flex items-center justify-center font-bold text-black font-mono">M</div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#666] leading-none">MDiabolo Local</span>
            <span className="text-xs font-bold tracking-tight text-white font-mono">SCORING SYSTEM v1.0</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-widest text-[#666]">Active Brand Context</span>
            <span className="text-xs font-mono text-[#FF4E00]">{activeEvent.name}</span>
          </div>
          <div className="h-8 w-[1px] bg-[#333]"></div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[9px] uppercase tracking-widest text-[#999] font-mono">SQLite cache simulated</span>
          </div>
        </div>
      </header>

      {/* CORE ROUTING AND PANELS */}
      <main className="flex-1 flex overflow-hidden z-10 relative">
        
        {currentRole === 'select_role' && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto">
            <div className="text-center mb-8">
              <span className="px-2 py-0.5 bg-[#FF4E00]/10 text-[#FF4E00] border border-[#FF4E00]/20 rounded text-[9px] uppercase font-mono tracking-widest">
                OFFLINE TOURNAMENT HUB
              </span>
              <h1 className="text-3xl font-black text-white mt-3 uppercase tracking-tight">Select Terminal Identity</h1>
              <p className="text-xs text-[#888] mt-2 max-w-sm mx-auto leading-relaxed">
                Connect your device as a certified judge to input scores, or enter the administrator control deck to view the place standings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {/* JUDGE PORTAL SELECTOR */}
              <button
                id="select-judge-role-btn"
                onClick={() => setCurrentRole('judge_select')}
                className="p-6 bg-[#121212] border border-[#222] hover:border-[#FF4E00] hover:shadow-[0_8px_30px_rgba(255,78,0,0.1)] rounded-2xl flex flex-col items-center text-center gap-4 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center group-hover:bg-[#FF4E00]/10 group-hover:border-[#FF4E00]/20 group-hover:text-[#FF4E00] transition-colors">
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Scoring Operators</h3>
                  <p className="text-[11px] text-[#666] mt-1 leading-snug">Log dimension points & technical mistake logs directly for offline QR transfer.</p>
                </div>
              </button>

              {/* ADMIN CONTROL DECK SELECTOR */}
              <button
                id="select-admin-role-btn"
                onClick={() => setCurrentRole('admin')}
                className="p-6 bg-[#121212] border border-[#222] hover:border-[#FF4E00] hover:shadow-[0_8px_30px_rgba(255,78,0,0.1)] rounded-2xl flex flex-col items-center text-center gap-4 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[#FF4E00] flex items-center justify-center transition-colors">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Admin Terminal</h3>
                  <p className="text-[11px] text-[#666] mt-1 leading-snug">Compile standings automatically via the Place Method, and manage competitors directory.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* JUDGE IDENTITY SELECT PANEL */}
        {currentRole === 'judge_select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-sm mx-auto">
            <div className="text-center mb-6 w-full">
              <span className="text-[10px] uppercase tracking-widest text-[#FF4E00] font-mono block mb-1">ACCESS CONTROLS</span>
              <h2 className="text-xl font-bold text-white uppercase">Accredited Judge Login</h2>
              <p className="text-xs text-[#666] mt-1">Select your designated profile below to commence scoring duties.</p>
            </div>

            <div className="bg-[#121212] border border-[#222] rounded-xl p-4 w-full space-y-2">
              {judges.map(judge => (
                <button
                  key={judge.id}
                  id={`judge-login-btn-${judge.id}`}
                  onClick={() => {
                    setSelectedJudge(judge);
                    setCurrentRole('judge');
                  }}
                  className="w-full p-3.5 bg-[#161616] hover:bg-[#222] border border-[#222] hover:border-[#333] rounded-lg text-left flex justify-between items-center transition-all"
                >
                  <div>
                    <span className="font-bold text-white text-sm block">{judge.name}</span>
                    <span className="text-[9px] text-[#666] font-mono mt-0.5 block uppercase">ID Code: #{judge.id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
                    judge.role === 'Technical' 
                      ? 'bg-[#FF4E00]/10 text-[#FF4E00] border-[#FF4E00]/20' 
                      : 'bg-green-500/10 text-green-400 border-green-500/20'
                  }`}>
                    {judge.role}
                  </span>
                </button>
              ))}

              <button
                onClick={() => setCurrentRole('select_role')}
                className="w-full py-2 text-center text-xs text-[#666] hover:text-[#999] uppercase tracking-wider font-bold pt-4 block"
              >
                Cancel & Return
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE JUDGE PORTAL VIEW */}
        {currentRole === 'judge' && selectedJudge && (
          <JudgePanel
            judge={selectedJudge}
            competitions={competitions}
            athletes={athletes}
            scores={scores}
            faults={faults}
            onAddScore={handleAddScore}
            onAddFault={handleAddFault}
            onLogout={handleLogout}
          />
        )}

        {/* ACTIVE ADMIN DECK VIEW */}
        {currentRole === 'admin' && (
          <AdminPanel
            competitions={competitions}
            athletes={athletes}
            judges={judges}
            events={events}
            scores={scores}
            faults={faults}
            activeEvent={activeEvent}
            onUpdateCompetitions={handleUpdateCompetitions}
            onUpdateAthletes={handleUpdateAthletes}
            onUpdateJudges={handleUpdateJudges}
            onUpdateEvents={handleUpdateEvents}
            onSetActiveEvent={handleSetActiveEvent}
            onImportScore={handleAddScore}
            onImportFault={handleAddFault}
            onLogout={handleLogout}
          />
        )}

      </main>

      {/* FOOTER METADATA BAR */}
      <footer className="h-8 bg-[#0a0a0a] border-t border-[#1a1a1a] flex items-center justify-between px-6 shrink-0 z-10 text-[9px] text-[#444] uppercase tracking-widest font-mono">
        <div className="flex gap-4">
          <span>Session: Active Offline Cache Mode</span>
          <span>|</span>
          <span>Storage: Client-Side localStorage</span>
          <span>|</span>
          <span>Target: iPad/Mobile UI Pack</span>
        </div>
        <div>
          MDiabolo Scoring System &copy; 2026
        </div>
      </footer>
    </div>
  );
}
