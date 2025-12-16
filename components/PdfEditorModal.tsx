import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Search, Grid, Plus } from 'lucide-react';
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
  sourceUrl: string; // The URL of the file this page belongs to
  sourceType: 'pdf' | 'image';
}

const PdfEditorModal: React.FC<PdfEditorModalProps> = ({ item, isOpen, onClose, onUpdate, language }) => {
  const t = TRANSLATIONS[language];
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  
  // Grid Zoom State
  const [gridZoom, setGridZoom] = useState(1);
  
  // Single Page View State
  const [viewingPageIndex, setViewingPageIndex] = useState<number | null>(null);
  const [pageZoom, setPageZoom] = useState(1);
  const [highResPageUrl, setHighResPageUrl] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{w: number, h: number} | null>(null);

  // Hover Zoom State
  const [hoveredZoomIndex, setHoveredZoomIndex] = useState<number | null>(null);

  // Panning State for Single View
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
    }
  }, [isOpen, item]);

  const initializeEditor = async () => {
    setIsLoading(true);
    setPages([]);
    try {
      await processFile(item.url, 'pdf');
    } catch (e) {
      console.error(e);
      alert("Error initializing editor");
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (url: string, type: 'pdf' | 'image') => {
    if (type === 'pdf') {
      if (!window.pdfjsLib) return;

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      const newPages: PdfPage[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        // Increased scale from 0.4 to 0.6 for better zoom quality while maintaining reasonable performance
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
            sourceType: 'pdf'
          });
        }
      }
      setPages(prev => [...prev, ...newPages]);

    } else {
      // Handle Image as a single page
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;
      await new Promise(r => img.onload = r);

      // Create thumbnail
      const canvas = document.createElement('canvas');
      // Increased max thumb size from 300 to 800 to allow decent zoom on images
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
        sourceType: 'image'
      }]);
    }
  };

  const handleAddFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsLoading(true);
    try {
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const url = URL.createObjectURL(file);
        const type = file.type === 'application/pdf' ? 'pdf' : 'image';
        await processFile(url, type);
      }
    } catch (err) {
      console.error("Error adding files", err);
      alert("Error adding files");
    } finally {
      setIsLoading(false);
      e.target.value = ''; // Reset input
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
      
      // Cache loaded PDFs to avoid re-fetching/re-parsing
      const pdfCache: Record<string, any> = {};

      for (const page of pages) {
        if (page.sourceType === 'pdf') {
          let sourcePdf = pdfCache[page.sourceUrl];
          
          if (!sourcePdf) {
            const arrayBuffer = await fetch(page.sourceUrl).then(res => res.arrayBuffer());
            sourcePdf = await PDFDocument.load(arrayBuffer);
            pdfCache[page.sourceUrl] = sourcePdf;
          }

          const [copiedPage] = await newPdf.copyPages(sourcePdf, [page.originalIndex]);
          newPdf.addPage(copiedPage);

        } else {
           // Handle Image
           const imageBytes = await fetch(page.sourceUrl).then(res => res.arrayBuffer());
           let image;
           // Basic detection usually sufficient if extension is correct, but robust implementation checks headers.
           // Here assuming PNG/JPG/WebP based on what app allows.
           // PDF-lib supports PNG and JPG. WebP needs conversion (not implemented here for brevity, assumed supported or handled elsewhere).
           // Assuming common formats:
           try {
              image = await newPdf.embedPng(imageBytes);
           } catch {
              image = await newPdf.embedJpg(imageBytes);
           }
           
           if (image) {
             const { width, height } = image.scale(1);
             const page = newPdf.addPage([width, height]);
             page.drawImage(image, { x: 0, y: 0, width, height });
           }
        }
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newUrl = URL.createObjectURL(blob);

      onUpdate({ ...item, url: newUrl });
      onClose();

    } catch (error) {
      console.error("Error saving PDF:", error);
      alert("Error saving PDF: " + (error instanceof Error ? error.message : "Unknown"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePage = (index: number) => {
    const newPages = [...pages];
    newPages.splice(index, 1);
    setPages(newPages);
    if (viewingPageIndex !== null && index === viewingPageIndex) {
       setViewingPageIndex(null);
    } else if (viewingPageIndex !== null && index < viewingPageIndex) {
       setViewingPageIndex(viewingPageIndex - 1);
    }
  };

  // Zoom handlers
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

  // Drag and Drop handlers
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

  const onDragEnd = () => {
    setDraggedItem(null);
  };

  // --- Single Page View Logic ---
  
  useEffect(() => {
    const loadHighRes = async () => {
      setHighResPageUrl(null);
      setImgNaturalSize(null);
      if (viewingPageIndex === null) return;
      
      const page = pages[viewingPageIndex];
      
      try {
        if (page.sourceType === 'pdf') {
            if (!window.pdfjsLib) return;
            const response = await fetch(page.sourceUrl);
            const arrayBuffer = await response.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
            
            const pdfPage = await pdf.getPage(page.originalIndex + 1);
            // Increased scale to 3.0 for better readability of small documents
            const viewport = pdfPage.getViewport({ scale: 3.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            if (context) {
               await pdfPage.render({ canvasContext: context, viewport }).promise;
               setHighResPageUrl(canvas.toDataURL());
            }
        } else {
           setHighResPageUrl(page.sourceUrl);
        }
      } catch (e) {
        console.error("Error rendering page view", e);
      }
    };

    loadHighRes();
    setPageZoom(1);
    setIsPanning(false);
  }, [viewingPageIndex, pages]);

  // Handle Wheel Zoom in Single Page View
  const handleWheel = (e: React.WheelEvent) => {
    if (viewingPageIndex === null) return;
    if (e.ctrlKey || e.metaKey || true) { // Always allow wheel zoom in this modal for convenience
       if (e.deltaY < 0) {
         setPageZoom(prev => Math.min(prev + 0.1, 5));
       } else {
         setPageZoom(prev => Math.max(prev - 0.1, 0.5));
       }
    }
  };

  // Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewingPageIndex === null || !scrollContainerRef.current) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    scrollStartRef.current = { 
        left: scrollContainerRef.current.scrollLeft, 
        top: scrollContainerRef.current.scrollTop 
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !scrollContainerRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    scrollContainerRef.current.scrollLeft = scrollStartRef.current.left - dx;
    scrollContainerRef.current.scrollTop = scrollStartRef.current.top - dy;
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Calculate dynamic style for image to ensure proper scrolling
  const getImageStyle = () => {
    const isFit = pageZoom === 1;
    
    // If we have natural dimensions and user zoomed in, force explicit size
    if (!isFit && imgNaturalSize && scrollContainerRef.current) {
        // Calculate the "Fit" dimensions (what CSS 'contain' does)
        const containerW = scrollContainerRef.current.clientWidth - 64; // p-8 = 32px * 2
        const containerH = scrollContainerRef.current.clientHeight - 64;
        
        const scaleW = containerW / imgNaturalSize.w;
        const scaleH = containerH / imgNaturalSize.h;
        const baseScale = Math.min(scaleW, scaleH);

        return {
            width: `${imgNaturalSize.w * baseScale * pageZoom}px`,
            height: `${imgNaturalSize.h * baseScale * pageZoom}px`,
            maxWidth: 'none',
            maxHeight: 'none'
        };
    }

    // Default responsive fit
    return {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain' as const
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      
      {/* Hover Zoom Overlay */}
      {hoveredZoomIndex !== null && viewingPageIndex === null && pages[hoveredZoomIndex] && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 animate-fade-in scale-100 origin-center transition-transform">
            <img 
              src={pages[hoveredZoomIndex].thumbnail} 
              alt="Preview" 
              className="max-h-[95vh] max-w-[95vw] object-contain rounded" 
            />
            <div className="text-center text-xs mt-2 text-gray-500 dark:text-gray-400 font-medium">
               {t.page} {hoveredZoomIndex + 1}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 w-[80vw] h-[80vh] rounded-lg flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl transition-colors duration-300">
        
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
             <h2 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t.pdfEditorTitle}</h2>
             {viewingPageIndex !== null && (
               <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                 {t.page} {viewingPageIndex + 1} / {pages.length}
               </span>
             )}
          </div>
          
          <div className="flex items-center space-x-4">
             {/* Zoom Controls */}
             <div className="flex items-center space-x-1 border-r border-gray-300 dark:border-gray-700 pr-4">
               <button onClick={handleZoomOut} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomOut}><ZoomOut size={18} /></button>
               <span className="text-xs w-10 text-center text-gray-500 dark:text-gray-400 font-medium select-none">
                 {Math.round((viewingPageIndex !== null ? pageZoom : gridZoom) * 100)}%
               </span>
               <button onClick={handleZoomIn} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomIn}><ZoomIn size={18} /></button>
               <button onClick={handleZoomReset} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition ml-1" title={t.zoomReset}><Search size={16} /></button>
             </div>

             <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <X />
             </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-gray-100 dark:bg-gray-950">
          
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-emerald-500">
               <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
               <span>{t.loadingPdf}</span>
            </div>
          ) : viewingPageIndex !== null ? (
            // --- Single Page View Mode ---
            <div className="w-full h-full flex flex-col">
               <div 
                 ref={scrollContainerRef}
                 className={`flex-1 overflow-auto flex p-0 relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                 onWheel={handleWheel}
                 onMouseDown={handleMouseDown}
                 onMouseMove={handleMouseMove}
                 onMouseUp={handleMouseUp}
                 onMouseLeave={handleMouseUp}
               >
                 <div className="min-w-full min-h-full flex items-center justify-center p-8">
                    {highResPageUrl ? (
                    <img 
                        src={highResPageUrl} 
                        alt="Page View" 
                        className="shadow-2xl transition-all duration-200 m-auto block"
                        draggable={false}
                        onLoad={(e) => setImgNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                        style={getImageStyle()} 
                    />
                    ) : (
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500 m-auto"></div>
                    )}
                 </div>
               </div>
               
               {/* View Navigation Bar */}
               <div className="h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 z-10">
                  <button 
                    onClick={() => setViewingPageIndex(null)}
                    className="flex items-center text-gray-600 dark:text-gray-300 hover:text-emerald-500 transition font-medium"
                  >
                    <Grid size={18} className="mr-2" />
                    {t.backToGrid}
                  </button>

                  <div className="flex items-center space-x-4">
                    <button 
                       disabled={viewingPageIndex <= 0}
                       onClick={() => setViewingPageIndex(prev => prev! - 1)}
                       className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"
                       title={t.prevPage}
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <button 
                       disabled={viewingPageIndex >= pages.length - 1}
                       onClick={() => setViewingPageIndex(prev => prev! + 1)}
                       className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"
                       title={t.nextPage}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                  
                  <div className="w-20"></div> {/* Spacer for center alignment */}
               </div>
            </div>
          ) : (
            // --- Grid View Mode ---
            <div className="h-full overflow-y-auto p-6">
              {pages.length === 0 ? (
                 <div className="h-full flex items-center justify-center text-gray-500">
                   No pages found.
                 </div>
              ) : (
                <div 
                   className="grid gap-4 transition-all duration-200" 
                   style={{ 
                      gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(120, 150 * gridZoom)}px, 1fr))` 
                   }}
                >
                  {pages.map((page, index) => (
                    <div 
                      key={page.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, index)}
                      onDragOver={(e) => onDragOver(e, index)}
                      onDragEnd={onDragEnd}
                      className={`relative group bg-white dark:bg-gray-800 p-2 rounded shadow-sm border-2 transition-colors cursor-move
                        ${draggedItem === index ? 'border-emerald-500 opacity-50' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <div className="aspect-[1/1.4] bg-gray-200 dark:bg-gray-900 mb-2 overflow-hidden rounded relative">
                        <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-contain" draggable={false} />
                        
                        {/* Zoom Button - Bottom Right Corner - HOVER TRIGGER ONLY */}
                        <div 
                            onMouseEnter={() => setHoveredZoomIndex(index)}
                            onMouseLeave={() => setHoveredZoomIndex(null)}
                            onClick={(e) => { e.stopPropagation(); setViewingPageIndex(index); }}
                            className="absolute bottom-1 right-1 p-1.5 bg-white/90 dark:bg-gray-800/90 rounded-full text-gray-600 dark:text-gray-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition shadow-sm border border-gray-200 dark:border-gray-700 cursor-zoom-in"
                        >
                            <Search size={14} />
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 px-1">
                        <span>{t.page} {index + 1}</span>
                        <button 
                          onClick={() => handleDeletePage(index)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer (Only shown in Grid Mode) */}
        {viewingPageIndex === null && (
          <div className="h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white dark:bg-gray-900">
             
             {/* Add Pages Button & Counter */}
             <div className="flex items-center space-x-4">
                <label className="cursor-pointer flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium transition text-sm">
                    <Plus size={16} className="mr-2" />
                    {t.addPages}
                    <input 
                        type="file" 
                        multiple 
                        accept="application/pdf,image/*" 
                        className="hidden" 
                        onChange={handleAddFiles}
                    />
                </label>
                {pages.length > 0 && (
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {t.total}: {pages.length}
                    </span>
                )}
             </div>

             <div className="flex space-x-4">
                <button onClick={onClose} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">{t.cancel}</button>
                <button 
                onClick={handleSave} 
                disabled={pages.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium flex items-center shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                <Save size={18} className="mr-2" />
                {t.savePdf}
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfEditorModal;