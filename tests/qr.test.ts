import assert from 'node:assert/strict';
import test from 'node:test';
import type { FaultSubmission, ScoreSubmission } from '../src/initialData';
import {
  decodeDatabaseQrChunk,
  decodeQrRecord,
  encodeBrotliActionSyncQr,
  encodeBrotliAnimatedActionSyncQr,
  encodeDatabaseSnapshot,
  encodeQrRecord,
  mergeDatabaseSnapshots,
  mergeDatabaseSyncPayloads,
  rebuildDatabaseSnapshot,
  rebuildDatabaseSyncPayloadAsync,
  rebuildDatabaseSyncPayloadsFromTextAsync,
  type ActionSyncPackage,
  type DatabaseSnapshot
} from '../src/utils/qr';

const score: ScoreSubmission = {
  id: '比赛_预赛_选手_裁判',
  competitionId: '比赛',
  roundId: '预赛',
  athleteId: '选手',
  judgeId: '裁判',
  judgeName: '陈裁判',
  dimensions: { action_difficulty: 25, action_creativity: 24 },
  totalScore: 49,
  submittedAt: '2026-07-06T00:00:00.000Z',
  syncStatus: 'local'
};

const fault: FaultSubmission = {
  id: 'C_R_A_FAULT',
  competitionId: 'C',
  roundId: 'R',
  athleteId: 'A',
  judgeId: 'J',
  faultsCount: 2,
  deductionPerFault: 0.5,
  deductionAmount: 1,
  submittedAt: '2026-07-06T00:00:00.000Z',
  syncStatus: 'local'
};

test('round-trips a Unicode score record through QR encoding', () => {
  assert.deepEqual(decodeQrRecord(encodeQrRecord({ type: 'SCORE', record: score })), {
    type: 'SCORE',
    record: score
  });
});

test('round-trips a fault record through QR encoding', () => {
  assert.deepEqual(decodeQrRecord(encodeQrRecord({ type: 'FAULT', record: fault })), {
    type: 'FAULT',
    record: fault
  });
});

test('rejects damaged and incomplete QR records', () => {
  assert.throws(() => decodeQrRecord('MD2|SCORE|not-base64'), /damaged or incomplete/);
  assert.throws(
    () => decodeQrRecord(encodeQrRecord({ type: 'SCORE', record: { ...score, id: '' } })),
    /field "id"/
  );
});

test('round-trips a full database snapshot through paged QR chunks', () => {
  const snapshot = {
    protocol: 'mdiabolo-db-v1' as const,
    exportedAt: '2026-07-08T00:00:00.000Z',
    athletes: [{
      id: 'ATH-1',
      order: 1,
      name: 'é€‰æ‰‹',
      nameZh: 'é€‰æ‰‹',
      nameEn: 'Athlete',
      school: 'School',
      age: 18,
      gender: 'Male' as const,
      country: 'Taiwan',
      teamName: null,
      competitionIds: ['C']
    }],
    competitions: [],
    judges: [],
    events: [],
    scores: [score],
    faults: [fault],
    admins: [],
    settings: {
      activeEventId: 'E',
      customBackground: {
        type: 'image' as const,
        value: 'data:image/jpeg;base64,'.concat('A'.repeat(500)),
        opacity: 85
      }
    }
  };
  const encoded = encodeDatabaseSnapshot(snapshot, 120);
  assert.ok(encoded.length > 1);
  const scanned = encoded.map(chunk => decodeDatabaseQrChunk(chunk.data));
  assert.deepEqual(rebuildDatabaseSnapshot(scanned), snapshot);
  assert.throws(() => rebuildDatabaseSnapshot(scanned.slice(1)), /incomplete|missing/);
});

test('round-trips a brotli action sync package through pasted and paged QR data', async () => {
  const snapshot = {
    protocol: 'mdiabolo-db-v1' as const,
    exportedAt: '2026-07-08T00:00:00.000Z',
    athletes: [],
    competitions: [],
    judges: [],
    events: [],
    scores: [score],
    faults: [fault],
    admins: [],
    settings: { activeEventId: 'E' }
  };
  const syncPackage = {
    protocol: 'mdiabolo-action-sync-v1' as const,
    exportedAt: '2026-07-08T00:00:00.000Z',
    actions: Array.from({ length: 8 }, (_, index) => ({
      actionType: 'upsert',
      entityType: 'score',
      entityId: `S-${index}`,
      payload: { ...score, id: `S-${index}` },
      createdAt: '2026-07-08T00:00:00.000Z'
    })),
    snapshot
  };
  const simple = await encodeBrotliActionSyncQr(syncPackage);
  assert.ok(simple.startsWith('MDACTB|'));
  const simplePayload = await rebuildDatabaseSyncPayloadAsync([decodeDatabaseQrChunk(simple)]);
  assert.equal(simplePayload.kind, 'actions');

  const frames = await encodeBrotliAnimatedActionSyncQr(syncPackage, 90);
  assert.ok(frames.length > 1);
  assert.ok(frames[0].data.startsWith('MDACTBP|'));
  const pagedPayload = await rebuildDatabaseSyncPayloadAsync(frames.map(frame => decodeDatabaseQrChunk(frame.data)));
  assert.equal(pagedPayload.kind, 'actions');
  if (pagedPayload.kind === 'actions') {
    assert.equal(pagedPayload.package.actions.length, 8);
    assert.deepEqual(pagedPayload.package.snapshot, snapshot);
  }
});

