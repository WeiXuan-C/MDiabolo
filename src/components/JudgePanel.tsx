import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Save } from 'lucide-react';
import {
  type Athlete,
  type Competition,
  type FaultSubmission,
  type Judge,
  type Language,
  type ScoreDimensions,
  type ScoreSubmission,
  getDimensionsConfig,
} from '../initialData';
import { loadLocal, saveLocal } from '../utils/storage';
import { I18nText, formatText, localizedNameForMode, localizedNameNodeForMode, singleNameForMode, singleNameNodeForMode, type TextMode } from '../utils/i18n';

type AthleteSortMode = 'order' | 'name' | 'country' | 'school' | 'status';

interface JudgePanelProps {
  judge: Judge;
  competitions: Competition[];
  athletes: Athlete[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  onSaveScore: (score: ScoreSubmission) => Promise<void>;
  onSaveFault: (fault: FaultSubmission) => Promise<void>;
  onRegisterBackHandler: (handler: (() => boolean) | null) => void;
  language: Language;
  textMode: TextMode;
}

export function JudgePanel({
  judge,
  competitions,
  athletes,
  scores,
  faults,
  onSaveScore,
  onSaveFault,
  onRegisterBackHandler,
  language,
  textMode
}: JudgePanelProps) {
  const L = (zh: string, en: string) => formatText(zh, en, textMode);
  const B = (zh: string, en: string) => <I18nText zh={zh} en={en} mode={textMode} />;
  const displayName = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => localizedNameForMode(item, textMode);
  const displayNameNode = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => localizedNameNodeForMode(item, textMode);
  const personName = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => singleNameForMode(item, textMode);
  const personNameNode = (item: { name: string; nameZh?: string; nameEn?: string } | undefined) => singleNameNodeForMode(item, textMode);
  const athleteMeta = (item: Athlete) => [item.country, item.school || item.teamName].filter(Boolean).join(' · ') || L('未填写单位/国家', 'No organization/country');
  const sortRounds = (items: Competition['rounds']) => [...items].sort((left, right) => {
    const statusOrder = { Active: 0, Draft: 1, Completed: 2 } as const;
    return statusOrder[left.status] - statusOrder[right.status] || left.sequence - right.sequence;
  });
  const firstRoundId = (item: Competition | undefined) => sortRounds(item?.rounds ?? [])[0]?.id ?? '';
  const assigned = useMemo(() => competitions.filter(item =>
    item.status === 'Active' && judge.competitionIds.includes(item.id)
  ), [competitions, judge.competitionIds]);
  const [competitionId, setCompetitionId] = useState(assigned[0]?.id ?? '');
  const competition = assigned.find(item => item.id === competitionId);
  const sortedRounds = sortRounds(competition?.rounds ?? []);
  const [roundId, setRoundId] = useState(sortedRounds[0]?.id ?? '');
  const round = competition?.rounds.find(item => item.id === roundId);
  const roundStartTime = round?.startTime ? new Date(round.startTime) : null;
  const roundHasStarted = !roundStartTime || Number.isNaN(roundStartTime.getTime()) || roundStartTime.getTime() <= Date.now();
  const roundIsScorable = round?.status === 'Active' && roundHasStarted;
  const roundStatusLabel = (status: Competition['rounds'][number]['status']) => ({
    Draft: L('草稿', 'Draft'),
    Active: L('进行中', 'Active'),
    Completed: L('已完成', 'Completed')
  })[status];
  const formatScheduleTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const entrants = useMemo(
    () => athletes.filter(athlete => round?.athleteIds.includes(athlete.id)),
    [athletes, round]
  );
  const [athleteId, setAthleteId] = useState('');
  const athlete = entrants.find(item => item.id === athleteId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [faultCount, setFaultCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [savedPulse, setSavedPulse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [athleteSort, setAthleteSort] = useState<AthleteSortMode>('order');
  const dimensions = useMemo(
    () => competition ? getDimensionsConfig(competition.type) : [],
    [competition?.type]
  );

  useEffect(() => {
    const nextCompetition = assigned.find(item => item.id === competitionId) ?? assigned[0];
    if (!nextCompetition) {
      if (competitionId) setCompetitionId('');
      if (roundId) setRoundId('');
      if (athleteId) setAthleteId('');
      return;
    }
    if (nextCompetition.id !== competitionId) setCompetitionId(nextCompetition.id);
    const nextRounds = sortRounds(nextCompetition.rounds);
    const nextRound = nextRounds[0];
    if (nextRound && !nextCompetition.rounds.some(item => item.id === roundId)) {
      setRoundId(nextRound.id);
      setAthleteId('');
    }
  }, [assigned, athleteId, competitionId, roundId]);

  useEffect(() => {
    if (athleteId && !entrants.some(item => item.id === athleteId)) {
      setAthleteId('');
    }
  }, [athleteId, entrants]);

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

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    onRegisterBackHandler(() => {
      if (athleteId) {
        setAthleteId('');
        return true;
      }
      return false;
    });
    return () => onRegisterBackHandler(null);
  }, [athleteId, onRegisterBackHandler]);

  const showSaved = (message: string) => {
    setNotice(message);
    setSavedPulse(true);
    window.setTimeout(() => setSavedPulse(false), 1200);
  };

  const completed = (targetId: string) => judge.role === 'Technical'
    ? faults.some(item => item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId)
    : scores.some(item => item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId && item.judgeId === judge.id);
  const completedScoreLabel = (targetId: string) => {
    if (judge.role === 'Technical') {
      const existingFault = faults.find(item =>
        item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId
      );
      if (!existingFault) return '';
      return existingFault.deductionAmount > 0 ? `-${existingFault.deductionAmount.toFixed(1)}` : '0.0';
    }
    const existingScore = scores.find(item =>
      item.competitionId === competition?.id && item.roundId === round?.id && item.athleteId === targetId && item.judgeId === judge.id
    );
    return existingScore ? existingScore.totalScore.toFixed(1) : '';
  };
  const completedCount = entrants.filter(item => completed(item.id)).length;
  const remainingCount = Math.max(0, entrants.length - completedCount);
  const allRequiredComplete = entrants.length > 0 && completedCount === entrants.length;
  const searchText = athleteSearch.trim().toLowerCase();
  const visibleEntrants = [...entrants]
    .filter(item => !searchText || `${item.order} ${item.id} ${item.name} ${item.nameZh ?? ''} ${item.nameEn ?? ''} ${item.country} ${item.school} ${item.teamName ?? ''}`.toLowerCase().includes(searchText))
    .sort((a, b) => {
      if (athleteSort === 'status') return Number(completed(a.id)) - Number(completed(b.id)) || a.order - b.order;
      if (athleteSort === 'name') return personName(a).localeCompare(personName(b), undefined, { numeric: true, sensitivity: 'base' });
      if (athleteSort === 'country') return a.country.localeCompare(b.country, undefined, { numeric: true, sensitivity: 'base' }) || a.order - b.order;
      if (athleteSort === 'school') return a.school.localeCompare(b.school, undefined, { numeric: true, sensitivity: 'base' }) || a.order - b.order;
      return a.order - b.order;
    });

  const scoreValid = dimensions.length > 0 && dimensions.every(dimension => {
    const value = Number(values[dimension.key]);
    return values[dimension.key] !== '' && Number.isFinite(value) && value >= 0 && value <= dimension.max;
  });
  const total = dimensions.reduce((sum, dimension) => sum + (Number(values[dimension.key]) || 0), 0);

  const setDimension = (key: string, value: string, max: number) => {
    if (!competition || !round || !roundIsScorable || !athlete) return;
    const numericValue = Number(value);
    const cappedValue = value !== '' && Number.isFinite(numericValue)
      ? String(Math.min(max, Math.max(0, numericValue)))
      : value;
    const next = { ...values, [key]: cappedValue };
    setValues(next);
    saveLocal(`draft:${competition.id}_${round.id}_${athlete.id}_${judge.id}`, next);
  };

  const submitScore = async () => {
    if (!competition || !round || !athlete || !scoreValid) return;
    if (!roundIsScorable) {
      setNotice(L('此回合目前不能评分，请刷新回合状态。', 'This round is not open for scoring. Refresh the round status.'));
      return;
    }
    setSaving(true);
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
    try {
      await onSaveScore(submission);
      saveLocal(`draft:${id}`, {});
      showSaved(L('已保存 ✓', 'Saved ✓'));
      setAthleteId('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('保存失败，请重试', 'Save failed. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const submitFault = async () => {
    if (!competition || !round || !athlete) return;
    if (!roundIsScorable) {
      setNotice(L('此回合目前不能记录失误，请刷新回合状态。', 'This round is not open for fault recording. Refresh the round status.'));
      return;
    }
    setSaving(true);
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
    try {
      await onSaveFault(submission);
      showSaved(L('已保存 ✓', 'Saved ✓'));
      setAthleteId('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L('保存失败，请重试', 'Save failed. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workspace">
      <div className="section-heading">
        <div><div className="eyebrow">{judge.role === 'Technical' ? B('技术失误裁判', 'Technical judge') : B('评分裁判', 'Scoring judge')}</div><h1>{personNameNode(judge)}</h1></div>
      </div>
      {notice && <button className="notice toast-notice success" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

      {!competition ? (
        <div className="empty">{B('目前没有分配给你的进行中比赛。', 'No active competition is assigned to you.')}</div>
      ) : (
        <>
          <div className="control-grid judge-competition-grid">
            <label>{B('比赛项目', 'Competition')}<select value={competitionId} onChange={event => {
              const nextCompetition = assigned.find(item => item.id === event.target.value);
              setCompetitionId(event.target.value);
              setRoundId(firstRoundId(nextCompetition));
              setAthleteId('');
            }}>
              {assigned.map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}
            </select></label>
          </div>
          {round && roundIsScorable && (
            <div className="judge-progress-card">
              <div>
                <span>{B('参赛名单', 'Entries')}</span>
                <strong>{entrants.length}</strong>
              </div>
              <div>
                <span>{judge.role === 'Technical' ? B('已记录', 'Recorded') : B('已评分', 'Scored')}</span>
                <strong>{completedCount}</strong>
              </div>
              <div>
                <span>{B('剩余', 'Remaining')}</span>
                <strong>{remainingCount}</strong>
              </div>
              <div className={allRequiredComplete ? 'complete' : ''}>
                <span>{B('必填完成', 'Required complete')}</span>
                <strong>{allRequiredComplete ? B('是', 'Yes') : B('否', 'No')}</strong>
              </div>
            </div>
          )}

          {!round ? (
            <div className="empty">{B('此比赛还没有建立回合，请管理员先新增回合。', 'This competition has no rounds yet. Ask an administrator to add a round.')}</div>
          ) : !roundIsScorable ? (
            <div className="empty">{round.status === 'Completed'
              ? B('此回合已完成，不能再评分。', 'This round is completed and cannot be scored.')
              : round.status !== 'Active'
                ? B('此回合还在草稿状态，请管理员把回合状态改成进行中。', 'This round is still a draft. Ask an administrator to set it to Active.')
                : B(`比赛还没开始，开始时间：${formatScheduleTime(round.startTime)}`, `Competition has not started. Start time: ${formatScheduleTime(round.startTime)}`)}
            </div>
          ) : !athlete ? (
            <>
              <div className="list-tools">
                <input type="search" placeholder={L('搜索编号、姓名、国家或学校', 'Search number, name, country or school')} value={athleteSearch} onChange={event => setAthleteSearch(event.target.value)} />
                <select aria-label={L('运动员排序', 'Athlete sort')} value={athleteSort} onChange={event => setAthleteSort(event.target.value as AthleteSortMode)}>
                  <option value="order">{L('按出场顺序', 'Order')}</option>
                  <option value="status">{L('未完成优先', 'Unfinished first')}</option>
                  <option value="name">{L('按姓名', 'Name')}</option>
                  <option value="country">{L('按国家', 'Country')}</option>
                  <option value="school">{L('按学校', 'School')}</option>
                </select>
              </div>
              <div className="athlete-grid">
                {visibleEntrants.map(item => (
                  <button className="athlete-card" key={item.id} onClick={() => setAthleteId(item.id)}>
                    <span className="order">{item.order}</span>
                    <span><strong>{personNameNode(item)}</strong><small>{athleteMeta(item)}</small></span>
                  {completedScoreLabel(item.id) && <span className="score-badge" aria-label={L('已评分分数', 'Saved score')}>{completedScoreLabel(item.id)}</span>}
                </button>
              ))}
                {!entrants.length && <div className="empty">{B('此回合还没有运动员，请管理员加入参赛名单。', 'This round has no athletes yet. Ask an administrator to add entries.')}</div>}
                {entrants.length > 0 && !visibleEntrants.length && <div className="empty">{B('没有符合搜索的运动员。', 'No athletes match this search.')}</div>}
              </div>
            </>
          ) : (
            <div className="score-layout">
              <div className="score-header">
                <span className="order">{athlete.order}</span>
                <div><h2>{personNameNode(athlete)}</h2><p>{displayNameNode(competition)}</p></div>
              </div>

              {judge.role === 'Technical' ? (
                <div className="fault-card">
                  <p>{B('记录动作失误次数', 'Record technical faults')}</p>
                  <div className="counter">
                    <button disabled={saving} onClick={() => setFaultCount(Math.max(0, faultCount - 1))} aria-label={L('减少一次', 'Decrease by one')}><Minus /></button>
                    <strong>{faultCount}</strong>
                    <button disabled={saving} onClick={() => setFaultCount(faultCount + 1)} aria-label={L('增加一次', 'Increase by one')}><Plus /></button>
                  </div>
                  <div className="deduction">{B('每次', 'Each')} -{competition.faultDeduction} · {B('合计', 'Total')} -{(faultCount * competition.faultDeduction).toFixed(1)}</div>
                  <button className={`primary-button ${saving ? 'is-busy' : ''} ${savedPulse ? 'is-done saved-pulse' : ''}`} disabled={saving} aria-busy={saving} onClick={() => void submitFault()}><Save size={18} />{saving ? B('保存中', 'Saving') : savedPulse ? B('已保存', 'Saved') : B('保存', 'Save')}</button>
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
                          onChange={event => setDimension(dimension.key, event.target.value, Math.min(dimension.max, 30))}
                          aria-label={`${dimension.label}分数 · ${dimension.labelEn} score`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="submit-bar">
                    <span><small>{B('总分', 'Total')}</small><strong>{total.toFixed(1)}</strong></span>
                    <button className={`primary-button ${saving ? 'is-busy' : ''} ${savedPulse ? 'is-done saved-pulse' : ''}`} disabled={!scoreValid || saving} aria-busy={saving} onClick={() => void submitScore()}>
                      <Save size={18} />{saving ? B('保存中', 'Saving') : savedPulse ? B('已保存', 'Saved') : B('保存评分', 'Save score')}
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

