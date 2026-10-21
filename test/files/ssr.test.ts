// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { acceptFiles, inspectFile, safeFileName } from '../../src/files';
import { SAMPLES } from './fixtures';

describe('react-smart-copy/files on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof DataTransfer).toBe('undefined');
  });

  it('checks uploads a server received, by content', async () => {
    const upload = new Blob([SAMPLES['html'] as BlobPart], { type: 'application/pdf' });
    expect(await inspectFile(upload, { name: 'invoice.pdf' })).toMatchObject({ type: 'text/html', mismatch: true, risks: ['active-content', 'type-mismatch'] });
    const { accepted } = await acceptFiles([new Blob([SAMPLES['pdf'] as BlobPart])], { digest: true, accept: 'application/pdf' });
    expect(accepted[0]).toMatchObject({ type: 'application/pdf', name: 'file' });
    expect(accepted[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(safeFileName('../../uploads/CON.pdf')).toBe('_CON.pdf');
  });
});
