
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Trash2, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Search, Grid, Plus, RotateCcw, RotateCw, Undo2, RefreshCcw, Check, Crop as CropIcon, Sparkles } from 'lucide-react';
import { ImageItem, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { detectDocumentCorners, applyPerspectiveCrop, applyImageAdjustments } from '../services/cvService';

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

interface Point {
  x: number;
  y: number;
}

const PdfEditorModal: React.FC<PdfEditorModalProps> = ({ item, isOpen, onClose, onUpdate, language }) => {
  const t = TRANSLATIONS[language];
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingPageIndex, setViewingPageIndex] = useState<number | null>(null);
  const [pageZoom, setPageZoom] = useState(0.5); 
  const [highResPageUrl, setHighResPageUrl] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{w: number, h: number} | null>(null);
  
  const [points, setPoints] = useState<Point[] | null>(null);
  const [isDraggingPoints, setIsDraggingPoints] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ index: number; type: 'corner' | 'edge' | 'center' } | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCropping, setIsCropping] = useState(true); 
  const [showPdfHighlight, setShowPdfHighlight] = useState(true);

  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ left: number, top: number }>({ left: 0, top: 0 });
  const dragStartPosRef = useRef<Point>({ x: 0, y: 0 });
  const initialPointsRef = useRef<Point[] | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      initializeEditor();
      setShowPdfHighlight(true);
    }
  }, [isOpen]);

  const initializeEditor = async () => {
    setIsLoading(true);
    setPages([]);
    try {
      // If the current URL is different from the original URL, it means the PDF has been edited.
      // In this case, we MUST load from the URL (which is a blob of the edited PDF)
      // and NOT from the originalFile (which contains the raw initial PDF).
      const isEdited = item.url !== item.originalUrl;
      const fileToUse = isEdited ? undefined : item.originalFile;
      
      await processFile(item.url, item.type, fileToUse);
    } catch (e) {
      console.error(t.initEditorError, e);
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (url: string, type: 'pdf' | 'image', file?: File) => {
    if (type === 'pdf') {
      if (!window.pdfjsLib) return;
      let arrayBuffer;
      if (file) arrayBuffer = await file.arrayBuffer();
      else arrayBuffer = await fetch(url).then(res => res.arrayBuffer());
      
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const newPages: PdfPage[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
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
      setPages(prev => [...prev, {
        originalIndex: 0,
        thumbnail: url,
        id: Math.random().toString(36).substr(2, 9),
        sourceUrl: url,
        sourceType: 'image',
        originalFile: file
      }]);
    }
  };

  const loadHighRes = async (index: number) => {
    setHighResPageUrl(null);
    setImgNaturalSize(null);
    const page = pages[index];
    try {
      let url = "";
      let w = 0, h = 0;
      if (page.sourceType === 'pdf') {
          let arrayBuffer;
          if (page.originalFile) arrayBuffer = await page.originalFile.arrayBuffer();
          else arrayBuffer = await fetch(page.sourceUrl).then(res => res.arrayBuffer());
          const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pdfPage = await pdf.getPage(page.originalIndex + 1);
          const viewport = pdfPage.getViewport({ scale: 2.5 }); 
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          if (context) {
             await pdfPage.render({ canvasContext: context, viewport }).promise;
             url = canvas.toDataURL();
             w = viewport.width; h = viewport.height;
             
             const containerWidth = scrollContainerRef.current?.clientWidth || window.innerWidth;
             const containerHeight = scrollContainerRef.current?.clientHeight || window.innerHeight;
             const padding = 48;
             const fitZoom = Math.min(
               (containerWidth - padding) / w,
               (containerHeight - padding) / h,
               1
             );
             setPageZoom(fitZoom);
          }
      } else {
          url = page.thumbnail;
          const img = new Image();
          img.src = url;
          await new Promise(r => img.onload = r);
          w = img.width; h = img.height;
          
          const containerWidth = scrollContainerRef.current?.clientWidth || window.innerWidth;
          const containerHeight = scrollContainerRef.current?.clientHeight || window.innerHeight;
          const padding = 48;
          const fitZoom = Math.min(
            (containerWidth - padding) / w,
            (containerHeight - padding) / h,
            1
          );
          setPageZoom(fitZoom);
      }
      
      setHighResPageUrl(url);
      setImgNaturalSize({ w, h });
      
      if (historyIndex === -1) {
          setPageHistory([url]);
          setHistoryIndex(0);
          await triggerDetection(url, w, h);
      }
    } catch (e) { console.error(e); }
  };

  const triggerDetection = async (url: string, w: number, h: number) => {
    setIsLoading(true);
    const detected = await detectDocumentCorners(url, t);
    if (detected) setPoints(detected);
    else setPoints([{ x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 }]);
    setIsLoading(false);
  };

  useEffect(() => {
    if (viewingPageIndex !== null) {
        setPageHistory([]);
        setHistoryIndex(-1);
        setIsCropping(true);
        loadHighRes(viewingPageIndex);
    }
  }, [viewingPageIndex]);

  const addToHistory = (url: string) => {
      const newHistory = pageHistory.slice(0, historyIndex + 1);
      newHistory.push(url);
      setPageHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setHighResPageUrl(url);
      setPages(prev => prev.map((p, i) => i === viewingPageIndex ? { ...p, thumbnail: url, sourceType: 'image', originalFile: undefined } : p));
  };

  const handleRotate = async (dir: 'L' | 'R') => {
      if (!highResPageUrl || !imgNaturalSize) return;
      setIsLoading(true);
      const angle = dir === 'L' ? -90 : 90;
      const newUrl = await applyImageAdjustments(highResPageUrl, 100, 100, angle, t);
      
      // Update natural size by swapping width and height for 90-degree rotation
      const nextW = imgNaturalSize.h;
      const nextH = imgNaturalSize.w;
      setImgNaturalSize({ w: nextW, h: nextH });
      
      addToHistory(newUrl);
      
      // Reiniciar a ferramenta de recorte após a rotação
      setPoints(null);
      await triggerDetection(newUrl, nextW, nextH);
      
      setIsLoading(false);
  };

  const handleUndo = async () => {
      if (historyIndex > 0) {
          const prevUrl = pageHistory[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          setHighResPageUrl(prevUrl);
          setIsCropping(true); 
          setPages(prev => prev.map((p, i) => i === viewingPageIndex ? { ...p, thumbnail: prevUrl } : p));
          if (imgNaturalSize) await triggerDetection(prevUrl, imgNaturalSize.w, imgNaturalSize.h);
      }
  };

  const handleReset = async () => {
      if (pageHistory.length > 0) {
          const original = pageHistory[0];
          setHistoryIndex(0);
          setHighResPageUrl(original);
          setIsCropping(true);
          setPages(prev => prev.map((p, i) => i === viewingPageIndex ? { ...p, thumbnail: original } : p));
          if (imgNaturalSize) await triggerDetection(original, imgNaturalSize.w, imgNaturalSize.h);
      }
  };

  const handleConfirmEdit = async () => {
      if (isCropping && points && highResPageUrl) {
          setIsLoading(true);
          try {
            const cropped = await applyPerspectiveCrop(highResPageUrl, points, t);
            addToHistory(cropped);
            setIsCropping(false);
            setPoints(null);
          } catch(e) { console.error(e); }
          setIsLoading(false);
      }
  };

  const handleRecrop = async () => {
    if (!highResPageUrl || !imgNaturalSize) return;
    setIsCropping(true);
    await triggerDetection(highResPageUrl, imgNaturalSize.w, imgNaturalSize.h);
  };

  const getCenterPoint = (pts: Point[]) => ({
    x: pts.reduce((acc, p) => acc + p.x, 0) / 4,
    y: pts.reduce((acc, p) => acc + p.y, 0) / 4,
  });

  const dragScaleRef = useRef<number>(1);
  const [magnifierPoint, setMagnifierPoint] = useState<Point | null>(null);

  const getMidPoint = (p1: Point, p2: Point) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewingPageIndex === null || !imageRef.current || !imgNaturalSize) return;
    
    if (isSpacePressed) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        if (scrollContainerRef.current) {
            scrollStartRef.current = {
                left: scrollContainerRef.current.scrollLeft,
                top: scrollContainerRef.current.scrollTop
            };
        }
        return;
    }

    if (!points) return;
    
    const imgRect = imageRef.current.getBoundingClientRect();
    const scale = imgNaturalSize.w / imgRect.width;
    dragScaleRef.current = scale;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const handleRadius = 35; 

    // Check Corners
    for (let i = 0; i < 4; i++) {
        const hx = imgRect.left + (points[i].x / scale);
        const hy = imgRect.top + (points[i].y / scale);
        if (Math.hypot(clientX - hx, clientY - hy) < handleRadius) {
            e.preventDefault();
            setIsDraggingPoints(true);
            setDragInfo({ index: i, type: 'corner' });
            setMagnifierPoint(points[i]);
            dragStartPosRef.current = { x: clientX, y: clientY };
            initialPointsRef.current = JSON.parse(JSON.stringify(points));
            return;
        }
    }
    
    // Check Edges
    for (let i = 0; i < 4; i++) {
        const mid = getMidPoint(points[i], points[(i + 1) % 4]);
        const hx = imgRect.left + (mid.x / scale);
        const hy = imgRect.top + (mid.y / scale);
        if (Math.hypot(clientX - hx, clientY - hy) < handleRadius) {
            e.preventDefault();
            setIsDraggingPoints(true);
            setDragInfo({ index: i, type: 'edge' });
            setMagnifierPoint(mid);
            dragStartPosRef.current = { x: clientX, y: clientY };
            initialPointsRef.current = JSON.parse(JSON.stringify(points));
            return;
        }
    }
    
    // Check Center
    const center = getCenterPoint(points);
    const hx = imgRect.left + (center.x / scale);
    const hy = imgRect.top + (center.y / scale);
    if (Math.hypot(clientX - hx, clientY - hy) < handleRadius) {
        e.preventDefault();
        setIsDraggingPoints(true);
        setDragInfo({ index: 8, type: 'center' });
        setMagnifierPoint(center);
        dragStartPosRef.current = { x: clientX, y: clientY };
        initialPointsRef.current = JSON.parse(JSON.stringify(points));
    }
  };

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning && scrollContainerRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        scrollContainerRef.current.scrollLeft = scrollStartRef.current.left - dx;
        scrollContainerRef.current.scrollTop = scrollStartRef.current.top - dy;
        return;
    }

    if (isDraggingPoints && initialPointsRef.current && dragInfo && imgNaturalSize) {
        const scale = dragScaleRef.current;
        const dx = (e.clientX - dragStartPosRef.current.x) * scale;
        const dy = (e.clientY - dragStartPosRef.current.y) * scale;
        const newPoints = JSON.parse(JSON.stringify(initialPointsRef.current));

        if (dragInfo.type === 'corner') {
            newPoints[dragInfo.index].x = Math.max(0, Math.min(imgNaturalSize.w, newPoints[dragInfo.index].x + dx));
            newPoints[dragInfo.index].y = Math.max(0, Math.min(imgNaturalSize.h, newPoints[dragInfo.index].y + dy));
            setMagnifierPoint(newPoints[dragInfo.index]);
        } else if (dragInfo.type === 'edge') {
            const idx1 = dragInfo.index;
            const idx2 = (dragInfo.index + 1) % 4;
            newPoints[idx1].x = Math.max(0, Math.min(imgNaturalSize.w, newPoints[idx1].x + dx));
            newPoints[idx1].y = Math.max(0, Math.min(imgNaturalSize.h, newPoints[idx1].y + dy));
            newPoints[idx2].x = Math.max(0, Math.min(imgNaturalSize.w, newPoints[idx2].x + dx));
            newPoints[idx2].y = Math.max(0, Math.min(imgNaturalSize.h, newPoints[idx2].y + dy));
            setMagnifierPoint(getMidPoint(newPoints[idx1], newPoints[idx2]));
        } else {
            for (let i = 0; i < 4; i++) {
                newPoints[i].x = Math.max(0, Math.min(imgNaturalSize.w, newPoints[i].x + dx));
                newPoints[i].y = Math.max(0, Math.min(imgNaturalSize.h, newPoints[i].y + dy));
            }
            setMagnifierPoint(getCenterPoint(newPoints));
        }
        setPoints(newPoints);
    }
  }, [isDraggingPoints, dragInfo, imgNaturalSize, isPanning]);

  useEffect(() => {
    if (isDraggingPoints || isPanning) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        const stopDrag = () => {
            setIsDraggingPoints(false);
            setIsPanning(false);
            setMagnifierPoint(null);
        };
        window.addEventListener('mouseup', stopDrag);
        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', stopDrag);
        };
    }
  }, [isDraggingPoints, isPanning, handleWindowMouseMove]);

  const handleSaveAll = async () => {
    if (!window.PDFLib || !window.pdfjsLib) return;
    setIsLoading(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const newPdf = await PDFDocument.create();
      
      for (const page of pages) {
        let pngBytes: Uint8Array | null = null;
        
        if (page.sourceType === 'pdf') {
          // For unedited PDF pages, render them in high resolution (scale 2.5)
          try {
            let arrayBuffer;
            if (page.originalFile) {
              arrayBuffer = await page.originalFile.arrayBuffer();
            } else {
              arrayBuffer = await fetch(page.sourceUrl).then(res => res.arrayBuffer());
            }
            
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pdfPage = await pdf.getPage(page.originalIndex + 1);
            const viewport = pdfPage.getViewport({ scale: 2.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            if (context) {
              await pdfPage.render({ canvasContext: context, viewport }).promise;
              const dataUrl = canvas.toDataURL('image/png');
              const resp = await fetch(dataUrl);
              const blob = await resp.blob();
              pngBytes = new Uint8Array(await blob.arrayBuffer());
            }
          } catch (err) {
            console.error(t.renderHighResError, err);
            // Fallback to thumbnail if high-res fails
            const resp = await fetch(page.thumbnail);
            const blob = await resp.blob();
            pngBytes = new Uint8Array(await blob.arrayBuffer());
          }
        } else {
          // For edited pages (sourceType === 'image'), use the thumbnail which is already high-res
          const resp = await fetch(page.thumbnail);
          const blob = await resp.blob();
          pngBytes = new Uint8Array(await blob.arrayBuffer());
        }

        if (pngBytes) {
          const image = await newPdf.embedPng(pngBytes);
          const { width, height } = image.scale(1);
          const newPage = newPdf.addPage([width, height]);
          newPage.drawImage(image, { x: 0, y: 0, width, height });
        }
      }
      
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newUrl = URL.createObjectURL(blob);
      onUpdate({ ...item, url: newUrl });
      onClose();
    } catch (error) { 
      console.error(t.savePdfError, error);
      alert(t.savePdfError);
    }
    finally { setIsLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md transition-all">
      <div className="bg-[#0A0C10] w-full h-full flex flex-col overflow-hidden text-white">
        
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[#0D1117] z-[110]">
          <div className="flex items-center space-x-3">
             <h2 className="text-base font-bold tracking-tight">{t.pdfEditorTitle}</h2>
             {viewingPageIndex !== null && (
               <div className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-emerald-500/20">
                 {t.page} {viewingPageIndex + 1} / {pages.length}
               </div>
             )}
          </div>
          <div className="flex items-center space-x-6">
             <div className="flex items-center space-x-2">
               <button onClick={() => setPageZoom(z => Math.max(0.05, z-0.05))} className="p-1.5 text-gray-400 hover:text-white transition"><ZoomOut size={20} /></button>
               <span className="text-[11px] font-black w-10 text-center text-gray-400 uppercase">{Math.round((viewingPageIndex !== null ? pageZoom : 1) * 100)}%</span>
               <button onClick={() => setPageZoom(z => Math.min(5, z+0.05))} className="p-1.5 text-gray-400 hover:text-white transition"><ZoomIn size={20} /></button>
             </div>
             <div className="h-6 w-px bg-white/10" />
             <button onClick={onClose} className="text-gray-400 hover:text-white transition"><X size={24} /></button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden bg-black flex flex-col">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-[120] backdrop-blur-sm">
               <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500 border-r-transparent mb-4"></div>
               <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">{t.processing}</span>
            </div>
          )}

          {/* New Feature Highlight Balloon */}
          {showPdfHighlight && !isLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] animate-fade-in">
              <div className="bg-emerald-600 text-white p-4 rounded-3xl shadow-2xl border border-emerald-400 max-w-sm flex items-start space-x-4 relative">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Sparkles size={24} className="text-white animate-pulse" />
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-sm uppercase tracking-tight mb-1">{t.pdfEditHighlight}</h4>
                  <p className="text-xs text-emerald-50/80 leading-relaxed font-medium">
                    {t.pdfEditHighlightText}
                  </p>
                </div>
                <button onClick={() => setShowPdfHighlight(false)} className="p-1 hover:bg-white/10 rounded-full transition">
                  <X size={18} />
                </button>
                {/* Connector point */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-emerald-600" />
              </div>
            </div>
          )}

          {/* Magnifier (Lupa) */}
          {isDraggingPoints && points && dragInfo && imageRef.current && highResPageUrl && magnifierPoint && (
            <div className="fixed top-20 right-20 w-56 h-56 border-4 border-emerald-500 rounded-full overflow-hidden shadow-2xl z-[150] bg-white dark:bg-gray-800 pointer-events-none">
              {(() => {
                const targetPoint = magnifierPoint;
                
                return (
                  <div 
                    className="absolute inset-0 origin-top-left" 
                    style={{
                      backgroundImage: `url(${highResPageUrl})`,
                      backgroundSize: `${imgNaturalSize!.w * 5}px ${imgNaturalSize!.h * 5}px`,
                      backgroundPosition: `-${targetPoint.x * 5 - 112}px -${targetPoint.y * 5 - 112}px`,
                      backgroundRepeat: 'no-repeat'
                    }}
                  />
                );
              })()}
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-6 h-6 border-2 border-emerald-500 rounded-full shadow-lg" />
                 <div className="absolute w-[1px] h-full bg-emerald-500/50" />
                 <div className="absolute h-[1px] w-full bg-emerald-500/50" />
              </div>
            </div>
          )}
          
          {viewingPageIndex !== null ? (
            <div className="w-full h-full flex flex-col relative overflow-hidden">
               {/* Scroll container robusto: centraliza se pequeno, permite scroll se grande */}
               <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-[#050608] custom-scrollbar flex p-24 relative">
                 <div className={`m-auto relative bg-white shadow-2xl ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : ''}`} style={{ 
                     width: imgNaturalSize ? `${imgNaturalSize.w * pageZoom}px` : 'auto', 
                     height: imgNaturalSize ? `${imgNaturalSize.h * pageZoom}px` : 'auto' 
                   }} onMouseDown={handleMouseDown}>
                    {highResPageUrl && imgNaturalSize && (
                      <>
                        <img 
                          ref={imageRef} 
                          src={highResPageUrl} 
                          alt="Page" 
                          className="w-full h-full block pointer-events-none object-contain max-w-none max-h-none" 
                          draggable={false} 
                        />
                        {points && isCropping && (
                          <svg 
                            className={`absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10 ${isPanning || isSpacePressed ? 'pointer-events-none' : 'pointer-events-auto'}`} 
                            style={{ pointerEvents: isPanning || isSpacePressed ? 'none' : 'auto' }}
                          >
                            {(() => {
                                const rectW = imageRef.current?.getBoundingClientRect().width || (imgNaturalSize.w * pageZoom);
                                const scale = imgNaturalSize.w / rectW;
                                
                                return (
                                    <>
                                        <polygon 
                                          points={points.map(p => `${p.x / scale},${p.y / scale}`).join(' ')} 
                                          fill="rgba(16, 185, 129, 0.15)" 
                                          stroke="#10b981" 
                                          strokeWidth="3" 
                                        />
                                        
                                        {/* Corners */}
                                        {points.map((p, i) => (
                                          <circle 
                                            key={`corner-${i}`} 
                                            cx={p.x / scale} 
                                            cy={p.y / scale} 
                                            r="14" 
                                            fill="white" 
                                            stroke="#10b981" 
                                            strokeWidth="4" 
                                            className="pointer-events-auto cursor-pointer shadow-xl" 
                                          />
                                        ))}
                                        
                                        {/* Edge handles */}
                                        {[0, 1, 2, 3].map((i) => {
                                          const mid = getMidPoint(points[i], points[(i + 1) % 4]);
                                          const p1 = points[i];
                                          const p2 = points[(i+1)%4];
                                          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
                                          return (
                                            <rect 
                                              key={`edge-${i}`} 
                                              x={mid.x / scale - 18} 
                                              y={mid.y / scale - 6} 
                                              width="36" height="12" rx="6"
                                              fill="#ffffff" stroke="#10b981" strokeWidth="2.5" 
                                              style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${mid.x/scale}px ${mid.y/scale}px` }}
                                              className="pointer-events-auto cursor-pointer shadow-lg" 
                                            />
                                          );
                                        })}
                                        
                                        {/* Center handle */}
                                        {(() => {
                                            const center = {
                                              x: points.reduce((acc, p) => acc + p.x, 0) / 4,
                                              y: points.reduce((acc, p) => acc + p.y, 0) / 4,
                                            };
                                            return (
                                                <circle 
                                                    cx={center.x / scale} 
                                                    cy={center.y / scale} 
                                                    r="12" 
                                                    fill="#10b981" 
                                                    stroke="white" 
                                                    strokeWidth="3" 
                                                    className="pointer-events-auto cursor-move shadow-lg" 
                                                />
                                            );
                                        })()}
                                    </>
                                );
                            })()}
                          </svg>
                        )}
                      </>
                    )}
                 </div>
               </div>

               {/* Toolbar Inferior */}
               <div className="h-20 bg-[#0D1117] border-t border-white/5 flex items-center justify-between px-8 z-[110]">
                  <div className="flex items-center space-x-6">
                    <button onClick={() => setViewingPageIndex(null)} className="flex items-center text-xs font-bold text-gray-400 hover:text-white transition uppercase tracking-wider pr-4 border-r border-white/10">
                      <Grid size={18} className="mr-2" />
                      {t.backToGrid}
                    </button>
                    
                    <div className="flex items-center bg-white/5 p-1 rounded-xl space-x-1">
                        <button onClick={() => handleRotate('L')} className="p-3 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-lg transition" title={t.rotateLeft}><RotateCcw size={18} /></button>
                        <button onClick={() => handleRotate('R')} className="p-3 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-lg transition" title={t.rotateRight}><RotateCw size={18} /></button>
                        <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-3 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-lg transition disabled:opacity-20" title={t.undo}><Undo2 size={18} /></button>
                        <button onClick={handleReset} className="p-3 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition" title={t.reset}><RefreshCcw size={18} /></button>
                    </div>

                    <button 
                      onClick={handleConfirmEdit}
                      disabled={!isCropping}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition flex items-center space-x-2 shadow-lg ${isCropping ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                    >
                        <Check size={18} />
                        <span>{t.confirm}</span>
                    </button>
                    
                    {!isCropping && (
                      <button onClick={handleRecrop} className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition flex items-center space-x-2 border border-emerald-500/20 px-4" title={t.recrop}>
                        <CropIcon size={18} />
                        <span className="text-[10px] font-bold uppercase">{t.recrop}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-3">
                    <button disabled={viewingPageIndex === 0} onClick={() => setViewingPageIndex(v => v! - 1)} className="p-4 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-10 transition"><ArrowLeft size={24} /></button>
                    <button disabled={viewingPageIndex === pages.length - 1} onClick={() => setViewingPageIndex(v => v! + 1)} className="p-4 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-10 transition"><ArrowRight size={24} /></button>
                  </div>
               </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-12 bg-[#050608] custom-scrollbar">
                <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))` }}>
                  {pages.map((page, index) => (
                    <div key={page.id} className="group relative">
                      <div 
                        onClick={() => setViewingPageIndex(index)}
                        className="aspect-[1/1.4] bg-[#0D1117] rounded-2xl overflow-hidden relative shadow-lg cursor-zoom-in border border-white/5 group-hover:border-emerald-500/50 transition-all duration-300"
                      >
                        <img src={page.thumbnail} alt="Page" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Search size={32} className="text-emerald-400" />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between px-1">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t.pageShort} {index + 1}</span>
                        <button onClick={() => setPages(pages.filter((_, i) => i !== index))} className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  
                  <label className="aspect-[1/1.4] rounded-2xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-gray-600 hover:text-emerald-500 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group">
                    <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t.addPages}</span>
                    <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => {
                      if(e.target.files) {
                        for(let i=0; i<e.target.files.length; i++) {
                          const file = e.target.files[i];
                          processFile(URL.createObjectURL(file), file.type === 'application/pdf' ? 'pdf' : 'image', file);
                        }
                      }
                    }}/>
                  </label>
                </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {viewingPageIndex === null && (
          <footer className="h-16 border-t border-white/5 bg-[#0D1117] flex items-center justify-between px-8">
             <button onClick={onClose} className="text-xs font-bold text-gray-500 hover:text-white transition uppercase tracking-widest">{t.cancel}</button>
             <div className="flex items-center space-x-4">
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t.total}: {pages.length} {t.items}</span>
                <button onClick={handleSaveAll} className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-500/20 transition-all active:scale-95">
                  {t.savePdf}
                </button>
             </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default PdfEditorModal;