test('automatically merges multiple judge and technical-judge packages', async () => {
  const makeSnapshot = (
    exportedAt: string,
    scores: ScoreSubmission[],
    faults: FaultSubmission[] = []
  ): DatabaseSnapshot => ({
    protocol: 'mdiabolo-db-v1',
    exportedAt,
    athletes: [],
    competitions: [],
    judges: [],
    events: [],
    scores,
    faults,
    admins: [],
    settings: { activeEventId: 'E' }
  });
  const makePackage = (
    packageId: string,
    sourceDeviceName: string,
    snapshot: DatabaseSnapshot
  ): ActionSyncPackage => ({
    protocol: 'mdiabolo-action-sync-v1',
    packageId,
    exportedAt: snapshot.exportedAt,
    sourceDeviceName,
    actions: [{
      actionType: 'upsert',
      entityType: snapshot.faults.length ? 'fault' : 'score',
      entityId: snapshot.faults[0]?.id ?? snapshot.scores[0]?.id,
      payload: snapshot.faults[0] ?? snapshot.scores[0],
      createdAt: snapshot.exportedAt
    }],
    snapshot
  });

  const judgeScores = ['J-1', 'J-2', 'J-3'].map((judgeId, index) => ({
    ...score,
    id: `S-${index + 1}`,
    judgeId,
    judgeName: `Judge ${index + 1}`,
    submittedAt: `2026-07-08T00:0${index}:00.000Z`
  }));
  const packages = [
    makePackage('PKG-J1', 'Judge device 1', makeSnapshot('2026-07-08T00:01:00.000Z', [judgeScores[0]])),
    makePackage('PKG-J2', 'Judge device 2', makeSnapshot('2026-07-08T00:02:00.000Z', [judgeScores[1]])),
    makePackage('PKG-J3', 'Judge device 3', makeSnapshot('2026-07-08T00:03:00.000Z', [judgeScores[2]])),
    makePackage('PKG-TECH', 'Technical judge device', makeSnapshot('2026-07-08T00:04:00.000Z', [], [fault]))
  ];
  const frames = await Promise.all(packages.map(syncPackage => encodeBrotliAnimatedActionSyncQr(syncPackage, 90)));
  const pastedText = frames.flat().map(frame => frame.data).join('\n');

  const decoded = await rebuildDatabaseSyncPayloadsFromTextAsync(pastedText);
  assert.equal(decoded.length, 4);
  const merged = mergeDatabaseSyncPayloads(decoded);
  assert.equal(merged.kind, 'actions');
  if (merged.kind === 'actions') {
    assert.equal(merged.package.actions.length, 0);
    assert.equal(merged.package.snapshot.scores.length, 3);
    assert.equal(merged.package.snapshot.faults.length, 1);
    assert.deepEqual(new Set(merged.package.snapshot.scores.map(item => item.judgeId)), new Set(['J-1', 'J-2', 'J-3']));
    assert.match(merged.package.packageId ?? '', /^MERGED-/);
  }
});

test('keeps local reference data while adding incoming scoring records', () => {
  const incoming: DatabaseSnapshot = {
    protocol: 'mdiabolo-db-v1',
    exportedAt: '2026-07-08T00:00:00.000Z',
    athletes: [{
      id: 'ATH-1',
      order: 1,
      name: 'Incoming name',
      school: '',
      age: 18,
      gender: 'Male',
      country: '',
      teamName: null,
      competitionIds: []
    }],
    competitions: [],
    judges: [],
    events: [],
    scores: [score],
    faults: [],
    admins: [],
    settings: { activeEventId: 'INCOMING' }
  };
  const local: DatabaseSnapshot = {
    ...incoming,
    athletes: [{ ...incoming.athletes[0], name: 'Local name' }],
    scores: [],
    settings: { activeEventId: 'LOCAL' }
  };

  const merged = mergeDatabaseSnapshots([incoming, local]);
  assert.equal(merged.athletes[0].name, 'Local name');
  assert.equal(merged.settings.activeEventId, 'LOCAL');
  assert.equal(merged.scores.length, 1);
});
