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

export interface DecodedDatabaseQrChunk extends DatabaseQrChunk {
  complete: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function encodeQrRecord(payload: QrRecord): string {
  const json = JSON.stringify(payload.record);
  return `MD2|${payload.type}|${bytesToBase64(new TextEncoder().encode(json))}`;
}

export function encodeDatabaseSnapshot(snapshot: DatabaseSnapshot, chunkSize = 1600): DatabaseQrChunk[] {
  const encoded = bytesToBase64(new TextEncoder().encode(JSON.stringify(snapshot)));
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return Array.from({ length: total }, (_, index) => ({
    id,
    index: index + 1,
    total,
    data: `MDDB|${id}|${index + 1}|${total}|${encoded.slice(index * chunkSize, (index + 1) * chunkSize)}`
  }));
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
  const parts = payload.trim().split('|');
  if (parts.length !== 5 || parts[0] !== 'MDDB') {
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
    data: parts[4],
    complete: total === 1
  };
}

export function rebuildDatabaseSnapshot(chunks: DatabaseQrChunk[]): DatabaseSnapshot {
  if (!chunks.length) throw new Error('No database QR pages scanned');
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
    parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
  } catch {
    throw new Error('Database QR data is damaged or incomplete');
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
  return snapshot as DatabaseSnapshot;
}
