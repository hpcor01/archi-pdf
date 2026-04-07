
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
 * Simple concurrency controller
 */
const pLimit = (concurrency: number) => {
  const queue: (() => Promise<any>)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
};

/**
 * Converts a PDF file (via ArrayBuffer) into an array of PNG/JPG images (one per page)
 */
const renderPdfToImages = async (arrayBuffer: ArrayBuffer, t: any, compress: boolean = false): Promise<{ data: Uint8Array, base64: string, format: 'png' | 'jpg' }[]> => {
  if (!window.pdfjsLib) throw new Error(t.pdfjsLoadError || "PDF.js not loaded");
  
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageIndices = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  
  // Limita concorrência para não travar o navegador em PDFs gigantes
  const limit = pLimit(3);
  
  const renderPage = async (index: number) => {
    const page = await pdf.getPage(index);
    // Reduzimos o scale de 1.5 para 1.25 para aumentar compressão mantendo nitidez razoável
    const scale = compress ? 1.25 : 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) return null;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    const format = compress ? 'jpg' : 'png';
    const mime = compress ? 'image/jpeg' : 'image/png';
    // Reduzimos qualidade de 0.6 para 0.5 para maior compressão sem artefatos visíveis de leitura
    const quality = compress ? 0.5 : 1.0;
    
    const base64 = canvas.toDataURL(mime, quality);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(t.blobError || "Blob creation failed"), mime, quality);
    });
    
    const buffer = await blob.arrayBuffer();
    return { data: new Uint8Array(buffer), base64, format };
  };

  const results = await Promise.all(pageIndices.map(index => limit(() => renderPage(index))));
  return results.filter(Boolean) as { data: Uint8Array, base64: string, format: 'png' | 'jpg' }[];
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
const getImageInfo = async (url: string, t: any, compress: boolean = false): Promise<{ data: Uint8Array, base64: string, format: 'png' | 'jpg' }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error(t.canvasContextError || "Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      
      const format = compress ? 'jpg' : 'png';
      const mime = compress ? 'image/jpeg' : 'image/png';
      // Ajustando para qualidade 0.5 se compressão estiver ativa
      const quality = compress ? 0.5 : 1.0;

      const base64 = canvas.toDataURL(mime, quality);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(t.blobError || "Canvas to Blob failed"));
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

export const generatePDF = async (
  groups: DocumentGroup[], 
  t: any, 
  useOCR: boolean = false, 
  compressPdf: boolean = false,
  saveSeparately: boolean = true,
  onProgress?: (current: number, total: number) => void
): Promise<void> => {
  if (!window.PDFLib) {
    alert(t.pdfLibLoadError || "PDF library not loaded.");
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const JSZip = (window as any).JSZip;
  const zip = !saveSeparately ? new JSZip() : null;

  // Calculamos o total de páginas aproximado (para imagens é 1, para PDFs precisamos abrir)
  // Como abrir todos os PDFs pode ser lento, vamos contar os itens e atualizar o total dinamicamente
  // ou fazer uma contagem rápida se possível.
  let totalPages = 0;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.type === 'image') {
        totalPages += 1;
      } else if (item.type === 'pdf') {
        try {
          const arrayBuffer = await fetch(item.url).then(res => res.arrayBuffer());
          const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          totalPages += pdf.numPages;
        } catch (e) {
          totalPages += 1; // Fallback
        }
      }
    }
  }

  let currentPage = 0;
  const reportProgress = () => {
    if (onProgress) onProgress(currentPage, totalPages);
  };

  reportProgress();

  for (const group of groups) {
    if (group.items.length === 0) continue;

    try {
      const pdfDoc = await PDFDocument.create();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      let addedPageCount = 0;

      const itemLimit = pLimit(2);

      const itemsProcessed = await Promise.all(group.items.map(item => itemLimit(async () => {
        let pages: { 
          data: Uint8Array, 
          base64: string, 
          format: 'png' | 'jpg',
          words?: any[] 
        }[] = [];

        if (item.type === 'pdf') {
          try {
            let arrayBuffer;
            const isEdited = item.url !== item.originalUrl;
            if (item.originalFile && !isEdited) {
              arrayBuffer = await item.originalFile.arrayBuffer();
            } else {
              arrayBuffer = await fetch(item.url).then(res => res.arrayBuffer());
            }
            pages = await renderPdfToImages(arrayBuffer, t, compressPdf);
          } catch (error) {
            console.error(`Error processing PDF ${item.name}:`, error);
          }
        } else {
          try {
            const info = await getImageInfo(item.url, t, compressPdf);
            pages = [info];
          } catch (error) {
            console.error(`Error processing image ${item.name}:`, error);
          }
        }

        if (useOCR && pages.length > 0) {
          await Promise.all(pages.map(async (page) => {
            try {
              page.words = await performOCR(page.base64);
            } catch (err) {
              console.error("OCR failed for page", err);
              page.words = [];
            }
          }));
        }

        return pages;
      })));

      for (const pagesToProcess of itemsProcessed) {
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

          if (useOCR && pageInfo.words) {
            const img = new Image();
            img.src = pageInfo.base64;
            await new Promise(r => img.onload = r);
            const naturalW = img.width;
            const naturalH = img.height;

            for (const word of pageInfo.words) {
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
              } catch (fontErr) {
                console.warn('Font loading failed, falling back to standard font:', fontErr);
              }
            }
          }
          addedPageCount++;
          currentPage++;
          reportProgress();
        }
      }

      if (addedPageCount === 0) continue;

      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
      
      if (saveSeparately) {
        downloadBlob(pdfBytes, `${group.title}.pdf`, 'application/pdf');
      } else if (zip) {
        zip.file(`${group.title}.pdf`, pdfBytes);
      }

    } catch (err) {
      console.error("Error creating PDF for group " + group.title, err);
      alert(`${t.pdfLibLoadError || "Erro ao criar PDF"} ${group.title}.`);
    }
  }

  // Se não foi salvo separadamente, gera e baixa o ZIP
  if (!saveSeparately && zip) {
    const zipContent = await zip.generateAsync({ type: 'uint8array' });
    downloadBlob(zipContent, `arquivos_compactados.zip`, 'application/zip');
  }
};
