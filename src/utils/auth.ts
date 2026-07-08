import type { AdminAccount } from '../initialData';

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(password: string, salt: string): Promise<string> {
  const data = encoder.encode(`${salt}:${password}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

export async function createAdminAccount(name: string, password: string): Promise<AdminAccount> {
  const salt = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    salt,
    passwordHash: await digest(password, salt),
    createdAt: new Date().toISOString()
  };
}

export async function verifyAdminPassword(account: AdminAccount, password: string): Promise<boolean> {
  return account.passwordHash === await digest(password, account.salt);
}
