
// We access the global PDFLib and pdfjsLib objects loaded via CDN
declare global {
  interface Window {
    PDFLib: any;
    pdfjsLib: any;
    Tesseract: any;
  }
}

import { DocumentGroup } from "../types";

/**
 * Converts a PDF file (via ArrayBuffer) into an array of PNG/JPG images (one per page)
 */
const renderPdfToImages = async (arrayBuffer: ArrayBuffer, compress: boolean = false): Promise<{ data: Uint8Array, base64: string, format: 'png' | 'jpg' }[]> => {
  if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
  
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: { data: Uint8Array, base64: string, format: 'png' | 'jpg' }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Use lower scale for compression (balanced resolution)
    const scale = compress ? 1.5 : 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) continue;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    const format = compress ? 'jpg' : 'png';
    const mime = compress ? 'image/jpeg' : 'image/png';
    // Qualidade 0.6 é o sweet spot para compressão de documentos sem perda de leitura
    const quality = compress ? 0.6 : 1.0;
    
    const base64 = canvas.toDataURL(mime, quality);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject("Blob creation failed"), mime, quality);
    });
    
    const buffer = await blob.arrayBuffer();
    pages.push({ data: new Uint8Array(buffer), base64, format });
  }
  
  return pages;
};

/**
 * Perform OCR on a single image base64 using Tesseract.js
 * Returns word list with coordinates.
 */
const performOCR = async (base64: string): Promise<any[]> => {
  if (!window.Tesseract) return [];
  
  const result = await window.Tesseract.recognize(base64, 'por+eng', {
    logger: (m: any) => console.debug(m)
  });

  return result.data.words;
};

// Helper to convert any image URL (blob/base64) to PNG/JPG bytes via Canvas
const getImageInfo = async (url: string, compress: boolean = false): Promise<{ data: Uint8Array, base64: string, format: 'png' | 'jpg' }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      
      const format = compress ? 'jpg' : 'png';
      const mime = compress ? 'image/jpeg' : 'image/png';
      const quality = compress ? 0.6 : 1.0;

      const base64 = canvas.toDataURL(mime, quality);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas to Blob failed"));
          return;
        }
        blob.arrayBuffer().then(buffer => resolve({ data: new Uint8Array(buffer), base64, format }));
      }, mime, quality);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

const downloadBlob = (data: Uint8Array, filename: string, mimeType: string) => {
  const blob = new Blob([data as any], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const generatePDF = async (groups: DocumentGroup[], useOCR: boolean = false, compressPdf: boolean = false): Promise<void> => {
  if (!window.PDFLib) {
    alert("PDF library not loaded.");
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

  for (const group of groups) {
    if (group.items.length === 0) continue;

    try {
      const pdfDoc = await PDFDocument.create();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      let addedPageCount = 0;

      for (const item of group.items) {
        let pagesToProcess: { data: Uint8Array, base64: string, format: 'png' | 'jpg' }[] = [];

        if (item.type === 'pdf') {
           try {
             let arrayBuffer;
             if (item.originalFile) {
               arrayBuffer = await item.originalFile.arrayBuffer();
             } else {
               arrayBuffer = await fetch(item.url).then(res => res.arrayBuffer());
             }
             pagesToProcess = await renderPdfToImages(arrayBuffer, compressPdf);
           } catch (error) {
             console.error(`Error processing PDF ${item.name}:`, error);
           }
        } else {
           try {
             // Mesmo que o item original seja imagem, ao converter para PDF aplicamos compressão se solicitado
             const info = await getImageInfo(item.url, compressPdf);
             pagesToProcess = [info];
           } catch (error) {
             console.error(`Error processing image ${item.name}:`, error);
           }
        }

        for (const pageInfo of pagesToProcess) {
          let image;
          if (pageInfo.format === 'jpg') {
            image = await pdfDoc.embedJpg(pageInfo.data);
          } else {
            image = await pdfDoc.embedPng(pageInfo.data);
          }
          
          const { width, height } = image.scale(1);
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(image, { x: 0, y: 0, width, height });

          if (useOCR) {
            console.log(`Performing local OCR on page...`);
            const words = await performOCR(pageInfo.base64);
            
            const img = new Image();
            img.src = pageInfo.base64;
            await new Promise(r => img.onload = r);
            const naturalW = img.width;
            const naturalH = img.height;

            for (const word of words) {
              const { x0, y0, x1, y1 } = word.bbox;
              
              const pdfX = (x0 / naturalW) * width;
              const pdfY = height - ((y1 / naturalH) * height);
              const pdfW = ((x1 - x0) / naturalW) * width;
              const pdfH = ((y1 - y0) / naturalH) * height;

              try {
                page.drawText(word.text, {
                  x: pdfX,
                  y: pdfY,
                  size: pdfH * 0.8,
                  font: helveticaFont,
                  color: rgb(0, 0, 0),
                  opacity: 0,
                });
              } catch (fontErr) {}
            }
          }
          addedPageCount++;
        }
      }

      if (addedPageCount === 0) continue;

      const pdfBytes = await pdfDoc.save();
      downloadBlob(pdfBytes, `${group.title}.pdf`, 'application/pdf');

    } catch (err) {
      console.error("Error creating PDF for group " + group.title, err);
      alert(`Erro ao criar PDF ${group.title}.`);
    }
  }
};
