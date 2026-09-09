import { SB_KEY, SB_URL } from './sbClient';

/* Uploads a data: URL (JPEG) to the `job-photos` storage bucket and returns
   its public URL. Used by room photos, arrival photos, doc scans, signatures.
   Every call site falls back to embedding the raw base64 dataURL straight in
   the row on failure — on flaky field/mobile connections that fallback was
   firing on the very first dropped request, leaving multi-MB base64 blobs
   permanently stuck in install_orders/audit_orders rows (this is what blew
   the Jobs Overview query up to 26MB, see SiteAuditJobsView.tsx). Retrying a
   couple of times with a short backoff before giving up turns most of those
   transient drops into successful uploads instead. */
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

/* ── A file the browser cannot decode must never reach Storage ─────────────
   uploadPhoto used to stamp EVERY upload `.jpg` + Content-Type image/jpeg regardless of what the
   bytes actually were. Combined with the three capture paths' "if the canvas can't decode it, send
   the original file" fallbacks (all fixed via readCapturedPhoto below), an iPhone left on
   "High Efficiency" put 48 HEIC files into job-photos under names claiming to be JPEGs — 24 of
   them referenced by live rows. Chrome cannot decode HEIC, so the office saw broken-image icons
   while the auditor's own iOS device rendered them fine; the auditor on ENQ2026090590383 (9
   unviewable photos, its worst case) reasonably concluded the upload had failed.

   So the name and content-type now come from the data URL itself, and a format no browser can
   render is refused HERE as well as at each capture site — a chokepoint, for the same reason
   sanitizeWriteBody is one: the next capture path added won't know to check. */
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
  // Only a data: URL carries its own type; anything else keeps the historic JPEG assumption.
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

/* ── Reading a photo off a camera / file picker ────────────────────────────
   Every capture path in the field apps used to do this inline, and all three made the same
   mistake in the same shape: decode the file with an <Image>, draw it to a canvas to downscale
   it, and on `img.onerror` fall back to the ORIGINAL file bytes
     (SiteAuditorApp's resizeImageDataUrl -> `|| dataUrl`,
      SiteInstallerApp's resizeDataUrl -> `resolve(dataURL)`,
      fieldAppShared's arrival-camera onFileChange -> `setPhoto(raw)`).

   That fallback has it exactly backwards. `onerror` means THIS browser — the one the person is
   standing at the site holding — could not decode the file, so no browser downstream will either.
   The fallback therefore guaranteed the outcome it looked like it was avoiding: an attached photo
   that the office can only ever render as a broken icon, with nothing anywhere saying so.

   Refusing the file is the only version that ends with real evidence on the job card: the worker
   is AT the site and can re-shoot in seconds, whereas a HEIC on the record is unviewable forever.
   Callers must surface `error` — dropping it silently is the bug this replaced. */
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
          // Always re-encoded as JPEG, so what reaches Storage is what the canvas could read.
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

