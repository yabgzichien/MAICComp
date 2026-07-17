import { SAMPLE_STATEMENTS } from '../src/data/sampleStatements';

describe('SAMPLE_STATEMENTS (embedded demo-kit mockups)', () => {
  it('offers at least two distinct, labelled samples', () => {
    expect(SAMPLE_STATEMENTS.length).toBeGreaterThanOrEqual(2);
    const ids = SAMPLE_STATEMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SAMPLE_STATEMENTS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.provider.length).toBeGreaterThan(0);
    }
  });

  it('each carries a valid base64 PNG in the PickedImage shape', () => {
    for (const s of SAMPLE_STATEMENTS) {
      expect(s.image.mime).toBe('image/png');
      expect(s.image.base64.length).toBeGreaterThan(10000);
      expect(s.image.uri).toBe('data:image/png;base64,' + s.image.base64);
      // PNG magic bytes survive the embed round-trip.
      expect(Buffer.from(s.image.base64, 'base64').subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    }
  });
});
