import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Search, Grid, Plus, Scissors, Download } from 'lucide-react';
import { ImageItem, Language } from '../types';
import { TRANSLATIONS } from '../constants';

// Declare globals for libraries loaded via CDN
declare global {
  interface Window {
    pdfjsLib: any;
    PDFLib: any;
  }
}

interface PdfEditorModalProps {
  item: ImageItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedItem: ImageItem) => void;
  language: Language;
}

interface PdfPage {
  originalIndex: number;
  thumbnail: string;
  id: string;
  sourceUrl: string; 
  sourceType: 'pdf' | 'image';
  originalFile?: File; 
}

const PdfEditorModal: React.FC<PdfEditorModalProps> = ({ item, isOpen, onClose, onUpdate, language }) => {
  const t = TRANSLATIONS[language];
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [gridZoom, setGridZoom] = useState(1);
  const [isSplitPanelOpen, setIsSplitPanelOpen] = useState(false);
  const [splitRanges, setSplitRanges] = useState('');
  const [viewingPageIndex, setViewingPageIndex] = useState<number | null>(null);
  const [pageZoom, setPageZoom] = useState(1);
  const [highResPageUrl, setHighResPageUrl] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{w: number, h: number} | null>(null);
  const [hoveredZoomIndex, setHoveredZoomIndex] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ left: number, top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    if (isOpen && item.type === 'pdf') {
      initializeEditor();
      setGridZoom(1); 
      setViewingPageIndex(null);
      setHoveredZoomIndex(null);
      setIsSplitPanelOpen(false);
    }
  }, [isOpen, item]);

  const initializeEditor = async () => {
    setIsLoading(true);
    setPages([]);
    try {
      await processFile(item.url, 'pdf', item.originalFile);
    } catch (e) {
      console.error(e);
      alert("Error initializing editor");
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (url: string, type: 'pdf' | 'image', file?: File) => {
    if (type === 'pdf') {
      if (!window.pdfjsLib) return;
      let arrayBuffer;
      if (file) {
          arrayBuffer = await file.arrayBuffer();
      } else {
          const response = await fetch(url);
          arrayBuffer = await response.arrayBuffer();
      }
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const newPages: PdfPage[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.6 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          newPages.push({
            originalIndex: i - 1,
            thumbnail: canvas.toDataURL(),
            id: Math.random().toString(36).substr(2, 9),
            sourceUrl: url,
            sourceType: 'pdf',
            originalFile: file
          });
        }
      }
      setPages(prev => [...prev, ...newPages]);
    } else {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;
      await new Promise(r => img.onload = r);
      const canvas = document.createElement('canvas');
      const MAX_THUMB_SIZE = 1024;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > MAX_THUMB_SIZE) { h *= MAX_THUMB_SIZE / w; w = MAX_THUMB_SIZE; }
      } else {
        if (h > MAX_THUMB_SIZE) { w *= MAX_THUMB_SIZE / h; h = MAX_THUMB_SIZE; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      setPages(prev => [...prev, {
        originalIndex: 0,
        thumbnail: canvas.toDataURL(),
        id: Math.random().toString(36).substr(2, 9),
        sourceUrl: url,
        sourceType: 'image',
        originalFile: file
      }]);
    }
  };

  const renderSinglePageToPng = async (page: PdfPage): Promise<Uint8Array> => {
    if (page.sourceType === 'image') {
      const resp = await fetch(page.thumbnail);
      const blob = await resp.blob();
      return new Uint8Array(await blob.arrayBuffer());
    }

    // PDF Page rendering
    let arrayBuffer;
    if (page.originalFile) {
        arrayBuffer = await page.originalFile.arrayBuffer();
    } else {
        arrayBuffer = await fetch(page.sourceUrl).then(res => res.arrayBuffer());
    }

    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pdfPage = await pdf.getPage(page.originalIndex + 1);
    const viewport = pdfPage.getViewport({ scale: 2.5 }); // High quality for saving
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    if (!ctx) throw new Error("Canvas context failed");
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    const blob: Blob = await new Promise((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  };

  const handleAddFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsLoading(true);
    try {
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const url = URL.createObjectURL(file);
        const type = file.type === 'application/pdf' ? 'pdf' : 'image';
        await processFile(url, type, file);
      }
    } catch (err) {
      console.error("Error adding files", err);
    } finally {
      setIsLoading(false);
      e.target.value = ''; 
    }
  };

  const handleSplitPdf = async () => {
    if (!window.PDFLib || !splitRanges.trim()) return;
    setIsLoading(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const ranges = splitRanges.split(',').map(r => r.trim());

      for (const range of ranges) {
        const parts = range.split('-');
        let startIdx, endIdx;
        if (parts.length === 1) {
          startIdx = endIdx = parseInt(parts[0]) - 1;
        } else {
          startIdx = parseInt(parts[0]) - 1;
          endIdx = parseInt(parts[1]) - 1;
        }
        if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 0 || endIdx >= pages.length || startIdx > endIdx) continue;

        const newRangePdf = await PDFDocument.create();
        for (let i = startIdx; i <= endIdx; i++) {
          const page = pages[i];
          const pngBytes = await renderSinglePageToPng(page);
          const image = await newRangePdf.embedPng(pngBytes);
          const { width, height } = image.scale(1);
          const newPage = newRangePdf.addPage([width, height]);
          newPage.drawImage(image, { x: 0, y: 0, width, height });
        }
        
        const pdfBytes = await newRangePdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `split_${range}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }
      setIsSplitPanelOpen(false);
    } catch (error) {
      console.error("Split Error", error);
      alert(t.splitInvalid);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!window.PDFLib) {
      alert("PDF Lib not loaded");
      return;
    }
    setIsLoading(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const newPdf = await PDFDocument.create();

      for (const page of pages) {
        const pngBytes = await renderSinglePageToPng(page);
        const image = await newPdf.embedPng(pngBytes);
        const { width, height } = image.scale(1);
        const newPage = newPdf.addPage([width, height]);
        newPage.drawImage(image, { x: 0, y: 0, width, height });
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newUrl = URL.createObjectURL(blob);
      onUpdate({ ...item, url: newUrl });
      onClose();
    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("Erro ao salvar o PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePage = (index: number) => {
    const newPages = [...pages];
    newPages.splice(index, 1);
    setPages(newPages);
    if (viewingPageIndex !== null && index === viewingPageIndex) setViewingPageIndex(null);
    else if (viewingPageIndex !== null && index < viewingPageIndex) setViewingPageIndex(viewingPageIndex - 1);
  };

  const handleZoomIn = () => {
    if (viewingPageIndex !== null) setPageZoom(prev => Math.min(prev + 0.25, 5));
    else setGridZoom(prev => Math.min(prev + 0.25, 3));
  };
  const handleZoomOut = () => {
    if (viewingPageIndex !== null) setPageZoom(prev => Math.max(prev - 0.25, 0.5));
    else setGridZoom(prev => Math.max(prev - 0.25, 0.25));
  };
  const handleZoomReset = () => {
    if (viewingPageIndex !== null) setPageZoom(1);
    else setGridZoom(1);
  };
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    const newPages = [...pages];
    const item = newPages.splice(draggedItem, 1)[0];
    newPages.splice(index, 0, item);
    setPages(newPages);
    setDraggedItem(index);
  };
  const onDragEnd = () => setDraggedItem(null);

  useEffect(() => {
    const loadHighRes = async () => {
      setHighResPageUrl(null);
      setImgNaturalSize(null);
      if (viewingPageIndex === null) return;
      const page = pages[viewingPageIndex];
      try {
        if (page.sourceType === 'pdf') {
            if (!window.pdfjsLib) return;
            let arrayBuffer;
            if (page.originalFile) arrayBuffer = await page.originalFile.arrayBuffer();
            else {
                const response = await fetch(page.sourceUrl);
                arrayBuffer = await response.arrayBuffer();
            }
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pdfPage = await pdf.getPage(page.originalIndex + 1);
            const viewport = pdfPage.getViewport({ scale: 3.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            if (context) {
               await pdfPage.render({ canvasContext: context, viewport }).promise;
               setHighResPageUrl(canvas.toDataURL());
            }
        } else setHighResPageUrl(page.thumbnail);
      } catch (e) { console.error("Error rendering page view", e); }
    };
    loadHighRes();
    setPageZoom(1);
    setIsPanning(false);
  }, [viewingPageIndex, pages]);

  const handleWheel = (e: React.WheelEvent) => {
    if (viewingPageIndex === null) return;
    if (e.deltaY < 0) setPageZoom(prev => Math.min(prev + 0.1, 5));
    else setPageZoom(prev => Math.max(prev - 0.1, 0.5));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewingPageIndex === null || !scrollContainerRef.current) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    scrollStartRef.current = { left: scrollContainerRef.current.scrollLeft, top: scrollContainerRef.current.scrollTop };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !scrollContainerRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    scrollContainerRef.current.scrollLeft = scrollStartRef.current.left - dx;
    scrollContainerRef.current.scrollTop = scrollStartRef.current.top - dy;
  };
  const handleMouseUp = () => setIsPanning(false);
  const getImageStyle = () => {
    const isFit = pageZoom === 1;
    if (!isFit && imgNaturalSize && scrollContainerRef.current) {
        const containerW = scrollContainerRef.current.clientWidth - 64; 
        const containerH = scrollContainerRef.current.clientHeight - 64;
        const baseScale = Math.min(containerW / imgNaturalSize.w, containerH / imgNaturalSize.h);
        return { width: `${imgNaturalSize.w * baseScale * pageZoom}px`, height: `${imgNaturalSize.h * baseScale * pageZoom}px`, maxWidth: 'none', maxHeight: 'none' };
    }
    return { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' as const };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {hoveredZoomIndex !== null && viewingPageIndex === null && pages[hoveredZoomIndex] && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 animate-fade-in scale-100 origin-center transition-transform">
            <img src={pages[hoveredZoomIndex].thumbnail} alt="Preview" className="max-h-[95vh] max-w-[95vw] object-contain rounded" />
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-gray-900 w-[80vw] h-[80vh] rounded-lg flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl transition-colors duration-300">
        <div className="h-14 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
             <h2 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t.pdfEditorTitle}</h2>
             {viewingPageIndex !== null && <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{t.page} {viewingPageIndex + 1} / {pages.length}</span>}
          </div>
          <div className="flex items-center space-x-4">
             {viewingPageIndex === null && (
                <button onClick={() => setIsSplitPanelOpen(!isSplitPanelOpen)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${isSplitPanelOpen ? 'bg-orange-100 text-orange-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    <Scissors size={16} /><span>{t.splitPdf}</span>
                </button>
             )}
             <div className="flex items-center space-x-1 border-r border-gray-300 dark:border-gray-700 pr-4">
               <button onClick={handleZoomOut} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomOut}><ZoomOut size={18} /></button>
               <span className="text-xs w-10 text-center text-gray-500 dark:text-gray-400 font-medium select-none">{Math.round((viewingPageIndex !== null ? pageZoom : gridZoom) * 100)}%</span>
               <button onClick={handleZoomIn} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomIn}><ZoomIn size={18} /></button>
               <button onClick={handleZoomReset} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition ml-1" title={t.zoomReset}><Search size={16} /></button>
             </div>
             <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"><X /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950 flex flex-col">
          {isSplitPanelOpen && (
              <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 animate-slide-down flex items-center justify-between shadow-md">
                 <div className="flex flex-1 items-center space-x-4 max-w-2xl">
                    <div className="flex flex-col">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-tight">{t.splitIntervals}</label>
                        <input type="text" placeholder={t.splitPlaceholder} value={splitRanges} onChange={(e) => setSplitRanges(e.target.value)} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-80" />
                    </div>
                    <button onClick={handleSplitPdf} disabled={!splitRanges.trim() || isLoading} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition flex items-center space-x-2 shadow-lg shadow-orange-500/20 mt-4 disabled:opacity-50">
                        <Download size={16} /><span>{t.splitAction}</span>
                    </button>
                 </div>
                 <button onClick={() => setIsSplitPanelOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
          )}
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-emerald-500">
               <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div><span>{t.loadingPdf}</span>
            </div>
          ) : viewingPageIndex !== null ? (
            <div className="w-full h-full flex flex-col">
               <div ref={scrollContainerRef} className={`flex-1 overflow-auto flex p-0 relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                 <div className="min-w-full min-h-full flex items-center justify-center p-8">
                    {highResPageUrl ? ( <img src={highResPageUrl} alt="Page View" className="shadow-2xl transition-all duration-200 m-auto block" draggable={false} onLoad={(e) => setImgNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={getImageStyle()} />
                    ) : <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500 m-auto"></div>}
                 </div>
               </div>
               <div className="h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 z-10">
                  <button onClick={() => setViewingPageIndex(null)} className="flex items-center text-gray-600 dark:text-gray-300 hover:text-emerald-500 transition font-medium"><Grid size={18} className="mr-2" />{t.backToGrid}</button>
                  <div className="flex items-center space-x-4">
                    <button disabled={viewingPageIndex <= 0} onClick={() => setViewingPageIndex(prev => prev! - 1)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"><ArrowLeft size={20} /></button>
                    <button disabled={viewingPageIndex >= pages.length - 1} onClick={() => setViewingPageIndex(prev => prev! + 1)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"><ArrowRight size={20} /></button>
                  </div>
                  <div className="w-20"></div>
               </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-6">
                <div className="grid gap-4 transition-all duration-200" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(120, 150 * gridZoom)}px, 1fr))` }}>
                  {pages.map((page, index) => (
                    <div key={page.id} draggable onDragStart={(e) => onDragStart(e, index)} onDragOver={(e) => onDragOver(e, index)} onDragEnd={onDragEnd} className={`relative group bg-white dark:bg-gray-800 p-2 rounded shadow-sm border-2 transition-colors cursor-move ${draggedItem === index ? 'border-emerald-500 opacity-50' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}>
                      <div className="aspect-[1/1.4] bg-gray-200 dark:bg-gray-900 mb-2 overflow-hidden rounded relative">
                        <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-contain" draggable={false} />
                        <div onMouseEnter={() => setHoveredZoomIndex(index)} onMouseLeave={() => setHoveredZoomIndex(null)} onClick={(e) => { e.stopPropagation(); setViewingPageIndex(index); }} className="absolute bottom-1 right-1 p-1.5 bg-white/90 dark:bg-gray-800/90 rounded-full text-gray-600 dark:text-gray-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition shadow-sm border border-gray-200 dark:border-gray-700 cursor-zoom-in"><Search size={14} /></div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 px-1">
                        <span>{t.page} {index + 1}</span>
                        <button onClick={() => handleDeletePage(index)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          )}
        </div>
        {viewingPageIndex === null && (
          <div className="h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white dark:bg-gray-900">
             <div className="flex items-center space-x-4">
                <label className="cursor-pointer flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium transition text-sm">
                    <Plus size={16} className="mr-2" />{t.addPages}<input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleAddFiles}/></label>
                {pages.length > 0 && <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t.total}: {pages.length}</span>}
             </div>
             <div className="flex space-x-4">
                <button onClick={onClose} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">{t.cancel}</button>
                <button onClick={handleSave} disabled={pages.length === 0} className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium flex items-center shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={18} className="mr-2" />{t.savePdf}</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfEditorModal;
