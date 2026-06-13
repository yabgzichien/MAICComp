// src/db/kycRepo.ts
// Persists the verified identity (masked only — the raw IC is never stored). Single-row
// table, mirrors budgetRepo.
import { getDb } from './db';

export interface KycIdentity {
  fullName: string;
  nricMasked: string;
  status: 'verified';
  provider: string;
  verifiedAt: string;
}

export async function getKyc(): Promise<KycIdentity | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    full_name: string;
    nric_masked: string;
    status: string;
    provider: string;
    verified_at: string;
  }>('SELECT full_name, nric_masked, status, provider, verified_at FROM kyc WHERE id = 1');
  if (!row) return null;
  return {
    fullName: row.full_name,
    nricMasked: row.nric_masked,
    status: 'verified',
    provider: row.provider,
    verifiedAt: row.verified_at,
  };
}

export async function setKyc(identity: Omit<KycIdentity, 'status'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO kyc (id, full_name, nric_masked, status, provider, verified_at)
     VALUES (1, ?, ?, 'verified', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       full_name = excluded.full_name,
       nric_masked = excluded.nric_masked,
       status = excluded.status,
       provider = excluded.provider,
       verified_at = excluded.verified_at`,
    identity.fullName,
    identity.nricMasked,
    identity.provider,
    identity.verifiedAt
  );
}
