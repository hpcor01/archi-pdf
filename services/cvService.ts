
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
 */
const waitForCV = async (retries = 300): Promise<void> => {
  if (window.cv && window.cv.imread && window.cv.Mat && (window.cvReady !== false)) return;
  if (retries <= 0) {
    throw new Error("OpenCV.js não pôde ser carregado.");
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  return waitForCV(retries - 1);
};

/**
 * Helper to sort 4 points into [TL, TR, BR, BL] order robustly
 */
const sortPoints = (pts: Point[]): Point[] => {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => b.x - a.x);
  return [top[0], top[1], bottom[0], bottom[1]];
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
        const maxDim = 800;
        const scale = Math.min(maxDim / src.rows, maxDim / src.cols);
        const dstSize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
        const resized = new cv.Mat();
        cv.resize(src, resized, dstSize, 0, 0, cv.INTER_AREA);

        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edged = new cv.Mat();

        cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        // --- PIPELINE 1: CANNY EDGE DETECTION ---
        cv.Canny(blurred, edged, 50, 150);
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.dilate(edged, edged, kernel);

        let bestPoints: Point[] | null = findContourPoints(edged, scale, resized.rows * resized.cols);

        // --- PIPELINE 2: ADAPTIVE THRESHOLD (FALLBACK) ---
        if (!bestPoints) {
            const thresh = new cv.Mat();
            cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
            cv.bitwise_not(thresh, thresh);
            cv.dilate(thresh, thresh, kernel);
            bestPoints = findContourPoints(thresh, scale, resized.rows * resized.cols);
            thresh.delete();
        }

        src.delete(); resized.delete(); gray.delete(); blurred.delete(); 
        edged.delete(); kernel.delete();
        
        resolve(bestPoints);
      } catch (err) {
        console.error("OpenCV error:", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

function findContourPoints(mat: any, scale: number, totalArea: number): Point[] | null {
    const cv = window.cv;
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestPoints: Point[] | null = null;
    let maxArea = 0;
    const minAreaThreshold = totalArea * 0.01;

    for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minAreaThreshold) continue;

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
        else if (area > maxArea) {
            const rect = cv.minAreaRect(cnt);
            const vertices = cv.RotatedRect.points(rect);
            bestPoints = [];
            for (let j = 0; j < 4; j++) {
                bestPoints.push({
                    x: Math.round(vertices[j].x / scale),
                    y: Math.round(vertices[j].y / scale)
                });
            }
            maxArea = area;
        }
        approx.delete();
    }

    if (bestPoints) {
        bestPoints = sortPoints(bestPoints);
    }

    contours.delete(); hierarchy.delete();
    return bestPoints;
}

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
        
        // Always sort points before processing to guarantee TL, TR, BR, BL
        const sorted = sortPoints(points);

        // Accurate output dimensions based on average distance to preserve aspect ratio
        const widthA = Math.hypot(sorted[2].x - sorted[3].x, sorted[2].y - sorted[3].y);
        const widthB = Math.hypot(sorted[1].x - sorted[0].x, sorted[1].y - sorted[0].y);
        const targetW = Math.max(widthA, widthB);

        const heightA = Math.hypot(sorted[1].x - sorted[2].x, sorted[1].y - sorted[2].y);
        const heightB = Math.hypot(sorted[0].x - sorted[3].x, sorted[0].y - sorted[3].y);
        const targetH = Math.max(heightA, heightB);

        const srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
          sorted[0].x, sorted[0].y,
          sorted[1].x, sorted[1].y,
          sorted[2].x, sorted[2].y,
          sorted[3].x, sorted[3].y
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
      } catch (err) { reject(err); }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

export const autoCropImage = async (imageUrl: string): Promise<string> => {
    const corners = await detectDocumentCorners(imageUrl);
    if (!corners) return imageUrl;
    return applyPerspectiveCrop(imageUrl, corners);
};

export const applyImageAdjustments = async (
    imageUrl: string, brightness: number, contrast: number, rotation: number = 0
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
            canvas.width = newWidth; canvas.height = newHeight;
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
            ctx.translate(newWidth / 2, newHeight / 2);
            ctx.rotate(rads);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            resolve(canvas.toDataURL());
        };
        img.onerror = reject; img.src = imageUrl;
    });
};
