/**
 * Image utilities for cropping and compressing images
 * Provides WhatsApp-style crop UI with zoom and pan
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageCropResult {
  blob: Blob;
  url: string;
}

/**
 * Creates a cropped and compressed square image from the given parameters
 * @param imageSrc - Source image URL (from FileReader or blob URL)
 * @param cropArea - The crop area in percentage coordinates
 * @param outputSize - Final output size (default 800x800)
 * @param quality - JPEG quality 0-1 (default 0.9 for high quality)
 */
export async function cropAndCompressImage(
  imageSrc: string,
  cropArea: CropArea,
  outputSize: number = 800,
  quality: number = 0.9
): Promise<ImageCropResult> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Set output size
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Calculate source crop area in pixels
      const sourceX = (cropArea.x / 100) * image.width;
      const sourceY = (cropArea.y / 100) * image.height;
      const sourceWidth = (cropArea.width / 100) * image.width;
      const sourceHeight = (cropArea.height / 100) * image.height;

      // Draw cropped area to canvas
      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputSize,
        outputSize
      );

      // Convert to blob with high quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }
          
          const url = URL.createObjectURL(blob);
          resolve({ blob, url });
        },
        "image/webp",
        quality
      );
    };

    image.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    image.src = imageSrc;
  });
}

/**
 * Read file as data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generate unique filename for upload
 */
export function generateFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = "webp"; // Always output as webp
  return `item_${timestamp}_${random}.${ext}`;
}
