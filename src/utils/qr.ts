import type {
  AdminAccount,
  AppSettings,
  Athlete,
  Competition,
  EventConfig,
  FaultSubmission,
  Judge,
  ScoreSubmission
} from '../initialData';
import LZString from 'lz-string';

type BrotliCodec = {
  compress: (input: Uint8Array, options?: { quality?: number }) => Promise<Uint8Array>;
  decompress: (input: Uint8Array) => Promise<Uint8Array>;
};

async function loadBrotli(): Promise<BrotliCodec> {
  const module = await import('brotli-compress');
  const candidate = module as unknown as Partial<BrotliCodec> & {
    default?: Partial<BrotliCodec>;
    'module.exports'?: Partial<BrotliCodec>;
  };
  const codec = candidate.compress && candidate.decompress
    ? candidate
    : candidate.default?.compress && candidate.default?.decompress
      ? candidate.default
      : candidate['module.exports'];
  if (!codec?.compress || !codec.decompress) {
    throw new Error('Brotli codec is unavailable');
  }
  return codec as BrotliCodec;
}

export type QrRecord =
  | { type: 'SCORE'; record: ScoreSubmission }
  | { type: 'FAULT'; record: FaultSubmission };

export interface DatabaseSnapshot {
  protocol: 'mdiabolo-db-v1';
  exportedAt: string;
  athletes: Athlete[];
  competitions: Competition[];
  judges: Judge[];
  events: EventConfig[];
  scores: ScoreSubmission[];
  faults: FaultSubmission[];
  admins: AdminAccount[];
  settings: AppSettings;
}

export interface DatabaseQrChunk {
  id: string;
  index: number;
  total: number;
  data: string;
}

export interface ActionLogEntry {
  id?: number;
  actionType: string;
  entityType: string;
  entityId?: string | null;
  payload: unknown;
  createdAt: string;
}

export interface ActionSyncPackage {
  protocol: 'mdiabolo-action-sync-v1';
  packageId?: string;
  exportedAt: string;
  sourceDeviceName?: string;
  exporterName?: string;
  actions: ActionLogEntry[];
  snapshot: DatabaseSnapshot;
}

export interface DecodedDatabaseQrChunk extends DatabaseQrChunk {
  complete: boolean;
}

export type SyncPayload =
  | { kind: 'snapshot'; snapshot: DatabaseSnapshot }
  | { kind: 'actions'; package: ActionSyncPackage };

