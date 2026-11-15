import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const notice = 'Experimental, not independently reviewed';
it('shows the review status in the README and every diagnostic screen', async () => {
  for (const path of ['README.md', 'packages/core/README.md', 'packages/carriers/file/README.md', 'tools/spikes/index.html',
    'tools/spikes/compression.html', 'tools/spikes/compression-compare.html',
    'tools/spikes/raptorq.html', 'tools/spikes/saved-copy.template.html']) {
    expect(await readFile(path, 'utf8'), path).toContain(notice);
  }
});
it('labels generated core and diagnostic build outputs', async () => {
  for (const path of ['packages/core/dist/REVIEW_STATUS.txt', 'packages/carriers/file/dist/REVIEW_STATUS.txt', 'tools/spikes/dist/REVIEW_STATUS.txt']) {
    expect(await readFile(path, 'utf8'), path).toContain(notice);
  }
});
