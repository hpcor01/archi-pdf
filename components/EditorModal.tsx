
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Eraser, Check, Undo, RotateCcw, Redo, ZoomIn, ZoomOut, Search, Crop as CropIcon, Sliders, RotateCw } from 'lucide-react';
import { ImageItem, Language } from '../types';
import { removeBackground, applyImageAdjustments } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';

type Tool = 'none' | 'crop' | 'adjust';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EditorModalProps {
  item: ImageItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedItem: ImageItem) => void;
  language: Language;
}

const EditorModal: React.FC<EditorModalProps> = ({ item, isOpen, onClose, onUpdate, language }) => {
  const t = TRANSLATIONS[language];
  
  // History State
  const [history, setHistory] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('crop'); 
  
  // Crop State
  const [crop, setCrop] = useState<Rect | null>(null); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<'create' | 'move' | 'resize' | null>(null);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  
  // Adjustments State
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0); 
  
  // Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ left: number, top: number }>({ left: 0, top: 0 });

  const dragStartPosRef = useRef<Point>({ x: 0, y: 0 }); 
  const cropStartRectRef = useRef<Rect | null>(null); 

  const [zoom, setZoom] = useState(1);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHistory([item.url]);
      setCurrentIndex(0);
      setCrop(null);
      setIsDragging(false);
      setZoom(1);
      setActiveTool('none');
      setIsPanning(false);
      setBrightness(100);
      setContrast(100);
      setRotation(0);
    }
  }, [item, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        if (isPanning) setIsPanning(false); 
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  const currentImage = history[currentIndex] || item.url;

  const pushToHistory = (newUrl: string) => {
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newUrl);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
    setCrop(null);
    setBrightness(100);
    setContrast(100);
    setRotation(0); 
  };

  const normalizeRect = (r: Rect): Rect => {
    return {
      x: r.w < 0 ? r.x + r.w : r.x,
      y: r.h < 0 ? r.y + r.h : r.y,
      w: Math.abs(r.w),
      h: Math.abs(r.h)
    };
  };

  const getClientToNaturalScale = () => {
    if (!imageRef.current || !wrapperRef.current) return 1;
    const rect = imageRef.current.getBoundingClientRect();
    if (rect.width === 0) return 1;
    return imageRef.current.naturalWidth / rect.width;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isProcessing || !imageRef.current || !wrapperRef.current) return;
    
    e.preventDefault();

    if (isSpacePressed || activeTool === 'none') {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) {
            scrollStartRef.current = {
                left: containerRef.current.scrollLeft,
                top: containerRef.current.scrollTop
            };
        }
        return;
    }

    const imgRect = imageRef.current.getBoundingClientRect();
    const scale = getClientToNaturalScale();

    const clientX = e.clientX;
    const clientY = e.clientY;
    
    const relX = clientX - imgRect.left;
    const relY = clientY - imgRect.top;
    
    const naturalX = relX * scale;
    const naturalY = relY * scale;

    if (activeTool === 'crop') {
      if (crop) {
        const screenCrop = {
            x: crop.x / scale + imgRect.left,
            y: crop.y / scale + imgRect.top,
            w: crop.w / scale,
            h: crop.h / scale
        };

        const handleRadius = 15;
        const handle = getHitHandle(clientX, clientY, screenCrop, handleRadius);

        if (handle) {
            setIsDragging(true);
            setDragAction('resize');
            setActiveHandle(handle);
            dragStartPosRef.current = { x: clientX, y: clientY };
            cropStartRectRef.current = { ...crop };
            return;
        }

        const normalizedCrop = normalizeRect(crop);
        const normX = normalizedCrop.x / scale;
        const normY = normalizedCrop.y / scale;
        const normW = normalizedCrop.w / scale;
        const normH = normalizedCrop.h / scale;

        if (
            relX >= normX && 
            relX <= normX + normW &&
            relY >= normY &&
            relY <= normY + normH
        ) {
            setIsDragging(true);
            setDragAction('move');
            dragStartPosRef.current = { x: clientX, y: clientY };
            cropStartRectRef.current = { ...crop };
            return;
        }
      }

      setIsDragging(true);
      setDragAction('create');
      dragStartPosRef.current = { x: clientX, y: clientY };
      
      const startRect = { x: naturalX, y: naturalY, w: 0, h: 0 };
      setCrop(startRect);
      cropStartRectRef.current = startRect;
    }
  };

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning && containerRef.current) {
        const deltaX = e.clientX - panStartRef.current.x;
        const deltaY = e.clientY - panStartRef.current.y;
        containerRef.current.scrollLeft = scrollStartRef.current.left - deltaX;
        containerRef.current.scrollTop = scrollStartRef.current.top - deltaY;
        return;
    }

    if (!isDragging || !imageRef.current || !cropStartRectRef.current) return;

    const scale = getClientToNaturalScale();
    const startPos = dragStartPosRef.current;
    const startRect = cropStartRectRef.current;

    const deltaX = (e.clientX - startPos.x) * scale;
    const deltaY = (e.clientY - startPos.y) * scale;

    const imgW = imageRef.current.naturalWidth;
    const imgH = imageRef.current.naturalHeight;

    if (dragAction === 'create') {
        let newW = deltaX;
        let newH = deltaY;
        setCrop({ ...startRect, w: newW, h: newH });

    } else if (dragAction === 'move') {
        let newX = startRect.x + deltaX;
        let newY = startRect.y + deltaY;

        const normStart = normalizeRect(startRect); 
        newX = Math.max(0, Math.min(newX, imgW - normStart.w));
        newY = Math.max(0, Math.min(newY, imgH - normStart.h));

        setCrop({ ...startRect, x: newX, y: newY });

    } else if (dragAction === 'resize' && activeHandle) {
        let { x, y, w, h } = startRect;

        if (activeHandle.includes('e')) w += deltaX;
        if (activeHandle.includes('w')) { x += deltaX; w -= deltaX; }
        if (activeHandle.includes('s')) h += deltaY;
        if (activeHandle.includes('n')) { y += deltaY; h -= deltaY; }

        setCrop({ x, y, w, h });
    }

  }, [isDragging, dragAction, activeHandle, isPanning]);

  const handleWindowMouseUp = useCallback(() => {
    if (isPanning) {
        setIsPanning(false);
    }
    
    if (isDragging) {
        setIsDragging(false);
        setDragAction(null);
        setActiveHandle(null);
        setCrop(prev => {
            if (!prev) return null;
            const norm = normalizeRect(prev);
            if (norm.w < 5 || norm.h < 5) return null;
            return norm;
        });
    }
  }, [isDragging, isPanning]);

  useEffect(() => {
    if (isDragging || isPanning) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging, isPanning, handleWindowMouseMove, handleWindowMouseUp]);

  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setCrop(null);
      setRotation(0);
    }
  };

  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setCrop(null);
      setRotation(0);
    }
  };

  const handleReset = () => {
    if (history.length > 0) {
      setCurrentIndex(0);
      setCrop(null);
      setZoom(1);
      setActiveTool('none');
      setBrightness(100);
      setContrast(100);
      setRotation(0);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.1));
  const handleZoomReset = () => setZoom(1);

  const handleRemoveBg = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      let sourceUrl = currentImage;
      if (brightness !== 100 || contrast !== 100 || rotation !== 0) {
          sourceUrl = await applyImageAdjustments(currentImage, brightness, contrast, rotation);
      }
      const newUrl = await removeBackground(sourceUrl);
      pushToHistory(newUrl);
    } catch (e) {
      alert("Background removal failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyAdjustments = async () => {
     if (isProcessing) return;
     if (brightness === 100 && contrast === 100 && rotation === 0) return;
     
     setIsProcessing(true);
     try {
         const newUrl = await applyImageAdjustments(currentImage, brightness, contrast, rotation);
         pushToHistory(newUrl);
     } catch(e) {
         console.error(e);
     } finally {
         setIsProcessing(false);
     }
  };

  const handleApplyCrop = () => {
    if (!crop || !imageRef.current) return;
    const norm = normalizeRect(crop);
    if (norm.w < 10 || norm.h < 10) return;

    const canvas = document.createElement('canvas');
    canvas.width = norm.w;
    canvas.height = norm.h;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      if (brightness !== 100 || contrast !== 100) {
         ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      }
      ctx.drawImage(
        imageRef.current,
        norm.x, norm.y, norm.w, norm.h,
        0, 0, norm.w, norm.h
      );
      pushToHistory(canvas.toDataURL());
    }
    setCrop(null);
  };

  const handleSave = async () => {
    let finalUrl = currentImage;
    if (brightness !== 100 || contrast !== 100 || rotation !== 0) {
        finalUrl = await applyImageAdjustments(currentImage, brightness, contrast, rotation);
    }
    if (activeTool === 'crop' && crop && rotation === 0) {
      const img = new Image();
      img.src = finalUrl;
      await new Promise(r => img.onload = r);
      
      const norm = normalizeRect(crop);
      if (norm.w > 5 && norm.h > 5) {
        const canvas = document.createElement('canvas');
        canvas.width = norm.w;
        canvas.height = norm.h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, norm.x, norm.y, norm.w, norm.h, 0, 0, norm.w, norm.h);
          finalUrl = canvas.toDataURL();
        }
      }
    }
    onUpdate({ ...item, url: finalUrl });
    onClose();
  };

  const getHitHandle = (mx: number, my: number, r: Rect, tol: number): ResizeHandle | null => {
    const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);
    if (dist(mx, my, r.x, r.y) < tol) return 'nw';
    if (dist(mx, my, r.x + r.w, r.y) < tol) return 'ne';
    if (dist(mx, my, r.x, r.y + r.h) < tol) return 'sw';
    if (dist(mx, my, r.x + r.w, r.y + r.h) < tol) return 'se';
    if (dist(mx, my, r.x + r.w/2, r.y) < tol) return 'n';
    if (dist(mx, my, r.x + r.w/2, r.y + r.h) < tol) return 's';
    if (dist(mx, my, r.x, r.y + r.h/2) < tol) return 'w';
    if (dist(mx, my, r.x + r.w, r.y + r.h/2) < tol) return 'e';
    return null;
  };

  const getCursor = () => {
      if (isPanning) return 'cursor-grabbing';
      if (isSpacePressed || activeTool === 'none') return 'cursor-grab';
      if (activeTool === 'crop') return 'cursor-crosshair';
      return 'cursor-default';
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-default"
    >
      <div className="bg-white dark:bg-gray-900 w-[90vw] h-[90vh] rounded-lg flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl transition-colors duration-300" onClick={e => e.stopPropagation()}>
        
        <div className="h-14 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t.editorTitle}</h2>
          
          <div className="flex items-center space-x-2">
             <div className="flex items-center space-x-1 mr-4 border-r border-gray-300 dark:border-gray-700 pr-4">
               <button onClick={handleZoomOut} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomOut}><ZoomOut size={18} /></button>
               <span className="text-xs w-10 text-center text-gray-500 dark:text-gray-400 font-medium select-none">{Math.round(zoom * 100)}%</span>
               <button onClick={handleZoomIn} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition" title={t.zoomIn}><ZoomIn size={18} /></button>
               <button onClick={handleZoomReset} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition ml-1" title={t.zoomReset}><Search size={16} /></button>
             </div>

             <button onClick={handleUndo} disabled={currentIndex <= 0} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Undo size={18} /></button>
             <button onClick={handleRedo} disabled={currentIndex >= history.length - 1} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Redo size={18} /></button>
             <button onClick={handleReset} disabled={currentIndex === 0 && history.length === 1} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition rounded hover:bg-gray-100 dark:hover:bg-gray-800"><RotateCcw size={18} /></button>
             <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-2" />
             <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"><X /></button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 bg-gray-50 dark:bg-gray-850 p-4 border-r border-gray-200 dark:border-gray-800 flex flex-col flex-shrink-0 z-20 overflow-y-auto">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t.imageTools}</div>
              
              <button 
                onClick={() => { setActiveTool('none'); handleRemoveBg(); }}
                disabled={activeTool === 'crop'}
                className="w-full flex items-center p-3 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                <Eraser className="mr-3 text-emerald-500 dark:text-emerald-400" size={18} />
                {t.removeBg}
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
              
              <div className={`border rounded-lg p-3 transition ${activeTool === 'adjust' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                 <button 
                  onClick={() => setActiveTool(activeTool === 'adjust' ? 'none' : 'adjust')}
                  className="w-full flex items-center text-left mb-2 text-gray-700 dark:text-gray-200"
                 >
                   <Sliders className="mr-3 text-blue-500 dark:text-blue-400" size={18} />
                   <span className="font-medium text-sm">Ajustes</span>
                 </button>
                 {activeTool === 'adjust' && (
                    <div className="mt-3 space-y-4 animate-fade-in">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t.adjustHelp}</p>
                      
                      <div>
                        <div className="flex justify-between text-xs mb-1 text-gray-600 dark:text-gray-300">
                            <span>{t.brightness}</span>
                            <span>{brightness}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="200" 
                            value={brightness} 
                            onChange={(e) => setBrightness(parseInt(e.target.value))} 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-emerald-500" 
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1 text-gray-600 dark:text-gray-300">
                            <span>{t.contrast}</span>
                            <span>{contrast}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="200" 
                            value={contrast} 
                            onChange={(e) => setContrast(parseInt(e.target.value))} 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-emerald-500" 
                        />
                      </div>

                      <div className="pt-1">
                         <div className="flex justify-between text-xs mb-1 text-gray-600 dark:text-gray-300">
                            <span>{t.rotate}</span>
                            <span>{rotation}°</span>
                         </div>
                         <div className="flex space-x-2">
                             <button 
                                onClick={() => setRotation(r => r - 90)}
                                className="flex-1 py-1.5 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 transition"
                                title="-90°"
                             >
                                <RotateCcw size={14} />
                             </button>
                             <button 
                                onClick={() => setRotation(r => r + 90)}
                                className="flex-1 py-1.5 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 transition"
                                title="+90°"
                             >
                                <RotateCw size={14} />
                             </button>
                         </div>
                      </div>

                      <button 
                        onClick={handleApplyAdjustments}
                        disabled={brightness === 100 && contrast === 100 && rotation === 0}
                        className="w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-50 transition"
                      >
                        {t.applyAdjustments}
                      </button>
                    </div>
                 )}
              </div>

              <div className={`border rounded-lg p-3 transition ${activeTool === 'crop' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                 <button 
                  onClick={() => {
                    setActiveTool(activeTool === 'crop' ? 'none' : 'crop');
                    setCrop(null); 
                  }}
                  disabled={rotation !== 0} 
                  className="w-full flex items-center text-left mb-2 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  title={rotation !== 0 ? "Aplique a rotação antes de recortar" : ""}
                 >
                   <CropIcon className="mr-3 text-orange-500 dark:text-orange-400" size={18} />
                   <span className="font-medium text-sm">{t.manualCrop}</span>
                 </button>
                 {activeTool === 'crop' && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t.cropInstructions}</p>
                      <button 
                        onClick={handleApplyCrop}
                        disabled={!crop}
                        className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-xs font-medium disabled:opacity-50 transition"
                      >
                        {t.applyCrop}
                      </button>
                    </div>
                 )}
              </div>
            </div>
          </div>

          <div 
             className="flex-1 bg-gray-100 dark:bg-gray-950 flex overflow-auto relative select-none custom-scrollbar"
             ref={containerRef}
          >
            <div className="min-w-full min-h-full flex items-center justify-center p-10">
                {isProcessing && (
                   <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">{t.processing}</span>
                   </div>
                )}
                
                <div 
                  ref={wrapperRef}
                  className={`relative inline-block border border-gray-300 dark:border-gray-700 shadow-xl 
                    ${getCursor()}
                    bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iI2YwZjBmMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZThlOGU4IiAvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZThlOGU4IiAvPjwvc3ZnPg==')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzIyMjIyMiI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMzMzMzMzIiAvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMzMzMzMzIiAvPjwvc3ZnPg==')]`}
                  onMouseDown={handleMouseDown}
                  style={{
                    touchAction: 'none',
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center',
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                  }}
                >
                  <img 
                    ref={imageRef}
                    src={currentImage} 
                    alt="Editing" 
                    className="block max-w-full max-h-[75vh] w-auto h-auto object-contain"
                    style={{ 
                       filter: `brightness(${brightness}%) contrast(${contrast}%)`
                    }} 
                    draggable={false}
                  />

                  {crop && activeTool === 'crop' && (
                    <>
                      {(() => {
                          const norm = normalizeRect(crop);
                          const scale = getClientToNaturalScale();
                          
                          const vx = norm.x / scale;
                          const vy = norm.y / scale;
                          const vw = norm.w / scale;
                          const vh = norm.h / scale;
                          
                          return (
                            <>
                              <div className="absolute top-0 left-0 right-0 bg-black/60 pointer-events-none" style={{ height: vy }} />
                              <div className="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none" style={{ top: vy + vh }} />
                              <div className="absolute left-0 bg-black/60 pointer-events-none" style={{ top: vy, height: vh, width: vx }} />
                              <div className="absolute right-0 bg-black/60 pointer-events-none" style={{ top: vy, height: vh, left: vx + vw }} />

                              <div 
                                className="absolute border-2 border-emerald-500 cursor-move"
                                style={{ left: vx, top: vy, width: vw, height: vh }}
                              >
                                 <div className="absolute inset-0 flex flex-col pointer-events-none opacity-50">
                                    <div className="flex-1 border-b border-white/50"></div>
                                    <div className="flex-1 border-b border-white/50"></div>
                                    <div className="flex-1"></div>
                                 </div>
                                 <div className="absolute inset-0 flex pointer-events-none opacity-50">
                                    <div className="flex-1 border-r border-white/50"></div>
                                    <div className="flex-1 border-r border-white/50"></div>
                                    <div className="flex-1"></div>
                                 </div>

                                 <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-nw-resize z-10" />
                                 <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-ne-resize z-10" />
                                 <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-sw-resize z-10" />
                                 <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-se-resize z-10" />
                                 
                                 <div className="absolute -top-1.5 left-1/2 -ml-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-n-resize z-10" />
                                 <div className="absolute -bottom-1.5 left-1/2 -ml-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-s-resize z-10" />
                                 <div className="absolute top-1/2 -mt-1.5 -left-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-w-resize z-10" />
                                 <div className="absolute top-1/2 -mt-1.5 -right-1.5 w-3 h-3 bg-white border border-emerald-500 rounded-full cursor-e-resize z-10" />
                              </div>
                            </>
                          );
                      })()}
                    </>
                  )}
                </div>
            </div>
          </div>
        </div>

        <div className="h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end px-6 space-x-4 bg-white dark:bg-gray-900 transition-colors z-20">
           <button onClick={onClose} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">{t.cancel}</button>
           <button onClick={handleSave} className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium flex items-center shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/20">
             <Check size={18} className="mr-2" />
             {t.confirm}
           </button>
        </div>
      </div>
    </div>
  );
};

export default EditorModal;
