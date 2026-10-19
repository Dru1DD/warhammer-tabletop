/** Read an image file, centre-crop to a square and downscale for use as a token. */
export async function fileToTokenDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Нужен файл изображения (PNG, JPEG, WebP…).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Не удалось прочитать изображение.'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas недоступен.')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
