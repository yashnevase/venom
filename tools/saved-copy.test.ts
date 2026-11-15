import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';

it('S4-HASH-BUILD matches the complete artifact digest and detects a modified copy', async () => {
  const file = await readFile(new URL('./spikes/dist/saved-copy.html', import.meta.url));
  const expected = (await readFile(new URL('./spikes/dist/saved-copy.sha256', import.meta.url), 'utf8')).trim();
  expect(createHash('sha256').update(file).digest('hex')).toBe(expected);
  const changed = Buffer.from(file.toString('utf8').replace('Saved-copy diagnostic', 'Altered-copy diagnostic'));
  expect(changed).not.toEqual(file);
  expect(createHash('sha256').update(changed).digest('hex')).not.toBe(expected);
  expect(file.toString('utf8')).not.toMatch(/\bsrc\s*=/i);
});
