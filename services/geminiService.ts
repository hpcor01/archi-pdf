import { removeBackground as removeBackgroundImgly, type Config } from '@imgly/background-removal';

/**
 * Applies Brightness, Contrast and Rotation to an image using HTML Canvas.
 */
export const applyImageAdjustments = async (
    imageUrl: string, 
    brightness: number, 
    contrast: number,
    rotation: number = 0
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            // Calculate new canvas dimensions based on rotation
            const rads = rotation * Math.PI / 180;
            const sin = Math.abs(Math.sin(rads));
            const cos = Math.abs(Math.cos(rads));

            // New dimensions bounding box
            const newWidth = img.width * cos + img.height * sin;
            const newHeight = img.width * sin + img.height * cos;

            canvas.width = newWidth;
            canvas.height = newHeight;

            // Apply Filters (Brightness/Contrast)
            // Note: Canvas filter works in most modern browsers. 
            // Fallback for older ones would require pixel manipulation, but context filter is standard now.
            const b = brightness; 
            const c = contrast;
            ctx.filter = `brightness(${b}%) contrast(${c}%)`;

            // Coordinate system transformation for rotation
            ctx.translate(newWidth / 2, newHeight / 2);
            ctx.rotate(rads);
            
            // Draw image centered in the rotated context
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            resolve(canvas.toDataURL());
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
};

/**
 * Removes background using @imgly/background-removal.
 * This library uses publicly accessible CDNs for models.
 */
export const removeBackground = async (imageUrl: string): Promise<string> => {
  try {
    // 1. Fetch the image data first to ensure we have a valid Blob.
    // This bypasses potential fetch errors inside the library regarding the source image,
    // ensuring the library only has to handle the computation.
    let imageBlob: Blob;
    
    try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch source image: ${imageResponse.statusText}`);
        }
        imageBlob = await imageResponse.blob();
    } catch (fetchError) {
        console.error("Error pre-fetching image:", fetchError);
        throw new Error("Could not process image source.");
    }

    // Configuration for imgly
    const config: Config = {
        progress: (key, current, total) => {
             // Optional: meaningful logs only
        },
        debug: true, 
        // Use unpkg as it is often more reliable and has better CORS support than static.img.ly
        publicPath: 'https://unpkg.com/@imgly/background-removal-data@1.7.0/dist/'
    };

    // Run the removal passing the Blob directly
    const resultBlob = await removeBackgroundImgly(imageBlob, config);

    // Convert Blob to Base64 Data URL for compatibility with the rest of the app
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to convert blob to string"));
            }
        };
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(resultBlob);
    });

  } catch (error) {
    console.error("Background removal error:", error);
    if (error instanceof Error) {
       console.error(error.message);
    }
    // Specific user-friendly error message
    throw new Error("Falha ao remover fundo. Verifique a conexão com a internet (IA Models).");
  }
};