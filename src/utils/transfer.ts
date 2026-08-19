import type { AppSettings, BackgroundConfig } from '../initialData';
import type { ActionLogEntry, ActionSyncPackage, DatabaseSnapshot } from './qr';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isTransferableBackground = (background: BackgroundConfig | undefined): background is BackgroundConfig =>
  background?.type === 'gradient';

export function sanitizeTransferSettings(settings: AppSettings): AppSettings {
  const next: AppSettings = { ...settings };
  if (isTransferableBackground(settings.customBackground)) {
    next.customBackground = settings.customBackground;
  } else {
    delete next.customBackground;
  }
  const backgroundHistory = (settings.backgroundHistory ?? []).filter(isTransferableBackground);
  if (backgroundHistory.length) {
    next.backgroundHistory = backgroundHistory;
  } else {
    delete next.backgroundHistory;
  }
  return next;
}

export function mergeIncomingTransferSettings(current: AppSettings, incoming: AppSettings): AppSettings {
  const sanitizedIncoming = sanitizeTransferSettings(incoming);
  return {
    ...current,
    ...sanitizedIncoming,
    customBackground: sanitizedIncoming.customBackground ?? current.customBackground,
    backgroundHistory: sanitizedIncoming.backgroundHistory?.length
      ? sanitizedIncoming.backgroundHistory
      : current.backgroundHistory
  };
}

export function sanitizeTransferAction(action: ActionLogEntry): ActionLogEntry {
  if (action.entityType !== 'settings' || action.actionType === 'delete' || !isPlainObject(action.payload)) {
    return action;
  }
  return {
    ...action,
    payload: sanitizeTransferSettings(action.payload as unknown as AppSettings)
  };
}

export function sanitizeTransferSnapshot(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  return {
    ...snapshot,
    settings: sanitizeTransferSettings(snapshot.settings)
  };
}

export function sanitizeTransferPackage(syncPackage: ActionSyncPackage): ActionSyncPackage {
  return {
    ...syncPackage,
    actions: syncPackage.actions.map(sanitizeTransferAction),
    snapshot: sanitizeTransferSnapshot(syncPackage.snapshot)
  };
}
