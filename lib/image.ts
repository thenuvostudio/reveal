/** Shrinks an uploaded picture to at most 1920px on its longest side and keeps it under ~900 KB as JPEG. */
export function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error("Please choose an image file.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * sc));
      c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.82, d = c.toDataURL("image/jpeg", q);
      while (d.length > 900000 && q > 0.45) { q -= 0.1; d = c.toDataURL("image/jpeg", q); }
      resolve(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}
