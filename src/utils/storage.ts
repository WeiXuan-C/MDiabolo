const PREFIX = 'mdiabolo:v2:';

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`${PREFIX}${key}`);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T): void {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
