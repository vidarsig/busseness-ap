// Resize an image file down to a sane width and re-encode as JPEG.
// Returns both the full data-URL (for display / storage) and the bare base64
// payload + media type (for sending to the Claude vision endpoint).
// Keeping photos ~1200px / 0.85 quality keeps stored receipts small even though
// IndexedDB has room — dozens of KB each instead of multiple MB.
export function prepareImage(
  file: File,
  maxWidth = 1200,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}
