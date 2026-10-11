import { describe, expect, it } from 'vitest';
import { migrateSnapshot, type Snapshot } from './client';

describe('dernier plan gardé dans le navigateur', () => {
  it("reprend l'ancien format à une seule référence", () => {
    const old = {
      sampleId: 'bogomiles', source: 'AUTO', savedAt: '2026-10-11T09:00:00Z',
      reference: { km: 60, gainM: 3200, time: 'PT8H48M' },
      course: { race: { name: 'x', start: '', maxDuration: null, checkpoints: [] }, track: null, markers: [] },
      plans: [{ raceName: 'x' }],
    } as unknown as Snapshot;

    const migrated = migrateSnapshot(old);

    expect(migrated.references).toEqual([{ label: '', date: null, kind: 'RACE', km: 60, gainM: 3200, time: 'PT8H48M' }]);
    expect(migrated.plans[0].references).toEqual([]);
    expect('reference' in migrated).toBe(false);
  });
});
