import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Minus, Plus, Save } from 'lucide-react';
import {
  type Athlete,
  type Competition,
  type FaultSubmission,
  type Judge,
  type Language,
  type ScoreDimensions,
  type ScoreSubmission,
  getDimensionsConfig,
  localizedName
} from '../initialData';
import { loadLocal, saveLocal } from '../utils/storage';

interface JudgePanelProps {
  judge: Judge;
  competitions: Competition[];
  athletes: Athlete[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  onSaveScore: (score: ScoreSubmission) => void;
  onSaveFault: (fault: FaultSubmission) => void;
  onLogout: () => void;
  language: Language;
}

export function JudgePanel({
  judge,
  competitions,
  athletes,
  scores,
  faults,
  onSaveScore,
  onSaveFault,
  onLogout,
  language
}: JudgePanelProps) {
  const L = (zh: string, en: string) => `${zh} · ${en}`;
  const assigned = competitions.filter(item =>
    item.status === 'Active' && judge.competitionIds.includes(item.id)
  );
  const [competitionId, setCompetitionId] = useState(assigned[0]?.id ?? '');
  const competition = assigned.find(item => item.id === competitionId);
  const activeRounds = competition?.rounds.filter(round => round.status === 'Active') ?? [];
  const [roundId, setRoundId] = useState(activeRounds[0]?.id ?? '');
  const round = competition?.rounds.find(item => item.id === roundId);
  const entrants = useMemo(
    () => athletes.filter(athlete => round?.athleteIds.includes(athlete.id)),
    [athletes, round]
  );
  const [athleteId, setAthleteId] = useState('');
  const athlete = entrants.find(item => item.id === athleteId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [faultCount, setFaultCount] = useState(0);
  const [notice, setNotice] = useState('');
  const dimensions = useMemo(
    () => competition ? getDimensionsConfig(competition.type) : [],
    [competition?.type]
  );

  useEffect(() => {
    const nextCompetition = assigned.find(item => item.id === competitionId) ?? assigned[0];
    if (!nextCompetition) return;
    if (nextCompetition.id !== competitionId) setCompetitionId(nextCompetition.id);
    const nextRound = nextCompetition.rounds.find(item => item.status === 'Active');
    if (nextRound && !nextCompetition.rounds.some(item => item.id === roundId && item.status === 'Active')) {
      setRoundId(nextRound.id);
      setAthleteId('');
    }
  }, [assigned, competitionId, roundId]);

  useEffect(() => {
    if (!competition || !round || !athlete) return;
    if (judge.role === 'Technical') {
      const existing = faults.find(item =>
        item.competitionId === competition.id && item.roundId === round.id && item.athleteId === athlete.id
      );
      setFaultCount(existing?.faultsCount ?? 0);
      return;
    }
    const id = `${competition.id}_${round.id}_${athlete.id}_${judge.id}`;
    const existing = scores.find(item => item.id === id);
    const draft = loadLocal<Record<string, string>>(`draft:${id}`, {});
    const next: Record<string, string> = {};
    dimensions.forEach(dimension => {
      const scoreValue = existing?.dimensions[dimension.key as keyof ScoreDimensions];
      next[dimension.key] = draft[dimension.key] ?? (scoreValue === undefined ? '' : String(scoreValue));
    });
    setValues(next);
  }, [athlete, competition, dimensions, faults, judge, round, scores]);

  const completed = (targetId: string) => judge.role === 'Technical'
    ? faults.some(item => item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId)
    : scores.some(item => item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId && item.judgeId === judge.id);

  const scoreValid = dimensions.length > 0 && dimensions.every(dimension => {
    const value = Number(values[dimension.key]);
    return values[dimension.key] !== '' && Number.isFinite(value) && value >= 0 && value <= dimension.max;
  });
  const total = dimensions.reduce((sum, dimension) => sum + (Number(values[dimension.key]) || 0), 0);

  const setDimension = (key: string, value: string) => {
    if (!competition || !round || !athlete) return;
    const next = { ...values, [key]: value };
    setValues(next);
    saveLocal(`draft:${competition.id}_${round.id}_${athlete.id}_${judge.id}`, next);
  };

  const submitScore = () => {
    if (!competition || !round || !athlete || !scoreValid) return;
    const id = `${competition.id}_${round.id}_${athlete.id}_${judge.id}`;
    const dimensionsValue = Object.fromEntries(
      dimensions.map(dimension => [dimension.key, Number(values[dimension.key])])
    ) as unknown as ScoreDimensions;
    const submission: ScoreSubmission = {
      id,
      competitionId: competition.id,
      roundId: round.id,
      athleteId: athlete.id,
      judgeId: judge.id,
      judgeName: judge.name,
      dimensions: dimensionsValue,
      totalScore: total,
      submittedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    onSaveScore(submission);
    saveLocal(`draft:${id}`, {});
    setNotice(L('已保存到本机数据库。需要同步时请用右上角导出数据库 QR。', 'Saved to this device database. Use the top-right database QR export when sync is needed.'));
  };

  const submitFault = () => {
    if (!competition || !round || !athlete) return;
    const submission: FaultSubmission = {
      id: `${competition.id}_${round.id}_${athlete.id}_FAULT`,
      competitionId: competition.id,
      roundId: round.id,
      athleteId: athlete.id,
      judgeId: judge.id,
      faultsCount: faultCount,
      deductionPerFault: competition.faultDeduction,
      deductionAmount: faultCount * competition.faultDeduction,
      submittedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    onSaveFault(submission);
    setNotice(L('失误已保存到本机数据库。', 'Fault saved to this device database.'));
  };

  return (
    <section className="workspace">
      <div className="section-heading">
        <div><div className="eyebrow">{judge.role === 'Technical' ? L('技术失误裁判', 'Technical judge') : L('评分裁判', 'Scoring judge')}</div><h1>{localizedName(judge, language)}</h1></div>
        <button className="text-button" onClick={onLogout}><ArrowLeft size={16} />{L('退出', 'Exit')}</button>
      </div>
      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}

      {!competition ? (
        <div className="empty">{L('目前没有分配给你的进行中比赛。', 'No active competition is assigned to you.')}</div>
      ) : (
        <>
          <div className="control-grid">
            <label>{L('比赛', 'Competition')}<select value={competitionId} onChange={event => setCompetitionId(event.target.value)}>
              {assigned.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
            </select></label>
            <label>{L('回合', 'Round')}<select value={roundId} onChange={event => { setRoundId(event.target.value); setAthleteId(''); }}>
              {activeRounds.map(item => <option key={item.id} value={item.id}>{localizedName(item, language)}</option>)}
            </select></label>
          </div>

          {!athlete ? (
            <div className="athlete-grid">
              {entrants.sort((a, b) => a.order - b.order).map(item => (
                <button className="athlete-card" key={item.id} onClick={() => setAthleteId(item.id)}>
                  <span className="order">{item.order}</span>
                  <span><strong>{localizedName(item, language)}</strong><small>{item.country} · {item.school}</small></span>
                  {completed(item.id) && <Check className="done" size={20} aria-label={L('已完成', 'Completed')} />}
                </button>
              ))}
            </div>
          ) : (
            <div className="score-layout">
              <button className="back-link" onClick={() => setAthleteId('')}><ArrowLeft size={16} />{L('选择其他运动员', 'Choose another athlete')}</button>
              <div className="score-header">
                <span className="order">{athlete.order}</span>
                <div><h2>{localizedName(athlete, language)}</h2><p>{localizedName(round, language)} · {localizedName(competition, language)}</p></div>
              </div>

              {judge.role === 'Technical' ? (
                <div className="fault-card">
                  <p>{L('记录动作失误次数', 'Record technical faults')}</p>
                  <div className="counter">
                    <button onClick={() => setFaultCount(Math.max(0, faultCount - 1))} aria-label={L('减少一次', 'Decrease by one')}><Minus /></button>
                    <strong>{faultCount}</strong>
                    <button onClick={() => setFaultCount(faultCount + 1)} aria-label={L('增加一次', 'Increase by one')}><Plus /></button>
                  </div>
                  <div className="deduction">{L('每次', 'Each')} -{competition.faultDeduction} · {L('合计', 'Total')} -{(faultCount * competition.faultDeduction).toFixed(1)}</div>
                  <button className="primary-button" onClick={submitFault}><Save size={18} />{L('保存', 'Save')}</button>
                </div>
              ) : (
                <>
                  <div className="dimension-list">
                    {dimensions.map(dimension => (
                      <label className="dimension" key={dimension.key}>
                        <span><strong>{language === 'zh' ? dimension.label : dimension.labelEn}</strong><small>{dimension.labelEn} · 0–{dimension.max}</small></span>
                        <input
                          inputMode="decimal"
                          type="number"
                          min="0"
                          max={dimension.max}
                          step="0.1"
                          value={values[dimension.key] ?? ''}
                          onChange={event => setDimension(dimension.key, event.target.value)}
                          aria-label={`${dimension.label}分数 · ${dimension.labelEn} score`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="submit-bar">
                    <span><small>{L('总分', 'Total')}</small><strong>{total.toFixed(1)}</strong></span>
                    <button className="primary-button" disabled={!scoreValid} onClick={submitScore}>
                      <Save size={18} />{L('保存评分', 'Save score')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

    </section>
  );
}
