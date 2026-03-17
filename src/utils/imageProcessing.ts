

import { PreprocessingConfig, ResizeMethod, PadStyle } from '../types';

function reflectIndex(index: number, length: number): number {
  if (length <= 1) return 0;
  const period = 2 * length - 2;
  let normalized = index % period;
  if (normalized < 0) normalized += period;
  return normalized < length ? normalized : period - normalized;
}

function drawReflectPaddedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  drawX: number,
  drawY: number,
  drawWidth: number,
  drawHeight: number
): void {
  const safeWidth = Math.max(1, drawWidth);
  const safeHeight = Math.max(1, drawHeight);

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = safeWidth;
  sourceCanvas.height = safeHeight;
  const sourceCtx = sourceCanvas.getContext('2d');

  if (!sourceCtx) {
    ctx.drawImage(img, drawX, drawY, safeWidth, safeHeight);
    return;
  }

  sourceCtx.drawImage(img, 0, 0, safeWidth, safeHeight);
  const sourcePixels = sourceCtx.getImageData(0, 0, safeWidth, safeHeight).data;
  const outputImage = ctx.createImageData(canvasWidth, canvasHeight);
  const outputPixels = outputImage.data;

  for (let py = 0; py < canvasHeight; py++) {
    const sampleY = reflectIndex(py - drawY, safeHeight);

    for (let px = 0; px < canvasWidth; px++) {
      const sampleX = reflectIndex(px - drawX, safeWidth);
      const sourceOffset = (sampleY * safeWidth + sampleX) * 4;
      const outputOffset = (py * canvasWidth + px) * 4;

      outputPixels[outputOffset] = sourcePixels[sourceOffset];
      outputPixels[outputOffset + 1] = sourcePixels[sourceOffset + 1];
      outputPixels[outputOffset + 2] = sourcePixels[sourceOffset + 2];
      outputPixels[outputOffset + 3] = sourcePixels[sourceOffset + 3];
    }
  }

  ctx.putImageData(outputImage, 0, 0);
}

