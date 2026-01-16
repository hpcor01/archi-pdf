
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Undo, RotateCcw, Redo, ZoomIn, ZoomOut, Search, Crop as CropIcon, Sliders, RotateCw, Maximize, Sparkles } from 'lucide-react';
import { ImageItem, Language } from '../types';
import { detectDocumentCorners, applyPerspectiveCrop, applyImageAdjustments } from '../services/cvService';
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

  const handlePerformAutoDetection = async (url: string) => {
    if (!imageRef.current) return;
    setIsProcessing(true);
    const detected = await detectDocumentCorners(url);
    if (detected) {
      setPoints(detected);
    } else {
      const w = imageRef.current.naturalWidth;
      const h = imageRef.current.naturalHeight;
      setPoints([{ x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 }]);
    }
    setIsProcessing(false);
  };

  const handleImageLoad = () => {
    if (!points) handlePerformAutoDetection(currentImage);
  };

  const currentImage = history[currentIndex] || item.url;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isProcessing || !imageRef.current || !points) return;
    e.preventDefault();
    if (isSpacePressed || activeTool === 'none') {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) scrollStartRef.current = { left: containerRef.current.scrollLeft, top: containerRef.current.scrollTop };
        return;
    }
    if (activeTool === 'crop') {
      const imgRect = imageRef.current.getBoundingClientRect();
      const rectW = imgRect.width;
      const natW = imageRef.current.naturalWidth;
      const scale = natW / rectW;
      const clientX = e.clientX; const clientY = e.clientY;
      const handleRadius = 25 / zoom; 
      for (let i = 0; i < 4; i++) {
        const px = points[i].x / scale + imgRect.left;
        const py = points[i].y / scale + imgRect.top;
        if (Math.hypot(clientX - px, clientY - py) < handleRadius) {
          setIsDragging(true); setDragInfo({ index: i, type: 'corner' });
          dragStartPosRef.current = { x: clientX, y: clientY };
          initialPointsRef.current = JSON.parse(JSON.stringify(points));
          return;
        }
      }
    }
  };

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning && containerRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        containerRef.current.scrollLeft = scrollStartRef.current.left - dx;
        containerRef.current.scrollTop = scrollStartRef.current.top - dy;
        return;
    }
    if (!isDragging || !points || !initialPointsRef.current || !dragInfo || !imageRef.current) return;
    const rectW = imageRef.current.getBoundingClientRect().width;
    const natW = imageRef.current.naturalWidth;
    const scale = natW / rectW;
    const dx = (e.clientX - dragStartPosRef.current.x) * scale;
    const dy = (e.clientY - dragStartPosRef.current.y) * scale;
    const newPoints = JSON.parse(JSON.stringify(initialPointsRef.current));
    newPoints[dragInfo.index].x = Math.max(0, Math.min(imageRef.current.naturalWidth, newPoints[dragInfo.index].x + dx));
    newPoints[dragInfo.index].y = Math.max(0, Math.min(imageRef.current.naturalHeight, newPoints[dragInfo.index].y + dy));
    setPoints(newPoints);
  }, [isDragging, dragInfo, isPanning, points]);

  useEffect(() => {
    if (isDragging || isPanning) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', () => { setIsDragging(false); setIsPanning(false); });
    }
    return () => { window.removeEventListener('mousemove', handleWindowMouseMove); };
  }, [isDragging, isPanning, handleWindowMouseMove]);

  const handleSave = async () => {
    setIsProcessing(true);
    let finalUrl = currentImage;
    try {
      if (activeTool === 'crop' && points) {
          finalUrl = await applyPerspectiveCrop(finalUrl, points);
      } else if (brightness !== 100 || contrast !== 100 || rotation !== 0) {
          finalUrl = await applyImageAdjustments(finalUrl, brightness, contrast, rotation);
      }
      onUpdate({ ...item, url: finalUrl });
      onClose();
    } catch (err) {
      alert("Erro ao salvar.");
    } finally { setIsProcessing(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 w-[95vw] h-[95vh] rounded-2xl flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl overflow-hidden">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500 rounded-lg text-white">
              <Maximize size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.editorTitle}</h2>
          </div>
          <div className="flex items-center space-x-2">
             <div className="flex items-center space-x-1 border-r pr-4 border-gray-200 dark:border-gray-700">
               <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition text-gray-600 dark:text-gray-400"><ZoomOut size={18} /></button>
               <span className="text-xs w-12 text-center font-bold text-gray-700 dark:text-gray-300">{Math.round(zoom * 100)}%</span>
               <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition text-gray-600 dark:text-gray-400"><ZoomIn size={18} /></button>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 rounded-full transition text-gray-400"><X /></button>
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-72 bg-gray-50 dark:bg-gray-850 p-6 border-r border-gray-200 dark:border-gray-800 flex flex-col z-20 overflow-y-auto">
            <div className="space-y-4">
              <div className={`border-2 rounded-xl p-4 transition-all ${activeTool === 'crop' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-gray-800 border-transparent'}`}>
                   <button onClick={() => setActiveTool(activeTool === 'crop' ? 'none' : 'crop')} className="w-full flex items-center text-left">
                     <CropIcon className={`mr-3 ${activeTool === 'crop' ? 'text-emerald-600' : 'text-gray-400'}`} size={20} />
                     <span className={`font-bold text-sm ${activeTool === 'crop' ? 'text-emerald-900 dark:text-emerald-100' : 'text-gray-600 dark:text-gray-400'}`}>Recorte Manual</span>
                   </button>
                   {activeTool === 'crop' && (
                      <div className="mt-4 animate-fade-in"><p className="text-[11px] text-emerald-800/70 dark:text-emerald-200/50 italic leading-relaxed">Arraste os cantos detectados para ajustar a perspectiva.</p></div>
                   )}
              </div>
              <div className={`border-2 rounded-xl p-4 transition-all ${activeTool === 'adjust' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-gray-800 border-transparent'}`}>
                   <button onClick={() => setActiveTool(activeTool === 'adjust' ? 'none' : 'adjust')} className="w-full flex items-center text-left">
                     <Sliders className={`mr-3 ${activeTool === 'adjust' ? 'text-emerald-600' : 'text-gray-400'}`} size={20} />
                     <span className={`font-bold text-sm ${activeTool === 'adjust' ? 'text-emerald-900 dark:text-emerald-100' : 'text-gray-600 dark:text-gray-400'}`}>Ajustes</span>
                   </button>
                   {activeTool === 'adjust' && (
                      <div className="mt-5 space-y-5 animate-fade-in">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-emerald-800 dark:text-emerald-200 uppercase"><span>Brilho</span><span>{brightness}%</span></div>
                          <input type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1.5 bg-emerald-200 dark:bg-emerald-900 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-emerald-800 dark:text-emerald-200 uppercase"><span>Contraste</span><span>{contrast}%</span></div>
                          <input type="range" min="0" max="200" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1.5 bg-emerald-200 dark:bg-emerald-900 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="flex space-x-2 pt-2 border-t border-emerald-100 dark:border-emerald-800">
                          <button onClick={() => setRotation(r => r - 90)} className="flex-1 py-2 bg-white dark:bg-gray-700 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition shadow-sm text-emerald-600"><RotateCcw size={16} className="mx-auto" /></button>
                          <button onClick={() => setRotation(r => r + 90)} className="flex-1 py-2 bg-white dark:bg-gray-700 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition shadow-sm text-emerald-600"><RotateCw size={16} className="mx-auto" /></button>
                        </div>
                      </div>
                   )}
              </div>
            </div>
            <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-800">
              <button onClick={handleSave} className="w-full bg-emerald-500 text-white py-4 rounded-xl font-black text-sm uppercase shadow-xl hover:bg-emerald-600 transition flex items-center justify-center group active:scale-95 transition-transform">
                <Check size={20} className="mr-2 group-hover:scale-125 transition-transform" />
                {t.confirm}
              </button>
            </div>
          </div>
          <div className="flex-1 bg-gray-100 dark:bg-[#0d1117] flex overflow-auto relative select-none custom-scrollbar" ref={containerRef}>
            <div className="min-w-full min-h-full flex items-center justify-center p-20">
                {isProcessing && (
                  <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-emerald-500 border-r-transparent border-b-emerald-500/20 border-l-transparent"></div>
                      <div className="absolute inset-0 flex items-center justify-center"><Sparkles className="text-emerald-400 animate-pulse" size={32} /></div>
                    </div>
                    <span className="text-emerald-400 font-bold uppercase tracking-widest text-sm mt-8 animate-pulse">{t.processing}</span>
                  </div>
                )}
                <div className={`relative inline-block border border-gray-300 dark:border-gray-700 shadow-2xl transition-transform duration-75 ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-crosshair'}`} onMouseDown={handleMouseDown} style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}>
                  <img ref={imageRef} src={currentImage} onLoad={handleImageLoad} className="block max-w-full max-h-[75vh] object-contain bg-white" style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }} draggable={false} />
                  {points && activeTool === 'crop' && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                      <polygon points={points.map(p => `${p.x / (imageRef.current!.naturalWidth / imageRef.current!.getBoundingClientRect().width)},${p.y / (imageRef.current!.naturalWidth / imageRef.current!.getBoundingClientRect().width)}`).join(' ')} fill="rgba(16, 185, 129, 0.1)" stroke="#10b981" strokeWidth="2.5" strokeDasharray="6" />
                      {points.map((p, i) => (
                        <circle key={i} cx={p.x / (imageRef.current!.naturalWidth / imageRef.current!.getBoundingClientRect().width)} cy={p.y / (imageRef.current!.naturalWidth / imageRef.current!.getBoundingClientRect().width)} r="12" fill="#10b981" stroke="white" strokeWidth="2" className="pointer-events-auto cursor-pointer shadow-lg hover:r-[16px] transition-all" />
                      ))}
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
