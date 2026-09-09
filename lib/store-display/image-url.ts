const TRANSFORM_BASE = (
  process.env.NEXT_PUBLIC_IMAGE_TRANSFORM_BASE ||
  'https://image-transform.materialdepot.com'
).replace(/\/+$/, '');

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

export function getImageUrl(url: string | null | undefined, height: number): string {
  if (!url) return '';

  if (url.startsWith(TRANSFORM_BASE)) return url;

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

    if (bucket !== 'content') params.push('format=webp');
    return `${TRANSFORM_BASE}/${bucket}/${objectPath}?${params.join('&')}`;
  }

  return url;
}