function timestampValue(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeById<T extends { id: string }>(groups: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

function mergeSubmittedRecords<T extends { id: string; submittedAt: string }>(groups: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) {
      const current = merged.get(item.id);
      if (!current || timestampValue(item.submittedAt) >= timestampValue(current.submittedAt)) {
        merged.set(item.id, item);
      }
    }
  }
  return Array.from(merged.values());
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

export function mergeDatabaseSnapshots(snapshots: DatabaseSnapshot[]): DatabaseSnapshot {
  if (!snapshots.length) throw new Error('No database snapshots to merge');
  const ordered = snapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((left, right) =>
      timestampValue(left.snapshot.exportedAt) - timestampValue(right.snapshot.exportedAt) ||
      left.index - right.index
    )
    .map(item => item.snapshot);
  const latest = ordered.at(-1)!;
  return {
    protocol: 'mdiabolo-db-v1',
    exportedAt: latest.exportedAt,
    athletes: mergeById(ordered.map(snapshot => snapshot.athletes)),
    competitions: mergeById(ordered.map(snapshot => snapshot.competitions)),
    judges: mergeById(ordered.map(snapshot => snapshot.judges)),
    events: mergeById(ordered.map(snapshot => snapshot.events)),
    scores: mergeSubmittedRecords(ordered.map(snapshot => snapshot.scores)),
    faults: mergeSubmittedRecords(ordered.map(snapshot => snapshot.faults)),
    admins: mergeById(ordered.map(snapshot => snapshot.admins)),
    settings: latest.settings
  };
}

export function mergeDatabaseSyncPayloads(payloads: SyncPayload[]): SyncPayload {
  if (!payloads.length) throw new Error('No database packages to merge');
  if (payloads.length === 1) return payloads[0];

  const actionPackages = payloads
    .filter((payload): payload is Extract<SyncPayload, { kind: 'actions' }> => payload.kind === 'actions')
    .map(payload => payload.package);
  const snapshot = mergeDatabaseSnapshots(payloads.map(payload =>
    payload.kind === 'actions' ? payload.package.snapshot : payload.snapshot
  ));
  if (!actionPackages.length) return { kind: 'snapshot', snapshot };

  const packageKeys = actionPackages
    .map(syncPackage => syncPackage.packageId || `${syncPackage.sourceDeviceName ?? ''}:${syncPackage.exportedAt}`)
    .sort();
  const sourceDeviceNames = Array.from(new Set(actionPackages.map(syncPackage => syncPackage.sourceDeviceName?.trim()).filter(Boolean)));
  const exporterNames = Array.from(new Set(actionPackages.map(syncPackage => syncPackage.exporterName?.trim()).filter(Boolean)));
  const latestPackage = [...actionPackages].sort((left, right) =>
    timestampValue(left.exportedAt) - timestampValue(right.exportedAt)
  ).at(-1)!;
  return {
    kind: 'actions',
    package: {
      protocol: 'mdiabolo-action-sync-v1',
      packageId: `MERGED-${shortHash(packageKeys.join('|'))}`,
      exportedAt: latestPackage.exportedAt,
      sourceDeviceName: sourceDeviceNames.join(' + ') || undefined,
      exporterName: exporterNames.join(' + ') || undefined,
      // A multi-device field merge is additive. Deletes from one judge's
      // device must never remove records supplied by another judge.
      actions: [],
      snapshot
    }
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return base64ToBytes(base64);
}

export function encodeQrRecord(payload: QrRecord): string {
  const json = JSON.stringify(payload.record);
  return `MD2|${payload.type}|${bytesToBase64(new TextEncoder().encode(json))}`;
}

export function encodeDatabaseSnapshot(snapshot: DatabaseSnapshot, chunkSize = 1600): DatabaseQrChunk[] {
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(snapshot));
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return Array.from({ length: total }, (_, index) => ({
    id,
    index: index + 1,
    total,
    data: `MDDBZ|${id}|${index + 1}|${total}|${encoded.slice(index * chunkSize, (index + 1) * chunkSize)}`
  }));
}

export async function encodeBrotliActionSyncQr(syncPackage: ActionSyncPackage): Promise<string> {
  const { compress } = await loadBrotli();
  const compressed = await compress(new TextEncoder().encode(JSON.stringify(syncPackage)), { quality: 11 });
  return `MDACTB|${bytesToBase64Url(compressed)}`;
}

export async function encodeBrotliAnimatedActionSyncQr(syncPackage: ActionSyncPackage, chunkSize = 900): Promise<DatabaseQrChunk[]> {
  const encoded = (await encodeBrotliActionSyncQr(syncPackage)).slice('MDACTB|'.length);
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  const id = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return Array.from({ length: total }, (_, index) => ({
    id,
    index: index + 1,
    total,
    data: `MDACTBP|${id}|${index + 1}|${total}|${encoded.slice(index * chunkSize, (index + 1) * chunkSize)}`
  }));
}

function validateActionSyncPackage(parsed: Partial<ActionSyncPackage>): ActionSyncPackage {
  if (parsed.protocol !== 'mdiabolo-action-sync-v1' || !Array.isArray(parsed.actions) || !parsed.snapshot) {
    throw new Error('Action QR package is missing required data');
  }
  return parsed as ActionSyncPackage;
}

export async function decodeSimpleActionSyncQrAsync(payload: string): Promise<ActionSyncPackage> {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('MDACTB|')) throw new Error('Invalid MDiabolo action QR data');
  const { decompress } = await loadBrotli();
  const decompressed = await decompress(base64UrlToBytes(trimmed.slice('MDACTB|'.length)));
  const json = new TextDecoder().decode(decompressed);
  return validateActionSyncPackage(JSON.parse(json) as Partial<ActionSyncPackage>);
}

