import { PhotoFormatUnsupported, uploadPhoto } from './photos';

/* ── Never persist a full-size image inline in a JSON column ───────────────
   Every write below runs its body through this first.

   Why a chokepoint rather than a fix at each call site: inline base64 reached the DB by two
   different routes, and only one of them was an error path.
     1. uploadPhoto() fails after its 3 retries and the caller keeps the raw data URL.
     2. Room photos are put into state inline ON PURPOSE, so the auditor sees the thumbnail
        instantly, with the upload swapping the URL in afterwards — save the job card before
        that lands and the base64 is what gets written. That is a race, not a failure.
   It cost 70 MB in audit_orders.audit_ticked (single rows over 8 MB, 97 rows affected) and
   5.8 MB in the two log columns, which is what pushed the Execution tab's reads over Supabase's
   ~3s statement timeout.

   The rule is "always externalize": ANY data: image URL in a write body gets uploaded and
   replaced by its URL, whatever its size. Sizing the guard by a byte cap instead was tempting and
   wrong — the 50 stray photos found in the log columns were 20-55 kB each, so a 64 kB cap would
   have externalized exactly one of them and left 1.7 MB inline to start accumulating again. What
   made those columns unreadable was the total, not any one row.

   The cap therefore governs only the DEGRADED path: if the upload cannot be made to work, a small
   image still rides inline so an offline signature save is not lost, and a large one is downscaled
   until it fits. Evidence is degraded rather than lost, and one row can never blow up a table. */
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
    /* A refused FORMAT is not a failed upload, and the degraded paths below are all wrong for it:
       retrying won't help, keeping it inline stores an image nobody can open (and the <64 kB
       branch would happily do exactly that), and shrinkToCap can't downscale what the canvas
       cannot decode. Reachable now only from a job-card draft saved on a device BEFORE
       readCapturedPhoto started refusing these at capture time. */
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

/* Depth-limited walk — these payloads are job cards, a handful of levels deep. */
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
    // A guard that throws would block a field save outright, which is worse than a fat row.
    console.error('[siteAudit] inline-image guard failed; writing the body unchanged', e);
    return body;
  }
}

