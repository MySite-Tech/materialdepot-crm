import { b2bBackendPost } from './backend';

export const uploadCheckInPhoto = (imageData: string, ref: string): Promise<string> =>
  b2bBackendPost<{ url: string }>('/check-in-photo', { image_data: imageData, ref }).then((b) => b.url);