function requireString(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== 'string' || !record[field]) {
    throw new Error(`QR field "${field}" is missing or invalid`);
  }
}

export function decodeQrRecord(payload: string): QrRecord {
  const parts = payload.trim().split('|');
  if (parts.length !== 3 || parts[0] !== 'MD2' || !parts[2]) {
    throw new Error('Invalid MDiabolo QR data');
  }
  if (parts[1] !== 'SCORE' && parts[1] !== 'FAULT') {
    throw new Error('Unsupported QR data type');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(parts[2])));
  } catch {
    throw new Error('QR data is damaged or incomplete');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('QR record is invalid');
  }
  const record = parsed as Record<string, unknown>;
  for (const field of ['id', 'competitionId', 'roundId', 'athleteId', 'judgeId', 'submittedAt']) {
    requireString(record, field);
  }

  if (parts[1] === 'SCORE') {
    if (typeof record.totalScore !== 'number' || !Number.isFinite(record.totalScore) ||
        !record.dimensions || typeof record.dimensions !== 'object') {
      throw new Error('QR score record is invalid');
    }
    return { type: 'SCORE', record: parsed as ScoreSubmission };
  }

  for (const field of ['faultsCount', 'deductionPerFault', 'deductionAmount']) {
    if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
      throw new Error(`QR fault field "${field}" is invalid`);
    }
  }
  return { type: 'FAULT', record: parsed as FaultSubmission };
}

export function decodeDatabaseQrChunk(payload: string): DecodedDatabaseQrChunk {
  if (payload.trim().startsWith('MDACTB|')) {
    return {
      id: 'ACTION',
      index: 1,
      total: 1,
      data: payload.trim(),
      complete: true
    };
  }
  const parts = payload.trim().split('|');
  if (parts.length !== 5 || (parts[0] !== 'MDDB' && parts[0] !== 'MDDBZ' && parts[0] !== 'MDACTBP')) {
    throw new Error('Invalid MDiabolo database QR data');
  }
  const index = Number(parts[2]);
  const total = Number(parts[3]);
  if (!parts[1] || !Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total || !parts[4]) {
    throw new Error('Database QR page is damaged or incomplete');
  }
  return {
    id: parts[1],
    index,
    total,
    data: payload.trim(),
    complete: total === 1
  };
}

export function rebuildDatabaseSnapshot(chunks: DatabaseQrChunk[]): DatabaseSnapshot {
  const payload = rebuildDatabaseSyncPayload(chunks);
  return payload.kind === 'actions' ? payload.package.snapshot : payload.snapshot;
}

