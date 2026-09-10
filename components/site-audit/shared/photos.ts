import { SB_KEY, SB_URL } from './sb-client';

async function uploadPhotoAttempt(blob: Blob, fname: string, mime: string): Promise<string> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(SB_URL + '/storage/v1/object/job-photos/' + fname, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': mime, 'x-upsert': 'true' },
      body: blob,
      signal: ac.signal,
    });
    if (!r.ok) throw new Error('upload failed: ' + r.status);
    return SB_URL + '/storage/v1/object/public/job-photos/' + fname;
  } finally {
    clearTimeout(tid);
  }
}

const RENDERABLE_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class PhotoFormatUnsupported extends Error {
  constructor(public mime: string) {
    super('cannot upload a ' + (mime.replace('image/', '').toUpperCase() || 'unknown') + ' image — browsers cannot display it');
    this.name = 'PhotoFormatUnsupported';
  }
}

export async function uploadPhoto(dataURL: string): Promise<string> {

  const declared = /^data:([^;,]+)/.exec(dataURL)?.[1]?.toLowerCase();
  if (declared && !RENDERABLE_IMAGE_TYPES[declared]) throw new PhotoFormatUnsupported(declared);
  const mime = declared || 'image/jpeg';
  const blob = await (await fetch(dataURL)).blob();
  const fname = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + RENDERABLE_IMAGE_TYPES[mime];
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await uploadPhotoAttempt(blob, fname, mime);
    } catch (e) {
      if (i === attempts) {
        console.error(`[siteAudit] photo upload failed after ${attempts} attempts`, e);
        throw e;
      }
      await new Promise((res) => setTimeout(res, 1000 * i));
    }
  }
  throw new Error('upload failed');
}

export const UNREADABLE_PHOTO_HINT =
  "Couldn't read that photo — your camera is saving in a format browsers can't display (HEIC/HEIF). " +
  'On iPhone: Settings > Camera > Formats > "Most Compatible", then take the photo again.';

export type CapturedPhoto =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export function readCapturedPhoto(file: File | Blob, maxDim = 1600, quality = 0.88): Promise<CapturedPhoto> {
  const refused: CapturedPhoto = { ok: false, error: UNREADABLE_PHOTO_HINT };
  return new Promise((resolve) => {
    const rd = new FileReader();
    rd.onerror = () => resolve(refused);
    rd.onload = () => {
      const im = new Image();
      im.onerror = () => resolve(refused);
      im.onload = () => {
        try {
          const s = Math.min(1, maxDim / im.width, maxDim / im.height);
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(im.width * s));
          cv.height = Math.max(1, Math.round(im.height * s));
          const ctx = cv.getContext('2d');
          if (!ctx) return resolve(refused);
          ctx.drawImage(im, 0, 0, cv.width, cv.height);

          resolve({ ok: true, dataUrl: cv.toDataURL('image/jpeg', quality) });
        } catch {
          resolve(refused);
        }
      };
      im.src = rd.result as string;
    };
    rd.readAsDataURL(file);
  });
}

