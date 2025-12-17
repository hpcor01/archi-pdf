// We access the global PDFLib object loaded via CDN
declare global {
  interface Window {
    PDFLib: any;
  }
}

import { DocumentGroup } from "../types";

// Helper to convert any image URL (blob/base64) to PNG bytes via Canvas
const convertImageToPngBytes = async (url: string): Promise<Uint8Array> => {
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
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas to Blob failed"));
          return;
        }
        blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
      }, 'image/png');
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

export const generatePDF = async (groups: DocumentGroup[]): Promise<void> => {
  if (!window.PDFLib) {
    alert("PDF library not loaded.");
    return;
  }

  const { PDFDocument } = window.PDFLib;

  for (const group of groups) {
    if (group.items.length === 0) continue;

    try {
      // Create a new PDF Document
      const pdfDoc = await PDFDocument.create();
      let addedPageCount = 0;

      for (const item of group.items) {
        if (item.type === 'pdf') {
           // Handle PDF merging
           try {
             let arrayBuffer;
             if (item.originalFile) {
               // Prefer reading file directly if available
               arrayBuffer = await item.originalFile.arrayBuffer();
             } else {
               // Fallback to fetching blob URL
               arrayBuffer = await fetch(item.url).then(res => res.arrayBuffer());
             }
             
             // 1. Load source document
             // Try standard load first, then fallback to ignoreEncryption (for empty password protected files)
             let srcDoc;
             try {
                srcDoc = await PDFDocument.load(arrayBuffer);
             } catch (e) {
                console.warn(`Standard load failed for ${item.name}, trying ignoreEncryption.`);
                srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
             }
             
             // 2. Use embedPdf instead of copyPages
             // This flattens the content (including forms/annotations) into a visual representation,
             // fixing the "blank page" issue common with copyPages on complex PDFs.
             const indices = srcDoc.getPageIndices();
             const embeddedPages = await pdfDoc.embedPdf(srcDoc, indices);

             for (const embeddedPage of embeddedPages) {
                // embedPdf handles rotation dimensions automatically relative to the coordinate system
                const { width, height } = embeddedPage;
                const page = pdfDoc.addPage([width, height]);
                page.drawPage(embeddedPage, {
                    x: 0,
                    y: 0,
                    width,
                    height,
                });
                addedPageCount++;
             }

           } catch (error) {
             console.error(`Error processing PDF ${item.name}:`, error);
             alert(`Erro ao processar o arquivo PDF: ${item.name}. O arquivo pode estar corrompido ou protegido.`);
           }
        } else {
           // Handle Image
           try {
             const pngBytes = await convertImageToPngBytes(item.url);
             const image = await pdfDoc.embedPng(pngBytes);

             const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size in points
             const { width, height } = image.scale(1);
             
             // Calculate scale to fit page with margins
             const pageWidth = page.getWidth();
             const pageHeight = page.getHeight();
             const margin = 20;
             const availableWidth = pageWidth - (margin * 2);
             const availableHeight = pageHeight - (margin * 2);
             
             const scaleRatio = Math.min(availableWidth / width, availableHeight / height);
             
             const finalWidth = width * scaleRatio;
             const finalHeight = height * scaleRatio;
             
             // Center on page
             const x = (pageWidth - finalWidth) / 2;
             const y = (pageHeight - finalHeight) / 2;

             page.drawImage(image, {
               x,
               y,
               width: finalWidth,
               height: finalHeight,
             });
             addedPageCount++;
           } catch (error) {
             console.error(`Error processing image ${item.name}:`, error);
             alert(`Erro ao processar imagem: ${item.name}`);
           }
        }
      }

      if (addedPageCount === 0) {
        alert(`Nenhuma página foi gerada para o grupo "${group.title}". Verifique se os arquivos são válidos.`);
        continue;
      }

      const pdfBytes = await pdfDoc.save();
      downloadBlob(pdfBytes, `${group.title}.pdf`, 'application/pdf');

    } catch (err) {
      console.error("Error creating PDF for group " + group.title, err);
      alert(`Erro ao criar PDF ${group.title}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
};
