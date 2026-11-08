// Phone helpers: shrink a camera photo before upload, and tiny haptic taps.

// Light vibration on tap (Android). iPhones ignore it silently.
export const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

// Square-ish dish photo: longest side `max` px, WebP if the phone can make it, else JPEG.
// Returns { mime, data (base64), preview (object URL), kb }.
export async function shrinkPhoto(file, max = 720) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Please choose a photo');
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that photo')); i.src = URL.createObjectURL(file); });
  }
  const w0 = src.width, h0 = src.height;
  for (const [size, q] of [[max, 0.82], [600, 0.72], [480, 0.62]]) {
    const scale = Math.min(1, size / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    let blob = await toBlob(c, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, 'image/jpeg', q);   // older iPhones can't make WebP
    const data = await blobToBase64(blob);
    if (data.length <= 390000) return { mime: blob.type, data, preview: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) };
  }
  throw new Error('Photo is too big — try another one');
}
