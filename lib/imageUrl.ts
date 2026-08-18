/* Thumbnail URLs for catalogue images.

   The product APIs hand back the ORIGINAL object — the store-display list was
   rendering 1.4 MB PNGs into 40x40 boxes, so one 30-row page pulled tens of
   megabytes to draw a column of thumbnails. materialdepot_nextjs solves this
   with helpers/image_helper's getImageUrl, which rewrites the source host to an
   image-transform bucket and asks for a height + WebP. This is the same idea,
   cut down to what the CRM actually needs: no watermark (these are internal
   screens), no legacy Azure ?width fallback, no Next <Image> loader.

   Same 1.4 MB tile, measured: height=80 -> 3 KB, height=400 -> 40 KB.

   Anything this doesn't recognise is returned untouched, so a new bucket shows
   a full-size image rather than a broken one. */

const TRANSFORM_BASE = (
  process.env.NEXT_PUBLIC_IMAGE_TRANSFORM_BASE ||
  'https://image-transform.materialdepot.com'
).replace(/\/+$/, '');

/* Source host -> image-transform bucket, first match wins. Mirrors
   BUCKET_BY_DOMAIN in materialdepot_nextjs, plus the public R2 host the
   variant_image rows actually carry today.
     main / azure -> the images bucket (WebP)
     content      -> content files (resize only, never WebP-converted) */
const BUCKET_BY_HOST: [string, string][] = [
  ['pub-132f3882c2074e84999a9ab982950552.r2.dev', 'main'],
  ['materialdepot-images-hbh2cjbvbtfmanhx.z02.azurefd.net', 'azure'],
  ['materialdepotimages.materialdepot.in', 'main'],
  ['materialdepotimages.materialdepot.com', 'main'],
  ['materialdepotimages.s3.ap-south-1.amazonaws.com', 'main'],
  ['materialdepotimages.s3.amazonaws.com', 'main'],
  ['pub-572d4732b7644138867808415beb5a4f.r2.dev', 'content'],
  ['materialdepot-content-files-endpoint-e8cnf0c2gxfhe5fb.z02.azurefd.net', 'content'],
  ['material-depot-content-files-noresize-endpoint-bsbkh4asdwecc9dp.z02.azurefd.net', 'content'],
  ['material-depot-content-files.s3.ap-south-1.amazonaws.com', 'content'],
  ['materialdepot-content-files.materialdepot.in', 'content'],
  ['dqzffhb3lxxp.cloudfront.net', 'content'],
  ['d3faqy0icgqzj8.cloudfront.net', 'content'],
];

/**
 * Resized, WebP-encoded URL for a catalogue image.
 *
 * @param url    the original image URL as the API returned it
 * @param height target height in px — pass roughly 2x the rendered box so it
 *               stays sharp on retina, not the source's own size
 */
export function getImageUrl(url: string | null | undefined, height: number): string {
  if (!url) return '';

  // Already transformed (or pointed at the service by hand): leave it alone
  // rather than nesting one transform inside another.
  if (url.startsWith(TRANSFORM_BASE)) return url;

  // Video, animation and vector aren't resizable by the service.
  if (/\.(mp4|mov|gif|svg)(\?|$)/i.test(url)) return url;

  const base = url.split('?')[0];

  for (const [host, bucket] of BUCKET_BY_HOST) {
    const idx = base.indexOf(host);
    if (idx === -1) continue;
    const objectPath = base
      .slice(idx + host.length)
      .replace(/^\/+/, '')
      .replace(/\+/g, '%20');
    if (!objectPath) return url;
    const params = [`height=${height}`];
    // The service never WebP-converts the content bucket; asking anyway just
    // makes the cache key noisier.
    if (bucket !== 'content') params.push('format=webp');
    return `${TRANSFORM_BASE}/${bucket}/${objectPath}?${params.join('&')}`;
  }

  return url;
}
