import { candidateAddresses, firstHit } from '@/utils/scannerDiscovery';

describe('candidateAddresses', () => {
  const list = candidateAddresses('192.168.148.100');

  it('checks the saved address first, then the name, then the iPhone spot', () => {
    expect(list.slice(0, 3)).toEqual(['192.168.148.100', 'carstats.local', '172.20.10.14']);
  });

  it('covers the .100 spot on every 192.168.X network', () => {
    expect(list).toContain('192.168.0.100');
    expect(list).toContain('192.168.255.100');
  });

  it('never repeats an address', () => {
    expect(new Set(list).size).toBe(list.length);
    // the saved one is also a common subnet — it must still appear only once
    expect(list.filter(a => a === '192.168.148.100')).toHaveLength(1);
  });

  it('stays one address per network, not a full sweep', () => {
    // saved + name + iPhone + 256 Android networks
    expect(list.length).toBeLessThanOrEqual(259);
  });
});

describe('firstHit', () => {
  it('returns the address that answered', async () => {
    const hit = await firstHit(['a', 'b', 'c'], async a => a === 'b');
    expect(hit).toBe('b');
  });

  it('does not wait for slow failures once one address answers', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = () => new Promise<boolean>(r => { timer = setTimeout(() => r(false), 1500); });
    const start = Date.now();
    const hit = await firstHit(['slow', 'fast'], a => (a === 'fast' ? Promise.resolve(true) : slow()));
    expect(hit).toBe('fast');
    expect(Date.now() - start).toBeLessThan(500);
    clearTimeout(timer);   // the slow probe is still pending — don't leave it running
  });

  it('returns null when nothing answers, including probes that throw', async () => {
    const hit = await firstHit(['a', 'b'], async a => {
      if (a === 'a') throw new Error('network');
      return false;
    });
    expect(hit).toBeNull();
  });

  it('returns null for an empty list', async () => {
    expect(await firstHit([], async () => true)).toBeNull();
  });
});