export async function processImageForDisplay(
  file: File, 
  config: PreprocessingConfig, 
  targetWidth: number = 224, 
  targetHeight: number = 224
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
                if (!ctx) throw new Error("Could not get canvas context");

                const method = config.resizeMethod;

                if (method === ResizeMethod.STRETCH) {
                    // Fill background just in case, though stretch covers it all
                    ctx.fillStyle = config.padColor; 
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                } 
                else if (method === ResizeMethod.CROP) {
                    // Resize shortest side to fill target, then center crop
                    const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
                    const w = img.width * scale;
                    const h = img.height * scale;
                    const x = (canvas.width - w) / 2;
                    const y = (canvas.height - h) / 2;
                    
                    ctx.fillStyle = config.padColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, x, y, w, h);
                } 
                else if (method === ResizeMethod.PAD) {
                    // Resize longest side to fit, then center (letterbox)
                    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                    const w = img.width * scale;
                    const h = img.height * scale;
                    const x = (canvas.width - w) / 2;
                    const y = (canvas.height - h) / 2;

                    // Pad Style Logic
                    if (config.padStyle === PadStyle.BLUR) {
                         // 1. Blurred Background
                         ctx.save();
                         // Support for blur in canvas
                         // Use type assertion to access filter without narrowing ctx to never
                         if ('filter' in (ctx as any)) {
                             (ctx as any).filter = 'blur(20px)';
                             // Scale slightly to avoid white vignette edges from blur
                             ctx.drawImage(img, -10, -10, canvas.width + 20, canvas.height + 20);
                             (ctx as any).filter = 'none';
                         } else {
                             // Fallback for older browsers: just stretch
                             ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                         }
                         ctx.restore();
                         
                         // Slight darken overlay to make foreground pop
                         ctx.fillStyle = 'rgba(0,0,0,0.15)';
                         ctx.fillRect(0,0, canvas.width, canvas.height);

                         // 2. Foreground with Fade Edges
                         // Use an offscreen canvas to create the alpha mask
                         const tempCanvas = document.createElement('canvas');
                         tempCanvas.width = w;
                         tempCanvas.height = h;
                         const tCtx = tempCanvas.getContext('2d');
                         
                         if (tCtx) {
                             // Draw original image
                             tCtx.drawImage(img, 0, 0, w, h);
                             
                             // Erase edges using destination-out
                             tCtx.globalCompositeOperation = 'destination-out';
                             
                             // Determine fade size (e.g. 15% of smallest dim)
                             const fadeSize = Math.min(w, h) * 0.15;
                             
                             // Check if we have padding on axes to determine where to fade
                             const hasHorizontalPadding = x > 0.5;
                             const hasVerticalPadding = y > 0.5;

                             // Linear gradient helper
                             const drawFade = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number, dw: number, dh: number) => {
                                 const g = tCtx.createLinearGradient(x0, y0, x1, y1);
                                 g.addColorStop(0, 'rgba(0,0,0,1)'); // Fully erased at edge
                                 g.addColorStop(1, 'rgba(0,0,0,0)'); // Not erased inside
                                 tCtx.fillStyle = g;
                                 tCtx.fillRect(dx, dy, dw, dh);
                             };

                             if (hasVerticalPadding) {
                                // Top
                                drawFade(0, 0, 0, fadeSize, 0, 0, w, fadeSize);
                                // Bottom
                                drawFade(0, h, 0, h - fadeSize, 0, h - fadeSize, w, fadeSize);
                             }

                             if (hasHorizontalPadding) {
                                // Left
                                drawFade(0, 0, fadeSize, 0, 0, 0, fadeSize, h);
                                // Right
                                drawFade(w, 0, w - fadeSize, 0, w - fadeSize, 0, fadeSize, h);
                             }
                             
                             // Draw masked image onto main canvas
                             ctx.drawImage(tempCanvas, x, y);
                         } else {
                             // Fallback
                             ctx.drawImage(img, x, y, w, h);
                         }

                    } else if (config.padStyle === PadStyle.REFLECT) {
                         const reflectWidth = Math.max(1, Math.round(w));
                         const reflectHeight = Math.max(1, Math.round(h));
                         const reflectX = Math.floor((canvas.width - reflectWidth) / 2);
                         const reflectY = Math.floor((canvas.height - reflectHeight) / 2);
                         drawReflectPaddedImage(ctx, img, canvas.width, canvas.height, reflectX, reflectY, reflectWidth, reflectHeight);
                    } else {
                         // Solid Color
                         ctx.fillStyle = config.padColor;
                         ctx.fillRect(0, 0, canvas.width, canvas.height);
                         ctx.drawImage(img, x, y, w, h);
                    }
                }

                const dataUrl = canvas.toDataURL('image/png');
                URL.revokeObjectURL(url);
                resolve(dataUrl);
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for preprocessing"));
        };
        img.src = url;
    });
}

/**
 * Generates a small thumbnail for the given file using createImageBitmap for performance.
 * Falls back to URL.createObjectURL if unsupported or on error.
 */
export async function generateThumbnail(file: File, size: number = 256, quality: number = 0.7): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      
      // If original is smaller than thumbnail, just use original
      if (scale >= 1) {
          bitmap.close();
          return URL.createObjectURL(file);
      }

      const w = Math.floor(bitmap.width * scale);
      const h = Math.floor(bitmap.height * scale);
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("No context");
      
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      
      return new Promise((resolve) => {
          canvas.toBlob(blob => {
              if (blob) resolve(URL.createObjectURL(blob));
              else resolve(URL.createObjectURL(file));
          }, 'image/jpeg', quality);
      });
    } catch (e) {
      console.warn("Thumbnail generation failed, using full file", e);
      return URL.createObjectURL(file);
    }
  }
  return URL.createObjectURL(file);
}
