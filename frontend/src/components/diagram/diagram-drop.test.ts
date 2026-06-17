import { describe, it, expect } from 'vitest';
import { firstImageFile } from './diagram-drop';

const f = (name: string, type: string) => new File(['x'], name, { type });

describe('firstImageFile', () => {
  it('returns the first image file, ignoring non-images', () => {
    expect(firstImageFile([f('a.pdf','application/pdf'), f('b.png','image/png')])?.name).toBe('b.png');
    expect(firstImageFile([f('a.txt','text/plain')])).toBeNull();
    expect(firstImageFile([])).toBeNull();
  });
});
