
/**
 * OpenCV Service for local image processing.
 * Implements highly robust document segmentation and perspective transformation.
 */

declare global {
  interface Window {
    cv: any;
    cvReady?: boolean;
  }
}

interface Point {
  x: number;
  y: number;
}

/**
 * Ensures OpenCV is loaded before executing a task.
 * Increased timeout to 30s to handle slow connections on production/Vercel.
 */
const waitForCV = async (retries = 300): Promise<void> => {
  // Check both window.cv existence and the ready flag from Module.onRuntimeInitialized
  if (window.cv && window.cv.imread && window.cv.Mat && (window.cvReady !== false)) return;
  
  if (retries <= 0) {
    throw new Error("OpenCV.js não pôde ser carregado. Verifique sua conexão ou se o script no index.html está acessível.");
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  return waitForCV(retries - 1);
};

/**
 * Detects document corners with an advanced computer vision pipeline.
 */
export const detectDocumentCorners = async (imageUrl: string): Promise<Point[] | null> => {
  try {
    await waitForCV();
  } catch (e) {
    console.error(e);
    return null;
  }
  
  const cv = window.cv;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const src = cv.imread(img);
        
        // 1. Resize for consistent processing
        const maxDim = 800;
        const scale = Math.min(maxDim / src.rows, maxDim / src.cols);
        const dstSize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
        const resized = new cv.Mat();
        cv.resize(src, resized, dstSize, 0, 0, cv.INTER_AREA);

        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edged = new cv.Mat();

        // 2. Preprocessing: Gray -> Blur -> Canny -> Dilate
        cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edged, 50, 150);
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.dilate(edged, edged, kernel);

        // 3. Find Contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestPoints: Point[] | null = null;
        let maxArea = 0;

        // 4. Analyze Contours
        for (let i = 0; i < contours.size(); ++i) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);
          if (area < (resized.rows * resized.cols * 0.15)) continue; 

          const perimeter = cv.arcLength(cnt, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, 0.02 * perimeter, true);

          if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            bestPoints = [];
            for (let j = 0; j < 4; j++) {
              bestPoints.push({
                x: Math.round(approx.data32S[j * 2] / scale),
                y: Math.round(approx.data32S[j * 2 + 1] / scale)
              });
            }
          } 
          else if (area > maxArea && !bestPoints) {
             const rect = cv.minAreaRect(cnt);
             const vertices = cv.RotatedRect.points(rect);
             const fallbackPoints: Point[] = [];
             for (let j = 0; j < 4; j++) {
                fallbackPoints.push({
                   x: Math.round(vertices[j].x / scale),
                   y: Math.round(vertices[j].y / scale)
                });
             }
             bestPoints = fallbackPoints;
          }
          approx.delete();
        }

        if (bestPoints) {
          const sums = bestPoints.map(p => p.x + p.y);
          const diffs = bestPoints.map(p => p.y - p.x);
          
          const sorted = new Array(4);
          sorted[0] = bestPoints[sums.indexOf(Math.min(...sums))]; // TL
          sorted[2] = bestPoints[sums.indexOf(Math.max(...sums))]; // BR
          sorted[1] = bestPoints[diffs.indexOf(Math.min(...diffs))]; // TR
          sorted[3] = bestPoints[diffs.indexOf(Math.max(...diffs))]; // BL
          bestPoints = sorted;
        }

        src.delete(); resized.delete(); gray.delete(); blurred.delete(); 
        edged.delete(); contours.delete(); hierarchy.delete(); kernel.delete();
        
        resolve(bestPoints);
      } catch (err) {
        console.error("OpenCV processing error:", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

/**
 * Applies perspective transform (Warp) to an image given 4 corners.
 */
export const applyPerspectiveCrop = async (imageUrl: string, points: Point[]): Promise<string> => {
  await waitForCV();
  const cv = window.cv;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const src = cv.imread(img);
        
        const wTop = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        const wBottom = Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y);
        const hLeft = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
        const hRight = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
        const targetW = Math.max(wTop, wBottom);
        const targetH = Math.max(hLeft, hRight);

        const srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
          points[0].x, points[0].y,
          points[1].x, points[1].y,
          points[2].x, points[2].y,
          points[3].x, points[3].y
        ]);
        const dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          targetW, 0,
          targetW, targetH,
          0, targetH
        ]);

        const M = cv.getPerspectiveTransform(srcCoords, dstCoords);
        const dst = new cv.Mat();
        cv.warpPerspective(src, dst, M, new cv.Size(targetW, targetH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        const canvas = document.createElement('canvas');
        cv.imshow(canvas, dst);
        const dataUrl = canvas.toDataURL('image/png');

        src.delete(); dst.delete(); M.delete(); srcCoords.delete(); dstCoords.delete();
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

/**
 * Convenience function for batch processing.
 */
export const autoCropImage = async (imageUrl: string): Promise<string> => {
    const corners = await detectDocumentCorners(imageUrl);
    if (!corners) return imageUrl;
    return applyPerspectiveCrop(imageUrl, corners);
};

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
            if (!ctx) return;

            const rads = (rotation % 360) * Math.PI / 180;
            const sin = Math.abs(Math.sin(rads));
            const cos = Math.abs(Math.cos(rads));
            const newWidth = img.width * cos + img.height * sin;
            const newHeight = img.width * sin + img.height * cos;

            canvas.width = newWidth;
            canvas.height = newHeight;
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
            ctx.translate(newWidth / 2, newHeight / 2);
            ctx.rotate(rads);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            resolve(canvas.toDataURL());
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
};
