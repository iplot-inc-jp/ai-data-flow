export function firstImageFile(files: File[]): File | null {
  return files.find((f) => (f.type || '').toLowerCase().startsWith('image/')) ?? null;
}
