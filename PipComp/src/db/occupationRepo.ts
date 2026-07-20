// src/db/occupationRepo.ts (Brief P)
// Persists the borrower's self-declared occupation context  a single-row table, mirroring
// kycRepo/budgetRepo. Self-declared (not verified against any registry); the passport labels
// it as such so the lender never presents it as evidence. Attached only under a Tier 1 grant.
import { getDb } from './db';

export type EmploymentType = 'salaried' | 'gig' | 'self-employed' | 'micro-business';

export interface Occupation {
  occupation: string;
  sector: string;
  employmentType: EmploymentType;
  tenureMonths: number;
}

export async function getOccupation(): Promise<Occupation | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    occupation: string;
    sector: string;
    employment_type: string;
    tenure_months: number;
  }>('SELECT occupation, sector, employment_type, tenure_months FROM occupation WHERE id = 1');
  if (!row) return null;
  return {
    occupation: row.occupation,
    sector: row.sector,
    employmentType: row.employment_type as EmploymentType,
    tenureMonths: row.tenure_months,
  };
}

/** Clear the self-declared occupation so a fresh persona/session doesn't inherit a prior
 *  one (identity-bleed fix). Called on persona-load and every full data reset. */
export async function clearOccupation(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM occupation WHERE id = 1');
}

export async function setOccupation(o: Occupation): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO occupation (id, occupation, sector, employment_type, tenure_months)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       occupation = excluded.occupation,
       sector = excluded.sector,
       employment_type = excluded.employment_type,
       tenure_months = excluded.tenure_months`,
    o.occupation,
    o.sector,
    o.employmentType,
    o.tenureMonths
  );
}
