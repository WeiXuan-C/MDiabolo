import React, { useState, useEffect } from 'react';
import { Athlete, Competition, Judge, ScoreSubmission, FaultSubmission } from '../initialData';
import { Sliders, CheckCircle, RefreshCw, QrCode, AlertTriangle, Play, ArrowLeft, Plus, Minus, Check } from 'lucide-react';
import QRCode from 'qrcode';

interface JudgePanelProps {
  judge: Judge;
  competitions: Competition[];
  athletes: Athlete[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  onAddScore: (score: ScoreSubmission) => void;
  onAddFault: (fault: FaultSubmission) => void;
  onLogout: () => void;
}

export default function JudgePanel({
  judge,
  competitions,
  athletes,
  scores,
  faults,
  onAddScore,
  onAddFault,
  onLogout
}: JudgePanelProps) {
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  
  // Scoring dimensions state
  const [dimValues, setDimValues] = useState<{ [key: string]: number }>({});
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [qrString, setQrString] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Faults technical state
  const [faultCount, setFaultCount] = useState<number>(0);

  // Set default competition
  useEffect(() => {
    const activeComps = competitions.filter(c => c.status === 'Active');
    if (activeComps.length > 0 && !selectedComp) {
      setSelectedComp(activeComps[0]);
    }
  }, [competitions, selectedComp]);

  // Handle active dimensions based on comp type
  const getDimensionsConfig = (type: Competition['type']) => {
    switch (type) {
      case 'Individual Stage':
        return [
          { key: 'action_difficulty', label: 'Action Difficulty (動作難度)', max: 30 },
          { key: 'stage_artistry', label: 'Stage Artistry (舞台藝術)', max: 30 },
          { key: 'action_creativity', label: 'Action Creativity (動作創意)', max: 30 },
          { key: 'action_fluency', label: 'Action Fluency (動作流暢)', max: 30 },
          { key: 'costume_styling', label: 'Costume Styling (服裝造型)', max: 10 }
        ];
      case 'Duo/Team Stage':
        return [
          { key: 'action_difficulty', label: 'Action Difficulty (動作難度)', max: 30 },
          { key: 'stage_artistry', label: 'Stage Artistry (舞台藝術)', max: 30 },
          { key: 'action_interaction', label: 'Action Interaction (動作互動)', max: 30 },
          { key: 'action_creativity', label: 'Action Creativity (動作創意)', max: 30 },
          { key: 'costume_styling', label: 'Costume Styling (服裝造型)', max: 10 }
        ];
      case 'Challenge':
        return [
          { key: 'action_difficulty', label: 'Action Difficulty (動作難度)', max: 30 },
          { key: 'action_creativity', label: 'Action Creativity (動作創意)', max: 30 },
          { key: 'action_fluency', label: 'Action Fluency (動作流暢)', max: 30 }
        ];
    }
  };

  // Check if an athlete has been scored/submitted already by this judge
  const isAthleteScored = (athId: string) => {
    if (judge.role === 'Technical') {
      return faults.some(f => f.competitionId === selectedComp?.id && f.athleteId === athId);
    }
    return scores.some(s => s.competitionId === selectedComp?.id && s.athleteId === athId && s.judgeId === judge.id);
  };

  const getAthleteScoreSummary = (athId: string) => {
    if (judge.role === 'Technical') {
      const f = faults.find(f => f.competitionId === selectedComp?.id && f.athleteId === athId);
      return f ? `${f.faultsCount} Faults` : 'Not recorded';
    }
    const s = scores.find(s => s.competitionId === selectedComp?.id && s.athleteId === athId && s.judgeId === judge.id);
    return s ? `${s.totalScore.toFixed(1)} Pts` : 'Not scored';
  };

  // Open scoring for an athlete
  const handleStartScoring = (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    if (judge.role === 'Technical') {
      const existing = faults.find(f => f.competitionId === selectedComp?.id && f.athleteId === athlete.id);
      setFaultCount(existing ? existing.faultsCount : 0);
    } else {
      const config = getDimensionsConfig(selectedComp!.type);
      const existing = scores.find(s => s.competitionId === selectedComp?.id && s.athleteId === athlete.id && s.judgeId === judge.id);
      
      const initialValues: { [key: string]: number } = {};
      config.forEach(dim => {
        if (existing) {
          initialValues[dim.key] = (existing.dimensions as any)[dim.key] || 0;
        } else {
          // Default to half of the max
          initialValues[dim.key] = dim.max / 2;
        }
      });
      setDimValues(initialValues);
    }
  };

  // Sum scoring dimensions
  const calculateTotal = (): number => {
    return (Object.values(dimValues) as number[]).reduce((sum: number, val: number) => sum + val, 0);
  };

  const generateQrAndOpen = async (data: string) => {
    try {
      setQrString(data);
      const url = await QRCode.toDataURL(data, {
        margin: 2,
        width: 256,
        color: {
          dark: '#FF4E00',
          light: '#0D0D0D'
        }
      });
      setQrUrl(url);
      setIsSyncModalOpen(true);
    } catch (err) {
      console.error('Failed to generate QR', err);
    }
  };

  // Submit Score
  const handleSubmitScore = async () => {
    if (!selectedComp || !selectedAthlete) return;

    const total = calculateTotal();
    const newSubmission: ScoreSubmission = {
      id: `${selectedComp.id}_${selectedAthlete.id}_${judge.id}`,
      competitionId: selectedComp.id,
      athleteId: selectedAthlete.id,
      judgeId: judge.id,
      judgeName: judge.name,
      dimensions: dimValues as any,
      totalScore: total,
      submittedAt: new Date().toISOString()
    };

    onAddScore(newSubmission);

    // Format highly condensed string for QR transfer
    // Format: type|comp_id|athlete_id|judge_id|judge_name|scores_joined_by_comma|total_score
    const dimensionKeys = getDimensionsConfig(selectedComp.type).map(d => d.key);
    const scoreListStr = dimensionKeys.map(k => dimValues[k]).join(',');
    const condensedData = `SCORE|${selectedComp.id}|${selectedAthlete.id}|${judge.id}|${judge.name}|${scoreListStr}|${total}`;

    await generateQrAndOpen(condensedData);
  };

  // Submit Faults
  const handleSubmitFaults = async () => {
    if (!selectedComp || !selectedAthlete) return;

    const newFault: FaultSubmission = {
      id: `${selectedComp.id}_${selectedAthlete.id}_tech`,
      competitionId: selectedComp.id,
      athleteId: selectedAthlete.id,
      faultsCount: faultCount,
      deductionAmount: faultCount * 0.5,
      submittedAt: new Date().toISOString()
    };

    onAddFault(newFault);

    // Format condensed string for QR faults transfer
    // Format: type|comp_id|athlete_id|fault_count
    const condensedData = `FAULT|${selectedComp.id}|${selectedAthlete.id}|${faultCount}`;

    await generateQrAndOpen(condensedData);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(qrString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeDimensions = selectedComp ? getDimensionsConfig(selectedComp.type) : [];

  return (
    <div id="judge-root-container" className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#0D0D0D]">
      
      {/* Sidebar: Judge Profile & Competition Selection */}
      <aside id="judge-sidebar" className="w-full md:w-[320px] bg-[#121212] border-b md:border-b-0 md:border-r border-[#222] p-6 flex flex-col shrink-0 overflow-y-auto">
        <div id="judge-profile-header" className="mb-6 pb-6 border-b border-[#222]">
          <span className="text-[10px] uppercase tracking-widest text-[#666] leading-none">Scoring Operator</span>
          <h2 className="text-xl font-bold text-white mt-1">{judge.name}</h2>
          <div className="flex gap-2 items-center mt-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${judge.role === 'Technical' ? 'bg-[#FF4E00]/10 text-[#FF4E00] border-[#FF4E00]/30' : 'bg-green-500/10 text-green-400 border-green-500/30'}`}>
              ROLE: {judge.role.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 bg-[#222] text-[#999] rounded text-[10px] border border-[#333]">ID: #{judge.id}</span>
          </div>
        </div>

        {/* Competition Selector */}
        {!selectedAthlete && (
          <div id="comp-select-container" className="mb-6">
            <label className="text-[10px] uppercase tracking-widest text-[#666] block mb-2">Select Active Competition</label>
            <div className="space-y-2">
              {competitions.map(comp => (
                <button
                  key={comp.id}
                  id={`comp-btn-${comp.id}`}
                  onClick={() => setSelectedComp(comp)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedComp?.id === comp.id
                      ? 'bg-[#1A1A1A] border-[#FF4E00] text-white'
                      : 'bg-[#161616] border-[#222] text-[#999] hover:bg-[#1A1A1A] hover:text-[#CCC]'
                  }`}
                >
                  <p className="text-xs font-mono text-[#FF4E00] mb-0.5">{comp.id}</p>
                  <p className="text-sm font-medium leading-snug">{comp.name}</p>
                  <span className="inline-block mt-2 px-1.5 py-0.5 bg-[#222] text-[#666] text-[9px] rounded uppercase font-mono tracking-wider">
                    {comp.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Athlete Mini-Profile (When scoring) */}
        {selectedAthlete && selectedComp && (
          <div id="active-athlete-profile" className="mb-4 md:mb-6 space-y-3 md:space-y-4 bg-[#141414] md:bg-transparent p-3 md:p-0 rounded-xl border border-[#222] md:border-0">
            {/* Desktop Aspect Square vs Mobile Compact Row */}
            <div className="hidden md:flex aspect-square w-full bg-[#1A1A1A] rounded-xl border border-[#333] flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 flex items-center justify-center">
                 <div className="w-40 h-40 border-[8px] border-[#FF4E00] rounded-full"></div>
              </div>
              <span className="text-[9px] uppercase tracking-[0.2em] text-[#666] mb-2 font-mono">Athlete Identity</span>
              <span className="text-3xl font-mono font-bold text-white mb-1">#{selectedAthlete.order}</span>
              <span className="px-2 py-0.5 bg-[#222] text-[#FF4E00] rounded text-[10px] border border-[#333] font-mono">ID: {selectedAthlete.id}</span>
            </div>

            {/* Mobile Compact Horizontal Row */}
            <div className="flex md:hidden items-center gap-3">
              <div className="w-12 h-12 bg-[#FF4E00]/10 border border-[#FF4E00]/30 rounded-lg flex flex-col items-center justify-center shrink-0 font-mono">
                <span className="text-[8px] text-[#666] uppercase leading-none">Order</span>
                <span className="text-lg font-bold text-[#FF4E00]">{selectedAthlete.order}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] uppercase tracking-widest text-[#666] block font-mono">SCORING TARGET</span>
                <p className="text-base font-bold text-white truncate leading-tight">{selectedAthlete.name}</p>
                <p className="text-[10px] text-[#888] truncate">{selectedAthlete.school} • {selectedAthlete.country}</p>
              </div>
            </div>

            <div className="hidden md:block">
              <h3 className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Athlete Name</h3>
              <p className="text-xl font-light text-white leading-tight">{selectedAthlete.name}</p>
            </div>

            <div className="hidden md:block space-y-2 pt-2 border-t border-[#222]">
              <div className="p-2 rounded bg-[#161616] border border-[#222]">
                <span className="text-[9px] uppercase tracking-widest text-[#666] block">School/Club</span>
                <p className="text-xs text-[#CCC] font-medium">{selectedAthlete.school}</p>
              </div>
              <div className="p-2 rounded bg-[#161616] border border-[#222]">
                <span className="text-[9px] uppercase tracking-widest text-[#666] block">Team Name</span>
                <p className="text-xs text-[#CCC] font-medium">{selectedAthlete.teamName || 'None'}</p>
              </div>
            </div>
          </div>
        )}

        <div id="logout-btn-container" className="mt-auto pt-6 border-t border-[#222]">
          <button
            id="judge-logout-btn"
            onClick={onLogout}
            className="w-full py-2.5 rounded-lg bg-[#222] border border-[#333] text-[11px] uppercase tracking-widest font-bold text-[#E0E0E0] hover:bg-[#FF4E00] hover:text-black hover:border-[#FF4E00] transition-colors"
          >
            Switch Identity / Exit
          </button>
        </div>
      </aside>

      {/* Main Panel: Athlete List OR Scoring Workspace */}
      <main id="judge-main" className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-6">
        
        {!selectedAthlete ? (
          // ATHLETE SELECTION LIST
          <div id="athletes-list-view" className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#222] pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#FF4E00] font-mono">ACTIVE TARGETS</span>
                <h1 className="text-2xl font-bold tracking-tight text-white">{selectedComp?.name || 'Loading Competition...'}</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] uppercase tracking-widest text-[#999] font-mono">Ready to Score</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {athletes
                .sort((a, b) => a.order - b.order)
                .map(athlete => {
                  const scored = isAthleteScored(athlete.id);
                  const summary = getAthleteScoreSummary(athlete.id);
                  return (
                    <div
                      key={athlete.id}
                      id={`athlete-card-${athlete.id}`}
                      className={`p-5 rounded-xl border flex items-center justify-between transition-all ${
                        scored 
                          ? 'bg-[#121212] border-green-500/20 opacity-80' 
                          : 'bg-[#161616] border-[#333] hover:border-[#FF4E00]/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-[#222] border border-[#333] flex flex-col items-center justify-center font-mono">
                          <span className="text-[9px] text-[#666] leading-none uppercase">Order</span>
                          <span className="text-lg font-bold text-white mt-0.5">{athlete.order}</span>
                        </div>
                        <div>
                          <p className="text-base font-medium text-white">{athlete.name}</p>
                          <p className="text-xs text-[#999]">{athlete.school} • {athlete.country}</p>
                          {scored && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-green-400 font-mono">
                              <CheckCircle size={10} /> Saved / Cached ({summary})
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        id={`score-btn-${athlete.id}`}
                        onClick={() => handleStartScoring(athlete)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                          scored
                            ? 'bg-[#222] text-[#999] border border-[#333] hover:bg-[#2A2A2A]'
                            : 'bg-[#FF4E00] text-black shadow-[0_4px_12px_rgba(255,78,0,0.2)] hover:bg-[#FF6622]'
                        }`}
                      >
                        {scored ? 'Modify / QR' : 'Score'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          // WORKSPACE: SCORING / FAULTS CONSOLE
          <div id="scoring-workspace" className="flex-1 flex flex-col justify-between">
            
            {/* Header: Back & Athlete Title */}
            <div className="flex items-center justify-between pb-4 border-b border-[#222] mb-6">
              <button
                id="back-to-athletes-btn"
                onClick={() => setSelectedAthlete(null)}
                className="flex items-center gap-2 text-[#999] hover:text-[#FF4E00] transition-colors text-xs uppercase tracking-wider font-bold"
              >
                <ArrowLeft size={16} /> Back to Athletes
              </button>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-widest text-[#666] block">COMPETITION TYPE</span>
                <span className="text-sm font-bold text-[#FF4E00] uppercase tracking-wider font-mono">{selectedComp?.type}</span>
              </div>
            </div>

            {/* SCORING LAYOUT FOR SCORING JUDGE */}
            {judge.role === 'Scoring' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeDimensions.map(dim => {
                    const currentVal = dimValues[dim.key] || 0;
                    return (
                      <div key={dim.key} className="flex flex-col gap-2 p-5 bg-[#161616] rounded-xl border border-[#222]">
                        <div className="flex justify-between items-end">
                          <label className="text-xs uppercase tracking-widest font-bold text-[#E0E0E0]">{dim.label}</label>
                          <span className="font-mono text-2xl text-[#FF4E00] font-bold">
                            {currentVal.toFixed(1)}
                            <span className="text-xs text-[#555] ml-1 font-normal">/{dim.max}</span>
                          </span>
                        </div>

                        {/* Custom visual range meter */}
                        <div className="relative mt-2">
                          <input
                            type="range"
                            min="0"
                            max={dim.max}
                            step="0.5"
                            value={currentVal}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setDimValues(prev => ({ ...prev, [dim.key]: v }));
                            }}
                            className="w-full h-11 opacity-0 absolute inset-0 cursor-pointer z-10"
                          />
                          <div className="h-11 bg-[#111] rounded-xl border border-[#333] relative flex items-center px-1 overflow-hidden">
                            {/* Orange Fill Gauge */}
                            <div 
                              className="h-8 bg-gradient-to-r from-[#FF4E00]/60 to-[#FF4E00] rounded-lg transition-all duration-75"
                              style={{ width: `${(currentVal / dim.max) * 100}%` }}
                            ></div>
                            <div 
                              className="absolute w-[4px] h-11 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-75 animate-pulse"
                              style={{ left: `calc(${(currentVal / dim.max) * 100}% - 2px)` }}
                            ></div>
                          </div>
                        </div>

                        {/* Slider Quick Adjustment Taps */}
                        <div className="flex gap-2 mt-2">
                          <button 
                            onClick={() => setDimValues(p => ({ ...p, [dim.key]: Math.max(0, currentVal - 1) }))}
                            className="h-11 flex-1 text-xs font-bold text-[#DDD] hover:text-white bg-[#1A1A1A] hover:bg-[#222] active:bg-[#FF4E00] active:text-black rounded-lg border border-[#333] hover:border-[#444] active:border-[#FF4E00] transition-all flex items-center justify-center select-none"
                          >
                            -1.0
                          </button>
                          <button 
                            onClick={() => setDimValues(p => ({ ...p, [dim.key]: Math.max(0, currentVal - 0.5) }))}
                            className="h-11 flex-1 text-xs font-bold text-[#DDD] hover:text-white bg-[#1A1A1A] hover:bg-[#222] active:bg-[#FF4E00] active:text-black rounded-lg border border-[#333] hover:border-[#444] active:border-[#FF4E00] transition-all flex items-center justify-center select-none"
                          >
                            -0.5
                          </button>
                          <button 
                            onClick={() => setDimValues(p => ({ ...p, [dim.key]: Math.min(dim.max, currentVal + 0.5) }))}
                            className="h-11 flex-1 text-xs font-bold text-[#DDD] hover:text-white bg-[#1A1A1A] hover:bg-[#222] active:bg-[#FF4E00] active:text-black rounded-lg border border-[#333] hover:border-[#444] active:border-[#FF4E00] transition-all flex items-center justify-center select-none"
                          >
                            +0.5
                          </button>
                          <button 
                            onClick={() => setDimValues(p => ({ ...p, [dim.key]: Math.min(dim.max, currentVal + 1) }))}
                            className="h-11 flex-1 text-xs font-bold text-[#DDD] hover:text-white bg-[#1A1A1A] hover:bg-[#222] active:bg-[#FF4E00] active:text-black rounded-lg border border-[#333] hover:border-[#444] active:border-[#FF4E00] transition-all flex items-center justify-center select-none"
                          >
                            +1.0
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live Running Total and Submit & Sync Block */}
                <div className="mt-8 flex flex-col md:flex-row items-center justify-between p-6 bg-[#161616] rounded-2xl border border-[#222] gap-4">
                  <div className="flex items-center gap-8 w-full md:w-auto">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#666]">Active Operator</span>
                      <span className="text-sm font-medium text-[#E0E0E0]">{judge.name}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#666]">Running Total</span>
                      <span className="text-3xl font-mono font-black text-white">
                        {calculateTotal().toFixed(1)}
                        <span className="text-xs font-normal text-[#666] ml-2 uppercase">Points</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 w-full md:w-auto justify-end">
                    <button
                      id="reset-scores-btn"
                      onClick={() => {
                        const cleared: { [key: string]: number } = {};
                        activeDimensions.forEach(d => cleared[d.key] = d.max / 2);
                        setDimValues(cleared);
                      }}
                      className="px-6 py-3 rounded-lg border border-[#333] text-[12px] uppercase tracking-widest font-bold text-[#999] hover:bg-[#222] transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      id="submit-sync-btn"
                      onClick={handleSubmitScore}
                      className="px-8 py-3 rounded-lg bg-[#FF4E00] text-black text-[12px] uppercase tracking-[0.2em] font-black shadow-[0_10px_30px_rgba(255,78,0,0.3)] hover:bg-[#FF6622] transition-all"
                    >
                      Submit & Sync
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // SCORING LAYOUT FOR TECHNICAL FAULTS JUDGE
              <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto py-6 md:py-12 gap-6 md:gap-8">
                <div className="text-center">
                  <span className="px-3 py-1 rounded bg-[#FF4E00]/10 border border-[#FF4E00]/20 text-[10px] font-mono text-[#FF4E00] uppercase tracking-[0.2em]">
                    TECHNICAL JUDGE PANELS
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-3">Faults & Mistake Tracker</h2>
                  <p className="text-sm text-[#888] mt-1 leading-snug">Tap the giant pad to log drop incidents instantly during the performance.</p>
                </div>

                <div className="p-6 md:p-8 bg-[#161616] border border-[#222] rounded-2xl w-full flex flex-col items-center gap-6">
                  {/* Faults Display */}
                  <div className="text-center">
                    <span className="text-[10px] uppercase tracking-widest text-[#666] font-mono">FAULTS COUNT</span>
                    <div className="text-7xl font-mono font-black text-white mt-2 mb-1">{faultCount}</div>
                    <span className="text-xs text-red-400 font-mono">Deduction: -{(faultCount * 0.5).toFixed(1)} Pts</span>
                  </div>

                  {/* Giant Touch Button */}
                  <button
                    id="plus-fault-btn"
                    onClick={() => setFaultCount(p => p + 1)}
                    className="w-full h-28 rounded-2xl bg-gradient-to-b from-red-600 to-red-700 text-white flex flex-col items-center justify-center gap-1 active:scale-95 active:from-red-700 active:to-red-800 transition-all shadow-[0_12px_36px_rgba(220,38,38,0.3)] select-none border border-red-500"
                  >
                    <Plus size={36} className="text-white animate-pulse" />
                    <span className="text-sm font-black uppercase tracking-[0.15em]">Record Drop / Fault (+1)</span>
                    <span className="text-[10px] text-red-200 uppercase tracking-widest leading-none">按此記落鈴扣分</span>
                  </button>

                  {/* Correction button (Minus) */}
                  <div className="flex gap-3 w-full">
                    <button
                      id="minus-fault-btn"
                      onClick={() => setFaultCount(p => Math.max(0, p - 1))}
                      className="h-12 flex-1 rounded-xl bg-[#222] border border-[#333] hover:bg-[#333] hover:text-white flex items-center justify-center gap-2 text-xs font-bold text-[#999] active:bg-red-950/20 active:text-red-400 transition-colors select-none"
                    >
                      <Minus size={14} /> Correct Fault Count (-1)
                    </button>
                  </div>
                </div>

                <button
                  id="submit-faults-btn"
                  onClick={handleSubmitFaults}
                  className="w-full py-4 rounded-xl bg-[#FF4E00] text-black text-xs uppercase tracking-[0.2em] font-black shadow-[0_10px_30px_rgba(255,78,0,0.2)] hover:bg-[#FF6622] transition-all"
                >
                  Generate Fault QR & Sync
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* QR CODE SYNCHRONIZATION MODAL */}
      {isSyncModalOpen && (
        <div id="qr-sync-modal" className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#121212] border border-[#333] rounded-2xl p-6 relative overflow-hidden flex flex-col items-center gap-6">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF4E00]"></div>
            
            <div className="text-center w-full">
              <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-[9px] uppercase font-mono tracking-widest">
                OFFLINE DATA CAPTURED SECURELY
              </span>
              <h3 className="text-lg font-bold text-white mt-2">Score QR Generated</h3>
              <p className="text-xs text-[#666] mt-1">Show this QR code to the Admin terminal to transfer this score wirelessly.</p>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-xl shadow-lg border-4 border-[#FF4E00]">
              {qrUrl ? (
                <img src={qrUrl} alt="Score QR Sync Pass" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 bg-black flex items-center justify-center text-xs text-gray-500 font-mono">Generating QR...</div>
              )}
            </div>

            {/* Condensed Code Backup */}
            <div className="w-full bg-[#161616] p-3 rounded-lg border border-[#222] text-left">
              <span className="text-[9px] uppercase tracking-widest text-[#666] block mb-1">Backup Sync Code (Click to Copy)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={qrString}
                  className="bg-transparent border-0 text-xs text-[#999] font-mono select-all flex-1 focus:outline-none overflow-x-auto"
                />
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-1 bg-[#222] border border-[#333] rounded text-[10px] font-mono text-white hover:bg-[#FF4E00] hover:text-black transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Done button */}
            <button
              id="close-qr-modal-btn"
              onClick={() => {
                setIsSyncModalOpen(false);
                setSelectedAthlete(null); // return to lists
              }}
              className="w-full py-3 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg text-xs uppercase tracking-widest font-bold text-white transition-all"
            >
              Done & Return to Athletes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