export function rebuildDatabaseSyncPayload(chunks: DatabaseQrChunk[]): SyncPayload {
  if (!chunks.length) throw new Error('No database QR pages scanned');
  if (chunks[0].data.trim().startsWith('MDACTB|') || chunks[0].data.trim().startsWith('MDACTBP|')) {
    throw new Error('Brotli action QR data requires async import');
  }
  const [{ id, total }] = chunks;
  const unique = new Map(chunks.filter(chunk => chunk.id === id).map(chunk => [chunk.index, chunk]));
  if (unique.size !== total) {
    throw new Error(`Database QR is incomplete: ${unique.size}/${total} pages scanned`);
  }
  const firstPayloadType = chunks[0].data.split('|')[0];
  const encoded = Array.from({ length: total }, (_, index) => {
    const chunk = unique.get(index + 1);
    if (!chunk) throw new Error(`Database QR page ${index + 1} is missing`);
    return chunk.data.split('|').at(-1) ?? '';
  }).join('');

  let parsed: unknown;
  try {
    const json = firstPayloadType === 'MDDBZ'
      ? LZString.decompressFromEncodedURIComponent(encoded)
      : new TextDecoder().decode(base64ToBytes(encoded));
    if (!json) throw new Error('empty database QR');
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Database QR data is damaged or incomplete');
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as Partial<ActionSyncPackage>).protocol === 'mdiabolo-action-sync-v1' &&
    (parsed as Partial<ActionSyncPackage>).snapshot
  ) {
    return { kind: 'actions', package: parsed as ActionSyncPackage };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Database QR snapshot is invalid');
  }
  const snapshot = parsed as Partial<DatabaseSnapshot>;
  if (snapshot.protocol !== 'mdiabolo-db-v1' ||
      !Array.isArray(snapshot.athletes) ||
      !Array.isArray(snapshot.competitions) ||
      !Array.isArray(snapshot.judges) ||
      !Array.isArray(snapshot.events) ||
      !Array.isArray(snapshot.scores) ||
      !Array.isArray(snapshot.faults) ||
      !Array.isArray(snapshot.admins) ||
      !snapshot.settings ||
      typeof snapshot.settings !== 'object') {
    throw new Error('Database QR snapshot is missing required data');
  }
  return { kind: 'snapshot', snapshot: snapshot as DatabaseSnapshot };
}

export async function rebuildDatabaseSyncPayloadAsync(chunks: DatabaseQrChunk[]): Promise<SyncPayload> {
  if (!chunks.length) throw new Error('No database QR pages scanned');
  const firstData = chunks[0].data.trim();
  if (firstData.startsWith('MDACTB|')) {
    return { kind: 'actions', package: await decodeSimpleActionSyncQrAsync(firstData) };
  }
  const firstPayloadType = firstData.split('|')[0];
  if (firstPayloadType !== 'MDACTBP') return rebuildDatabaseSyncPayload(chunks);

  const [{ id, total }] = chunks;
  const unique = new Map(chunks.filter(chunk => chunk.id === id).map(chunk => [chunk.index, chunk]));
  if (unique.size !== total) {
    throw new Error(`Database QR is incomplete: ${unique.size}/${total} pages scanned`);
  }
  const encoded = Array.from({ length: total }, (_, index) => {
    const chunk = unique.get(index + 1);
    if (!chunk) throw new Error(`Database QR page ${index + 1} is missing`);
    return chunk.data.split('|').at(-1) ?? '';
  }).join('');

  let parsed: unknown;
  try {
    const { decompress } = await loadBrotli();
    const decompressed = await decompress(base64UrlToBytes(encoded));
    parsed = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    throw new Error('Database QR data is damaged or incomplete');
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as Partial<ActionSyncPackage>).protocol === 'mdiabolo-action-sync-v1' &&
    (parsed as Partial<ActionSyncPackage>).snapshot
  ) {
    return { kind: 'actions', package: validateActionSyncPackage(parsed as Partial<ActionSyncPackage>) };
  }
  throw new Error('Database QR snapshot is missing required data');
}

export async function rebuildDatabaseSyncPayloadsFromTextAsync(payload: string): Promise<SyncPayload[]> {
  const lines = payload
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('No database QR pages scanned');

  const groups = new Map<string, DatabaseQrChunk[]>();
  let simplePackageIndex = 0;
  for (const line of lines) {
    const chunk = decodeDatabaseQrChunk(line);
    const key = chunk.id === 'ACTION' ? `ACTION:${simplePackageIndex++}` : chunk.id;
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing.filter(item => item.index !== chunk.index), chunk]);
  }

  const results: SyncPayload[] = [];
  for (const [key, chunks] of groups) {
    const expected = chunks[0]?.total ?? 0;
    if (chunks.length !== expected) {
      throw new Error(`Database package ${key} is incomplete: ${chunks.length}/${expected} pages scanned`);
    }
    results.push(await rebuildDatabaseSyncPayloadAsync(chunks));
  }
  return results;
}
