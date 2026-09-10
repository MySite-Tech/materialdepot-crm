import { PhotoFormatUnsupported, uploadPhoto } from './photos';

const INLINE_IMAGE_CAP = 64 * 1024;
const INLINE_DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

async function shrinkToCap(dataURL: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  for (const [px, q] of [[800, 0.6], [640, 0.5], [400, 0.4]] as Array<[number, number]>) {
    const out = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(img.naturalWidth || px, px);
        const h = Math.round(((img.naturalHeight || px) * w) / (img.naturalWidth || px));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(cv.toDataURL('image/jpeg', q)); } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataURL;
    });
    if (out && out.length <= INLINE_IMAGE_CAP) return out;
  }
  return null;
}

async function externalizeImage(dataURL: string): Promise<string | null> {
  try {
    return await uploadPhoto(dataURL);
  } catch (e) {

    if (e instanceof PhotoFormatUnsupported) {
      console.warn('[siteAudit] dropping a photo no browser can display (' + e.mime + '); it was captured before the format check existed');
      return null;
    }
    if (dataURL.length <= INLINE_IMAGE_CAP) {
      console.warn('[siteAudit] photo upload failed; keeping it inline (small enough to be harmless)');
      return dataURL;
    }
    const small = await shrinkToCap(dataURL);
    if (small) {
      console.warn('[siteAudit] photo upload failed; stored a downscaled thumbnail inline instead');
      return small;
    }
    console.warn('[siteAudit] photo upload failed and could not be downscaled; dropping it rather than writing a multi-MB row');
    return null;
  }
}

async function stripInlineImages(value: any, depth = 0): Promise<any> {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') {
    if (!INLINE_DATA_URL_RE.test(value)) return value;
    return await externalizeImage(value);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await stripInlineImages(item, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await stripInlineImages(v, depth + 1);
    return out;
  }
  return value;
}

export async function sanitizeWriteBody(body: any): Promise<any> {
  try {
    return await stripInlineImages(body);
  } catch (e) {

    console.error('[siteAudit] inline-image guard failed; writing the body unchanged', e);
    return body;
  }
}

