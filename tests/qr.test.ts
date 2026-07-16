import assert from 'node:assert/strict';
import test from 'node:test';
import type { FaultSubmission, ScoreSubmission } from '../src/initialData';
import { decodeDatabaseQrChunk, decodeQrRecord, encodeBrotliActionSyncQr, encodeBrotliAnimatedActionSyncQr, encodeDatabaseSnapshot, encodeQrRecord, rebuildDatabaseSnapshot, rebuildDatabaseSyncPayloadAsync } from '../src/utils/qr';

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
