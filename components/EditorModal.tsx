
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Eraser, Check, Undo, RotateCcw, Redo, ZoomIn, ZoomOut, Search, Crop as CropIcon, Sliders, RotateCw, Maximize } from 'lucide-react';
import { ImageItem, Language } from '../types';
import { removeBackground, applyImageAdjustments } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';

type Tool = 'none' | 'crop' | 'adjust';

interface Point {
  x: number;
  y: number;
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
  
  const [history, setHistory] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('crop'); 
  
  // Perspective Crop State: 4 corners (TL, TR, BR, BL)
  const [points, setPoints] = useState<Point[] | null>(null); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ index: number; type: 'corner' | 'edge' } | null>(null);
  
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0); 
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ left: number, top: number }>({ left: 0, top: 0 });
  const dragStartPosRef = useRef<Point>({ x: 0, y: 0 }); 
  const initialPointsRef = useRef<Point[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHistory([item.url]);
      setCurrentIndex(0);
      setPoints(null);
      setIsDragging(false);
      setZoom(1);
      setActiveTool('crop'); 
      setIsPanning(false);
      setBrightness(100);
      setContrast(100);
      setRotation(0);
    }
  }, [item, isOpen]);

  // Initialize crop points when image loads
  const handleImageLoad = () => {
    if (!imageRef.current || points) return;
    const w = imageRef.current.naturalWidth;
    const h = imageRef.current.naturalHeight;
    // Initial 80% inset
    setPoints([
      { x: w * 0.1, y: h * 0.1 }, // TL
      { x: w * 0.9, y: h * 0.1 }, // TR
      { x: w * 0.9, y: h * 0.9 }, // BR
      { x: w * 0.1, y: h * 0.9 }  // BL
    ]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
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
    setPoints(null); 
    setBrightness(100);
    setContrast(100);
    setRotation(0); 
  };

  const getClientToNaturalScale = () => {
    if (!imageRef.current) return 1;
    const rect = imageRef.current.getBoundingClientRect();
    if (rect.width === 0) return 1;
    return imageRef.current.naturalWidth / rect.width;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isProcessing || !imageRef.current || !points) return;
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

    if (activeTool === 'crop') {
      const imgRect = imageRef.current.getBoundingClientRect();
      const scale = getClientToNaturalScale();
      const clientX = e.clientX;
      const clientY = e.clientY;
      const handleRadius = 25 / zoom; 

      // Check Corners
      for (let i = 0; i < 4; i++) {
        const px = points[i].x / scale + imgRect.left;
        const py = points[i].y / scale + imgRect.top;
        if (Math.hypot(clientX - px, clientY - py) < handleRadius) {
          setIsDragging(true);
          setDragInfo({ index: i, type: 'corner' });
          dragStartPosRef.current = { x: clientX, y: clientY };
          initialPointsRef.current = JSON.parse(JSON.stringify(points));
          return;
        }
      }

      // Check Edges (Midpoints)
      for (let i = 0; i < 4; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % 4];
        const midX = (p1.x + p2.x) / 2 / scale + imgRect.left;
        const midY = (p1.y + p2.y) / 2 / scale + imgRect.top;
        if (Math.hypot(clientX - midX, clientY - midY) < handleRadius) {
          setIsDragging(true);
          setDragInfo({ index: i, type: 'edge' });
          dragStartPosRef.current = { x: clientX, y: clientY };
          initialPointsRef.current = JSON.parse(JSON.stringify(points));
          return;
        }
      }
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

    if (!isDragging || !points || !initialPointsRef.current || !dragInfo || !imageRef.current) return;

    const scale = getClientToNaturalScale();
    const deltaX = (e.clientX - dragStartPosRef.current.x) * scale;
    const deltaY = (e.clientY - dragStartPosRef.current.y) * scale;
    const newPoints = JSON.parse(JSON.stringify(initialPointsRef.current));
    const imgW = imageRef.current.naturalWidth;
    const imgH = imageRef.current.naturalHeight;

    if (dragInfo.type === 'corner') {
      newPoints[dragInfo.index].x = Math.max(0, Math.min(imgW, newPoints[dragInfo.index].x + deltaX));
      newPoints[dragInfo.index].y = Math.max(0, Math.min(imgH, newPoints[dragInfo.index].y + deltaY));
    } else {
      const idx1 = dragInfo.index;
      const idx2 = (dragInfo.index + 1) % 4;
      newPoints[idx1].x = Math.max(0, Math.min(imgW, newPoints[idx1].x + deltaX));
      newPoints[idx1].y = Math.max(0, Math.min(imgH, newPoints[idx1].y + deltaY));
      newPoints[idx2].x = Math.max(0, Math.min(imgW, newPoints[idx2].x + deltaX));
      newPoints[idx2].y = Math.max(0, Math.min(imgH, newPoints[idx2].y + deltaY));
    }

    setPoints(newPoints);
  }, [isDragging, dragInfo, isPanning, points]);

  const handleWindowMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setDragInfo(null);
  }, []);

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

  const warpPerspective = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, src: Point[], dst: Point[]) => {
    const triangulate = (p1: Point, p2: Point, p3: Point, d1: Point, d2: Point, d3: Point) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.lineTo(d3.x, d3.y);
      ctx.closePath();
      ctx.clip();

      const denom = (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      if (Math.abs(denom) < 0.0001) { ctx.restore(); return; }

      const a = ((d1.x - d3.x) * (p2.y - p3.y) - (d2.x - d3.x) * (p1.y - p3.y)) / denom;
      const b = ((d2.x - d3.x) * (p1.x - p3.x) - (d1.x - d3.x) * (p2.x - p3.x)) / denom;
      const c = d1.x - a * p1.x - b * p1.y;
      const d = ((d1.y - d3.y) * (p2.y - p3.y) - (d2.y - d3.y) * (p1.y - p3.y)) / denom;
      const e = ((d2.y - d3.y) * (p1.x - p3.x) - (d1.y - d3.y) * (p2.x - p3.x)) / denom;
      const f = d1.y - d * p1.x - e * p1.y;

      ctx.setTransform(a, d, b, e, c, f);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    triangulate(src[0], src[1], src[3], dst[0], dst[1], dst[3]);
    triangulate(src[1], src[2], src[3], dst[1], dst[2], dst[3]);
  };

  const executeCrop = async (): Promise<string> => {
    if (!points || !imageRef.current) return currentImage;
    
    const wTop = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const wBottom = Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y);
    const hLeft = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
    const hRight = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
    
    const targetW = Math.max(wTop, wBottom);
    const targetH = Math.max(hLeft, hRight);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      if (brightness !== 100 || contrast !== 100) {
         ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      }
      const dst = [
        { x: 0, y: 0 },
        { x: targetW, y: 0 },
        { x: targetW, y: targetH },
        { x: 0, y: targetH }
      ];
      warpPerspective(ctx, imageRef.current, points, dst);
      return canvas.toDataURL();
    }
    return currentImage;
  };

  const handleApplyCrop = async () => {
    setIsProcessing(true);
    const newUrl = await executeCrop();
    pushToHistory(newUrl);
    setIsProcessing(false);
  };

  const handleSave = async () => {
    setIsProcessing(true);
    let finalUrl = currentImage;
    
    // Se a ferramenta de recorte estiver ativa, aplica o recorte no salvamento
    if (activeTool === 'crop' && points) {
        finalUrl = await executeCrop();
    } else {
        // Aplica ajustes caso ferramentas não tenham sido "comitadas"
        if (brightness !== 100 || contrast !== 100 || rotation !== 0) {
            finalUrl = await applyImageAdjustments(finalUrl, brightness, contrast, rotation);
        }
    }

    onUpdate({ ...item, url: finalUrl });
    onClose();
    setIsProcessing(false);
  };

  const getCursor = () => {
      if (isPanning) return 'cursor-grabbing';
      if (isSpacePressed || activeTool === 'none') return 'cursor-grab';
      if (activeTool === 'crop') return 'cursor-crosshair';
      return 'cursor-default';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-default">
      <div className="bg-white dark:bg-gray-900 w-[95vw] h-[95vh] rounded-2xl flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl transition-colors duration-300 overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500 rounded-lg text-white">
              <Maximize size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t.editorTitle}</h2>
          </div>
          
          <div className="flex items-center space-x-2">
             <div className="flex items-center space-x-1 mr-4 border-r border-gray-300 dark:border-gray-700 pr-4">
               <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"><ZoomOut size={18} /></button>
               <span className="text-xs w-12 text-center text-gray-500 dark:text-gray-400 font-bold">{Math.round(zoom * 100)}%</span>
               <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"><ZoomIn size={18} /></button>
             </div>

             <button onClick={() => currentIndex > 0 && setCurrentIndex(c => c - 1)} disabled={currentIndex <= 0} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition rounded-lg"><Undo size={18} /></button>
             <button onClick={() => currentIndex < history.length - 1 && setCurrentIndex(c => c + 1)} disabled={currentIndex >= history.length - 1} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition rounded-lg"><Redo size={18} /></button>
             <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-2" />
             <button onClick={onClose} className="p-2 text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-full transition"><X /></button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 bg-gray-50 dark:bg-gray-850 p-6 border-r border-gray-200 dark:border-gray-800 flex flex-col flex-shrink-0 z-20 overflow-y-auto">
            <div className="space-y-6">
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{t.imageTools}</div>
                
                <button 
                  disabled={true}
                  className="w-full flex items-center p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-40 cursor-not-allowed text-gray-400 mb-4"
                  title="Em breve"
                >
                  <Eraser className="mr-3" size={20} />
                  <span className="font-bold text-sm">{t.removeBg}</span>
                </button>

                <div className={`border-2 rounded-xl p-4 transition-all mb-4 ${activeTool === 'adjust' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                   <button 
                    onClick={() => setActiveTool(activeTool === 'adjust' ? 'none' : 'adjust')}
                    className="w-full flex items-center text-left text-gray-700 dark:text-gray-200"
                   >
                     <Sliders className={`mr-3 ${activeTool === 'adjust' ? 'text-emerald-500' : 'text-blue-500'}`} size={20} />
                     <span className="font-bold text-sm">Ajustes Finos</span>
                   </button>
                   {activeTool === 'adjust' && (
                      <div className="mt-5 space-y-5 animate-fade-in">
                        <div>
                          <div className="flex justify-between text-[10px] font-bold mb-2 text-gray-500 uppercase">
                              <span>{t.brightness}</span>
                              <span>{brightness}%</span>
                          </div>
                          <input type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-bold mb-2 text-gray-500 uppercase">
                              <span>{t.contrast}</span>
                              <span>{contrast}%</span>
                          </div>
                          <input type="range" min="0" max="200" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                        </div>
                        <div className="pt-2">
                           <div className="text-[10px] font-bold mb-2 text-gray-500 uppercase">{t.rotate}</div>
                           <div className="flex space-x-2">
                               <button onClick={() => setRotation(r => r - 90)} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition text-gray-600 dark:text-gray-300"><RotateCcw size={16} className="mx-auto" /></button>
                               <button onClick={() => setRotation(r => r + 90)} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition text-gray-600 dark:text-gray-300"><RotateCw size={16} className="mx-auto" /></button>
                           </div>
                        </div>
                      </div>
                   )}
                </div>

                <div className={`border-2 rounded-xl p-4 transition-all ${activeTool === 'crop' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                   <button 
                    onClick={() => {
                      setActiveTool(activeTool === 'crop' ? 'none' : 'crop');
                      if (!points) handleImageLoad();
                    }}
                    className="w-full flex items-center text-left text-gray-700 dark:text-gray-200"
                   >
                     <CropIcon className={`mr-3 ${activeTool === 'crop' ? 'text-emerald-500' : 'text-orange-500'}`} size={20} />
                     <span className="font-bold text-sm">Recorte Manual</span>
                   </button>
                   {activeTool === 'crop' && (
                      <div className="mt-4 space-y-3 animate-fade-in">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium italic leading-relaxed">Arraste os cantos para ajustar a perspectiva do documento de forma personalizada.</p>
                      </div>
                   )}
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-700">
               <button onClick={handleSave} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center">
                 <Check size={20} className="mr-2" />
                 {t.confirm}
               </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div 
             className="flex-1 bg-gray-100 dark:bg-[#0a0a0c] flex overflow-auto relative select-none custom-scrollbar"
             ref={containerRef}
          >
            {/* Magnifier */}
            {isDragging && dragInfo && points && imageRef.current && (
                <div className="absolute top-4 left-4 z-[100] w-32 h-32 rounded-full border-4 border-emerald-500 bg-black overflow-hidden shadow-2xl pointer-events-none">
                    <div 
                        style={{
                            width: imageRef.current.naturalWidth,
                            height: imageRef.current.naturalHeight,
                            backgroundImage: `url(${currentImage})`,
                            backgroundSize: `${imageRef.current.naturalWidth}px ${imageRef.current.naturalHeight}px`,
                            backgroundPosition: `-${dragInfo.type === 'corner' ? points[dragInfo.index].x : (points[dragInfo.index].x + points[(dragInfo.index+1)%4].x)/2}px -${dragInfo.type === 'corner' ? points[dragInfo.index].y : (points[dragInfo.index].y + points[(dragInfo.index+1)%4].y)/2}px`,
                            transform: 'scale(2) translate(32px, 32px)',
                            filter: `brightness(${brightness}%) contrast(${contrast}%)`
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-px h-full bg-emerald-500/50"></div>
                        <div className="h-px w-full bg-emerald-500/50"></div>
                    </div>
                </div>
            )}

            <div className="min-w-full min-h-full flex items-center justify-center p-20">
                {isProcessing && (
                   <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
                      <div className="relative">
                        <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-emerald-500 shadow-emerald-500/40 shadow-2xl"></div>
                        <Maximize className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-500 animate-pulse" size={24} />
                      </div>
                      <span className="mt-6 text-emerald-400 font-black tracking-widest uppercase text-sm animate-pulse">{t.processing}</span>
                   </div>
                )}
                
                <div 
                  ref={wrapperRef}
                  className={`relative inline-block border border-gray-300 dark:border-gray-700 shadow-2xl transition-transform duration-200
                    ${getCursor()}
                    bg-[#111]`}
                  onMouseDown={handleMouseDown}
                  style={{
                    touchAction: 'none',
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  }}
                >
                  <img 
                    ref={imageRef}
                    src={currentImage} 
                    alt="Editing" 
                    onLoad={handleImageLoad}
                    className="block max-w-full max-h-[75vh] w-auto h-auto object-contain"
                    style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }} 
                    draggable={false}
                  />

                  {points && activeTool === 'crop' && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                      <defs>
                        <mask id="crop-mask">
                           <rect width="100%" height="100%" fill="white" />
                           <polygon 
                              points={points.map(p => {
                                const scale = getClientToNaturalScale();
                                return `${p.x/scale},${p.y/scale}`;
                              }).join(' ')} 
                              fill="black" 
                           />
                        </mask>
                      </defs>
                      
                      <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#crop-mask)" />
                      
                      <polygon 
                        points={points.map(p => {
                          const scale = getClientToNaturalScale();
                          return `${p.x/scale},${p.y/scale}`;
                        }).join(' ')} 
                        fill="transparent" 
                        stroke="#00ffff" 
                        strokeWidth="2"
                        strokeDasharray="4"
                      />

                      {(() => {
                        const scale = getClientToNaturalScale();
                        const elements = [];
                        
                        for (let i = 0; i < 4; i++) {
                          const px = points[i].x / scale;
                          const py = points[i].y / scale;
                          elements.push(
                            <g key={`corner-${i}`} className="pointer-events-auto cursor-pointer">
                              <circle cx={px} cy={py} r="12" fill="rgba(0,255,255,0.3)" stroke="#00ffff" strokeWidth="2" />
                              <circle cx={px} cy={py} r="4" fill="#00ffff" />
                            </g>
                          );
                        }

                        for (let i = 0; i < 4; i++) {
                          const p1 = points[i];
                          const p2 = points[(i + 1) % 4];
                          const mx = (p1.x + p2.x) / 2 / scale;
                          const my = (p1.y + p2.y) / 2 / scale;
                          elements.push(
                            <g key={`mid-${i}`} className="pointer-events-auto cursor-pointer">
                              <circle cx={mx} cy={my} r="8" fill="rgba(255,255,255,0.8)" stroke="#00ffff" strokeWidth="2" />
                            </g>
                          );
                        }
                        
                        return elements;
                      })()}
                    </svg>
                  )}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorModal;
