import type { AppSettings, FaultSubmission, ScoreSubmission } from '../initialData';

interface SyncResult {
  syncedScoreIds: string[];
  syncedFaultIds: string[];
  settings?: AppSettings;
}

export async function syncCompetitionRecords(
  scores: ScoreSubmission[],
  faults: FaultSubmission[],
  settings: AppSettings
): Promise<SyncResult> {
  const endpoint = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined;
  if (!endpoint) {
    throw new Error('尚未配置 VITE_SYNC_ENDPOINT，离线数据保持在本机。');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'mdiabolo-sync-v1',
      deviceTime: new Date().toISOString(),
      scores,
      faults,
      settings
    })
  });
  if (!response.ok) throw new Error(`同步服务器返回 ${response.status}`);
  const serverResult = await response.json().catch(() => ({})) as Partial<SyncResult>;
  return {
    syncedScoreIds: scores.map(item => item.id),
    syncedFaultIds: faults.map(item => item.id),
    settings: serverResult.settings
  };
}
