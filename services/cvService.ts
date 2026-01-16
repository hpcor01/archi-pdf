
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
        cv.Canny(blurred, edged, 50, 150); // Sensibilidade aumentada
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.dilate(edged, edged, kernel);

        let bestPoints: Point[] | null = findContourPoints(edged, scale, resized.rows * resized.cols);

        // --- PIPELINE 2: ADAPTIVE THRESHOLD (FALLBACK) ---
        if (!bestPoints) {
            const thresh = new cv.Mat();
            cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
            cv.bitwise_not(thresh, thresh); // Invert
            cv.dilate(thresh, thresh, kernel);
            bestPoints = findContourPoints(thresh, scale, resized.rows * resized.cols);
            thresh.delete();
        }

        // --- PIPELINE 3: JUST GRAB THE BIGGEST THING (EXTREME FALLBACK) ---
        if (!bestPoints) {
            const extremeThresh = new cv.Mat();
            cv.threshold(blurred, extremeThresh, 127, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
            bestPoints = findContourPoints(extremeThresh, scale, resized.rows * resized.cols);
            extremeThresh.delete();
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

/**
 * Helper to find the best 4-point contour in a processed mat
 */
function findContourPoints(mat: any, scale: number, totalArea: number): Point[] | null {
    const cv = window.cv;
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestPoints: Point[] | null = null;
    let maxArea = 0;
    const minAreaThreshold = totalArea * 0.01; // Reduzido drasticamente para 1%

    for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minAreaThreshold) continue;

        const perimeter = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * perimeter, true);

        // Se for um quadrilátero (4 pontos)
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
        // Se não for quadrilátero mas for a maior área, pegamos o bounding box inclinado
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
        // Ordenação robusta: Top-Left, Top-Right, Bottom-Right, Bottom-Left
        // 1. Sort by Y
        bestPoints.sort((a, b) => a.y - b.y);
        const top = bestPoints.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = bestPoints.slice(2, 4).sort((a, b) => b.x - a.x);
        bestPoints = [top[0], top[1], bottom[0], bottom[1]];
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
        
        // Calculate dimensions of the output image based on points
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
