import { hotspotError } from '@/utils/hotspot';

describe('hotspotError', () => {
  it('accepts a normal hotspot', () => {
    expect(hotspotError('OrWifi', '24681357')).toBeNull();
    expect(hotspotError('  iPhone של נועה  ', 'password123')).toBeNull();   // spaces trimmed, Hebrew fine
  });

  it('accepts an open hotspot with no password', () => {
    expect(hotspotError('Cafe', '')).toBeNull();
  });

  it('needs a name', () => {
    expect(hotspotError('', '24681357')).toMatch(/name/i);
    expect(hotspotError('   ', '24681357')).toMatch(/name/i);
  });

  it('rejects passwords WiFi itself would reject', () => {
    expect(hotspotError('OrWifi', '1234567')).toMatch(/at least 8/);
    expect(hotspotError('OrWifi', 'x'.repeat(63))).toBeNull();
    expect(hotspotError('OrWifi', 'x'.repeat(64))).toMatch(/too long/);
  });

  it('measures the 32 limit in bytes, like WiFi does', () => {
    expect(hotspotError('a'.repeat(32), '24681357')).toBeNull();
    expect(hotspotError('a'.repeat(33), '24681357')).toMatch(/too long/);
    // each Hebrew letter is 2 bytes: 16 fit, 17 don't
    expect(hotspotError('א'.repeat(16), '24681357')).toBeNull();
    expect(hotspotError('א'.repeat(17), '24681357')).toMatch(/too long/);
  });
});
