
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCcw, ZoomIn, ZoomOut, Search, Crop as CropIcon, Sliders, RotateCw, Maximize, Sparkles, Wand2, Type as TypeIcon, Trash2, Highlighter, Eraser, Lightbulb } from 'lucide-react';
import { ImageItem, Language, TextElement } from '../types';
import { detectDocumentCorners, applyPerspectiveCrop, applyImageAdjustments } from '../services/cvService';
import { TRANSLATIONS } from '../constants';

type Tool = 'none' | 'crop' | 'adjust' | 'text' | 'highlight';

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
  const [activeTool, setActiveTool] = useState<Tool>('none'); 
  const [points, setPoints] = useState<Point[] | null>(null); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ index: number; type: 'corner' | 'edge' | 'center' } | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [imgLayoutSize, setImgLayoutSize] = useState<{ w: number, h: number } | null>(null);
  const [grayscale, setGrayscale] = useState(false);
  const [highlights, setHighlights] = useState<Point[][]>([]);
  const [currentHighlight, setCurrentHighlight] = useState<Point[] | null>(null);
  const [brushSize, setBrushSize] = useState(40);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ left: number, top: number }>({ left: 0, top: 0 });
  const dragStartPosRef = useRef<Point>({ x: 0, y: 0 }); 
  const initialPointsRef = useRef<Point[] | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(true);
      if (e.key === 'Escape') onClose();
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
      setHistory([item.url]);
      setCurrentIndex(0);
      setPoints(null);
      setIsDragging(false);
      setZoom(1);
      setActiveTool('none'); 
      setIsPanning(false);
      setBrightness(100);
      setContrast(100);
      setTextElements([]);
      setSelectedTextId(null);
      setEditingTextId(null);
      setGrayscale(false);
      setHighlights([]);
      setCurrentHighlight(null);
    }
  }, [item, isOpen]);

  const handlePerformAutoDetection = async (url: string) => {
    if (!imageRef.current) return;
    setIsProcessing(true);
    const detected = await detectDocumentCorners(url, t);
    if (detected) {
      setPoints(detected);
    } else {
      const w = imageRef.current.naturalWidth;
      const h = imageRef.current.naturalHeight;
      setPoints([
        { x: w * 0.1, y: h * 0.1 }, 
        { x: w * 0.9, y: h * 0.1 }, 
        { x: w * 0.9, y: h * 0.9 }, 
        { x: w * 0.1, y: h * 0.9 }
      ]);
    }
    setIsProcessing(false);
  };

  const dragScaleRef = useRef<number>(1);
  const [magnifierPoint, setMagnifierPoint] = useState<Point | null>(null);

  const handleImageLoad = () => {
    if (imageRef.current) {
      const { naturalWidth: nw, naturalHeight: nh } = imageRef.current;
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const containerHeight = containerRef.current?.clientHeight || window.innerHeight;
      
      // Calculate a zoom that fits the image nicely in the viewport
      const padding = 48;
      const fitZoom = Math.min(
        (containerWidth - padding) / nw,
        (containerHeight - padding) / nh,
        1
      );
      
      setImgLayoutSize({ w: nw, h: nh });
      setZoom(fitZoom);
    }
    if (!points) handlePerformAutoDetection(currentImage);
  };

  const currentImage = history[currentIndex] || item.url;

  const getMidPoint = (p1: Point, p2: Point) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
  const getCenterPoint = (pts: Point[]) => ({
    x: pts.reduce((acc, p) => acc + p.x, 0) / 4,
    y: pts.reduce((acc, p) => acc + p.y, 0) / 4,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isProcessing || !imageRef.current || !points) return;
    e.preventDefault();
    if (isSpacePressed || activeTool === 'none') {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) scrollStartRef.current = { left: containerRef.current.scrollLeft, top: containerRef.current.scrollTop };
        return;
    }
    if (activeTool === 'highlight') {
      const imgRect = imageRef.current.getBoundingClientRect();
      const scale = imageRef.current.naturalWidth / imgRect.width;
      const x = (e.clientX - imgRect.left) * scale;
      const y = (e.clientY - imgRect.top) * scale;
      setCurrentHighlight([{ x, y }]);
      return;
    }

    if (activeTool === 'crop') {
      const imgRect = imageRef.current.getBoundingClientRect();
      const scale = imageRef.current.naturalWidth / imgRect.width;
      dragScaleRef.current = scale;
      const clientX = e.clientX; 
      const clientY = e.clientY;
      const handleRadius = 35;

      for (let i = 0; i < 4; i++) {
        const px = imgRect.left + (points[i].x / scale);
        const py = imgRect.top + (points[i].y / scale);
        if (Math.hypot(clientX - px, clientY - py) < handleRadius) {
          setIsDragging(true); 
          setDragInfo({ index: i, type: 'corner' });
          setMagnifierPoint(points[i]);
          dragStartPosRef.current = { x: clientX, y: clientY };
          initialPointsRef.current = JSON.parse(JSON.stringify(points));
          return;
        }
      }

      for (let i = 0; i < 4; i++) {
        const mid = getMidPoint(points[i], points[(i + 1) % 4]);
        const px = imgRect.left + (mid.x / scale);
        const py = imgRect.top + (mid.y / scale);
        if (Math.hypot(clientX - px, clientY - py) < handleRadius) {
          setIsDragging(true); 
          setDragInfo({ index: i, type: 'edge' });
          setMagnifierPoint(mid);
          dragStartPosRef.current = { x: clientX, y: clientY };
          initialPointsRef.current = JSON.parse(JSON.stringify(points));
          return;
        }
      }

      const center = getCenterPoint(points);
      const px = imgRect.left + (center.x / scale);
      const py = imgRect.top + (center.y / scale);
      if (Math.hypot(clientX - px, clientY - py) < handleRadius) {
        setIsDragging(true); 
        setDragInfo({ index: 8, type: 'center' });
        setMagnifierPoint(center);
        dragStartPosRef.current = { x: clientX, y: clientY };
        initialPointsRef.current = JSON.parse(JSON.stringify(points));
        return;
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
    if (activeTool === 'highlight' && currentHighlight && imageRef.current) {
      const imgRect = imageRef.current.getBoundingClientRect();
      const scale = imageRef.current.naturalWidth / imgRect.width;
      const x = (e.clientX - imgRect.left) * scale;
      const y = (e.clientY - imgRect.top) * scale;
      setCurrentHighlight(prev => prev ? [...prev, { x, y }] : null);
      return;
    }

    if (!isDragging || !initialPointsRef.current || !dragInfo || !imageRef.current) return;
    
    const scale = dragScaleRef.current;
    const dx = (e.clientX - dragStartPosRef.current.x) * scale;
    const dy = (e.clientY - dragStartPosRef.current.y) * scale;
    const newPoints = JSON.parse(JSON.stringify(initialPointsRef.current));

    if (dragInfo.type === 'corner') {
      newPoints[dragInfo.index].x = Math.max(0, Math.min(imageRef.current.naturalWidth, newPoints[dragInfo.index].x + dx));
      newPoints[dragInfo.index].y = Math.max(0, Math.min(imageRef.current.naturalHeight, newPoints[dragInfo.index].y + dy));
      setMagnifierPoint(newPoints[dragInfo.index]);
    } else if (dragInfo.type === 'edge') {
      const idx1 = dragInfo.index;
      const idx2 = (dragInfo.index + 1) % 4;
      newPoints[idx1].x = Math.max(0, Math.min(imageRef.current.naturalWidth, newPoints[idx1].x + dx));
      newPoints[idx1].y = Math.max(0, Math.min(imageRef.current.naturalHeight, newPoints[idx1].y + dy));
      newPoints[idx2].x = Math.max(0, Math.min(imageRef.current.naturalWidth, newPoints[idx2].x + dx));
      newPoints[idx2].y = Math.max(0, Math.min(imageRef.current.naturalHeight, newPoints[idx2].y + dy));
      setMagnifierPoint(getMidPoint(newPoints[idx1], newPoints[idx2]));
    } else if (dragInfo.type === 'center') {
      for (let i = 0; i < 4; i++) {
        newPoints[i].x = Math.max(0, Math.min(imageRef.current.naturalWidth, newPoints[i].x + dx));
        newPoints[i].y = Math.max(0, Math.min(imageRef.current.naturalHeight, newPoints[i].y + dy));
      }
      setMagnifierPoint(getCenterPoint(newPoints));
    }
    setPoints(newPoints);
  }, [isDragging, dragInfo, isPanning, activeTool, currentHighlight]);

  useEffect(() => {
    if (isDragging || isPanning || currentHighlight) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        const stopDrag = () => {
          setIsDragging(false);
          setIsPanning(false);
          setMagnifierPoint(null);
          if (currentHighlight) {
            setHighlights(prev => [...prev, currentHighlight]);
            setCurrentHighlight(null);
          }
        };
        window.addEventListener('mouseup', stopDrag);
        return () => {
          window.removeEventListener('mousemove', handleWindowMouseMove);
          window.removeEventListener('mouseup', stopDrag);
        };
    }
  }, [isDragging, isPanning, handleWindowMouseMove, currentHighlight]);

  const handleApplyRotation = async (angle: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const rotatedUrl = await applyImageAdjustments(currentImage, 100, 100, angle, t);
      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(rotatedUrl);
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
      
      // Reiniciar a ferramenta de recorte após a rotação
      setPoints(null);
      await handlePerformAutoDetection(rotatedUrl);
    } catch (err) {
      console.error(t.rotateError, err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCropOnly = async () => {
    if (!points || isProcessing) return;
    setIsProcessing(true);
    try {
      const croppedUrl = await applyPerspectiveCrop(currentImage, points, t);
      const newHistory = history.slice(0, currentIndex + 1);
      newHistory.push(croppedUrl);
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
      
      // Reiniciar ferramentas para o novo estado da imagem
      setPoints(null);
      setActiveTool('none'); // Torna a ferramenta de recorte invisível após aplicar
      await handlePerformAutoDetection(croppedUrl);
    } catch (err) {
      alert(t.applyCropError);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddText = () => {
    if (!imageRef.current) return;
    const newText: TextElement = {
      id: Math.random().toString(36).substr(2, 9),
      text: t.textPlaceholder,
      x: imageRef.current.naturalWidth / 2,
      y: imageRef.current.naturalHeight / 2,
      fontSize: 48,
      color: '#000000',
      fontFamily: 'sans-serif'
    };
    setTextElements([...textElements, newText]);
    setSelectedTextId(newText.id);
    setActiveTool('text');
  };

  const handleUpdateText = (id: string, updates: Partial<TextElement>) => {
    setTextElements(textElements.map(te => te.id === id ? { ...te, ...updates } : te));
  };

  const handleRemoveText = (id: string) => {
    setTextElements(textElements.filter(te => te.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
    if (editingTextId === id) setEditingTextId(null);
  };

  const handleSave = async () => {
    setIsProcessing(true);
    let finalUrl = currentImage;
    try {
      // Create a canvas to bake everything
      const img = new Image();
      img.crossOrigin = "Anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = finalUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context error");

      // Apply perspective crop first if active
      if (activeTool === 'crop' && points) {
        finalUrl = await applyPerspectiveCrop(finalUrl, points, t);
        // Reload image after crop
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = finalUrl;
        });
      }

      canvas.width = img.width;
      canvas.height = img.height;
      
      // Apply adjustments
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) ${grayscale ? 'grayscale(100%)' : ''}`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';

      // Draw highlights
      if (highlights.length > 0) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; // Amarelo marca-texto
        ctx.lineWidth = brushSize;

        highlights.forEach(path => {
          if (path.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
          }
          ctx.stroke();
        });
      }

      // Draw text elements
      textElements.forEach(te => {
        ctx.font = `${te.fontSize}px ${te.fontFamily}`;
        ctx.fillStyle = te.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(te.text, te.x, te.y);
      });

      finalUrl = canvas.toDataURL('image/png');
      
      onUpdate({ ...item, url: finalUrl });
      onClose();
    } catch (err) {
      alert(t.saveError);
    } finally { setIsProcessing(false); }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (activeTool === 'text' && selectedTextId) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -2 : 2;
      const currentText = textElements.find(te => te.id === selectedTextId);
      if (currentText) {
        handleUpdateText(selectedTextId, { fontSize: Math.max(8, currentText.fontSize + delta) });
      }
    } else if (activeTool === 'highlight') {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -2 : 2;
      setBrushSize(prev => Math.max(5, Math.min(300, prev + delta)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 w-[95vw] h-[95vh] rounded-2xl flex flex-col border border-gray-300 dark:border-gray-700 shadow-2xl overflow-hidden">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500 rounded-lg text-white"><Maximize size={20} /></div>
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
            <div className="space-y-8">
              {/* Seção: Recorte */}
              <div>
                <div className="flex items-center mb-3">
                  <CropIcon className="mr-2 text-emerald-500" size={18} />
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">{t.manualCrop}</span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                  <button 
                    onClick={() => setActiveTool(activeTool === 'crop' ? 'none' : 'crop')} 
                    className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTool === 'crop' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'}`}
                  >
                    {activeTool === 'crop' ? t.cancel : t.manualCrop}
                  </button>
                  
                  {activeTool === 'crop' && (
                    <div className="animate-fade-in space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 italic leading-relaxed">{t.cropInstructions}</p>
                      <button 
                        onClick={handleApplyCropOnly}
                        disabled={!points || isProcessing}
                        className="w-full flex items-center justify-center space-x-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
                      >
                        <Wand2 size={14} />
                        <span>{t.applyCrop}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Seção: Ajustes */}
              <div>
                <div className="flex items-center mb-3">
                  <Sliders className="mr-2 text-emerald-500" size={18} />
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">{t.imageTools}</span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-5">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase"><span>{t.brightness}</span><span>{brightness}%</span></div>
                    <input type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase"><span>{t.contrast}</span><span>{contrast}%</span></div>
                    <input type="range" min="0" max="200" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                  </div>
                  <label 
                    onClick={() => setGrayscale(!grayscale)}
                    className="flex items-center space-x-2 cursor-pointer group"
                  >
                    <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${grayscale ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${grayscale ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase group-hover:text-emerald-500 transition-colors">
                      {t.grayscale}
                    </span>
                  </label>
                  <div className="flex space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => handleApplyRotation(-90)} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition shadow-sm"><RotateCcw size={16} className="mx-auto" /></button>
                    <button onClick={() => handleApplyRotation(90)} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition shadow-sm"><RotateCw size={16} className="mx-auto" /></button>
                  </div>
                </div>
              </div>

              {/* Seção: Marca-texto */}
              <div>
                <div className="flex items-center mb-3">
                  <Highlighter className="mr-2 text-emerald-500" size={18} />
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">{t.highlighter}</span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                  <button 
                    onClick={() => setActiveTool(activeTool === 'highlight' ? 'none' : 'highlight')} 
                    className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTool === 'highlight' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'}`}
                  >
                    {activeTool === 'highlight' ? t.cancel : t.highlighter}
                  </button>
                  
                  {activeTool === 'highlight' && (
                    <div className="flex items-center space-x-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-900/30 text-[9px] text-yellow-700 dark:text-yellow-400 font-medium mb-2">
                      <Lightbulb size={12} className="flex-shrink-0" />
                      <span>{t.brushScrollTip}</span>
                    </div>
                  )}

                    {highlights.length > 0 && (
                      <button 
                        onClick={() => setHighlights([])}
                        className="w-full flex items-center justify-center space-x-2 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-[10px] font-bold uppercase transition"
                      >
                        <Eraser size={14} />
                        <span>{t.clearHighlights}</span>
                      </button>
                    )}
                  {activeTool === 'highlight' && (
                    <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-700 animate-fade-in">
                      <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                        <span>{t.brushSize}</span>
                        <span>{brushSize}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="300" 
                        value={brushSize} 
                        onChange={(e) => setBrushSize(parseInt(e.target.value))} 
                        className="w-full accent-yellow-400 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" 
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Seção: Texto */}
              <div>
                <div className="flex items-center mb-3">
                  <TypeIcon className="mr-2 text-emerald-500" size={18} />
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">{t.addText}</span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                  <button 
                    onClick={handleAddText}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/10 transition-all active:scale-95"
                  >
                    {t.addText}
                  </button>

                  {activeTool === 'text' && (
                    <div className="flex items-center space-x-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30 text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">
                      <Lightbulb size={12} className="flex-shrink-0" />
                      <span>{t.textScrollTip}</span>
                    </div>
                  )}

                  {selectedTextId && (
                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700 animate-fade-in">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{t.textPlaceholder}</label>
                        <input 
                          type="text" 
                          value={textElements.find(te => te.id === selectedTextId)?.text || ''}
                          onChange={(e) => handleUpdateText(selectedTextId, { text: e.target.value })}
                          className="w-full p-2.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-gray-700 dark:text-gray-300"
                          placeholder={t.textPlaceholder}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{t.font}</label>
                          <select 
                            value={textElements.find(te => te.id === selectedTextId)?.fontFamily || 'sans-serif'}
                            onChange={(e) => handleUpdateText(selectedTextId, { fontFamily: e.target.value })}
                            className="w-full p-2 text-[11px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                          >
                            <option value="sans-serif">Sans</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Mono</option>
                            <option value="cursive">Cursive</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{t.size}</label>
                          <input 
                            type="number" 
                            value={textElements.find(te => te.id === selectedTextId)?.fontSize || 48}
                            onChange={(e) => handleUpdateText(selectedTextId, { fontSize: parseInt(e.target.value) })}
                            className="w-full p-2 text-[11px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{t.color}</label>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono text-gray-500 uppercase">{textElements.find(te => te.id === selectedTextId)?.color}</span>
                          <input 
                            type="color" 
                            value={textElements.find(te => te.id === selectedTextId)?.color || '#000000'}
                            onChange={(e) => handleUpdateText(selectedTextId, { color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={() => handleRemoveText(selectedTextId)}
                        className="w-full py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center border border-red-100 dark:border-red-900/30"
                      >
                        <Trash2 size={14} className="mr-2" />
                        {t.removeText}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-800">
              <button onClick={handleSave} className="w-full bg-emerald-500 text-white py-4 rounded-xl font-black text-sm uppercase shadow-xl hover:bg-emerald-600 transition flex items-center justify-center group active:scale-95 transition-transform">
                <Check size={20} className="mr-2 group-hover:scale-125 transition-transform" />
                {t.confirm}
              </button>
            </div>
          </div>
          <div 
            className="flex-1 bg-gray-100 dark:bg-[#0d1117] flex overflow-auto relative select-none custom-scrollbar" 
            ref={containerRef}
            onWheel={handleWheel}
          >
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
                
                {isDragging && magnifierPoint && (
                  <div className="fixed top-20 right-20 w-56 h-56 border-4 border-emerald-500 rounded-full overflow-hidden shadow-2xl z-[80] bg-white dark:bg-gray-800 pointer-events-none">
                    <div 
                      className="absolute inset-0 origin-top-left" 
                      style={{
                        backgroundImage: `url(${currentImage})`,
                        backgroundSize: `${imageRef.current!.naturalWidth * 5}px ${imageRef.current!.naturalHeight * 5}px`,
                        backgroundPosition: `-${magnifierPoint.x * 5 - 112}px -${magnifierPoint.y * 5 - 112}px`,
                        backgroundRepeat: 'no-repeat',
                        filter: `brightness(${brightness}%) contrast(${contrast}%)`
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="w-6 h-6 border-2 border-emerald-500 rounded-full shadow-lg" />
                       <div className="absolute w-[1px] h-full bg-emerald-500/50" />
                       <div className="absolute h-[1px] w-full bg-emerald-500/50" />
                    </div>
                  </div>
                )}

                <div 
                  className={`relative inline-block border border-gray-300 dark:border-gray-700 shadow-2xl transition-all duration-75 ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-crosshair'}`} 
                  onMouseDown={handleMouseDown} 
                  style={{ 
                    width: imgLayoutSize ? `${imgLayoutSize.w * zoom}px` : 'auto',
                    height: imgLayoutSize ? `${imgLayoutSize.h * zoom}px` : 'auto'
                  }}
                >
                  <img 
                    ref={imageRef} 
                    src={currentImage} 
                    onLoad={handleImageLoad} 
                    className="block w-full h-full object-contain bg-white max-w-none max-h-none" 
                    style={{ filter: `brightness(${brightness}%) contrast(${contrast}%) ${grayscale ? 'grayscale(100%)' : ''}` }} 
                    draggable={false} 
                  />
                  <svg 
                    className="absolute inset-0 pointer-events-none"
                    viewBox={`0 0 ${imageRef.current?.naturalWidth || 0} ${imageRef.current?.naturalHeight || 0}`}
                    preserveAspectRatio="none"
                  >
                    {highlights.map((path, idx) => (
                      <polyline
                        key={idx}
                        points={path.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="rgba(255, 215, 0, 0.4)"
                        strokeWidth={brushSize}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {currentHighlight && (
                      <polyline
                        points={currentHighlight.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="rgba(255, 215, 0, 0.4)"
                        strokeWidth={brushSize}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                  {textElements.map(te => {
                    const scaleFactor = imageRef.current!.naturalWidth / (imgLayoutSize?.w || 1);
                    const visualScale = zoom;
                    return (
                      <div 
                        key={te.id}
                        onMouseDown={(e) => {
                          if (activeTool !== 'text' || editingTextId === te.id) return;
                          e.stopPropagation();
                          setSelectedTextId(te.id);
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const initialX = te.x;
                          const initialY = te.y;

                          const onMouseMove = (moveEvent: MouseEvent) => {
                            const dx = (moveEvent.clientX - startX) * (scaleFactor / visualScale);
                            const dy = (moveEvent.clientY - startY) * (scaleFactor / visualScale);
                            handleUpdateText(te.id, { 
                              x: Math.max(0, Math.min(imageRef.current!.naturalWidth, initialX + dx)),
                              y: Math.max(0, Math.min(imageRef.current!.naturalHeight, initialY + dy))
                            });
                          };

                          const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                          };

                          window.addEventListener('mousemove', onMouseMove);
                          window.addEventListener('mouseup', onMouseUp);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingTextId(te.id);
                          setSelectedTextId(te.id);
                        }}
                        className={`absolute cursor-move select-none transition-shadow ${selectedTextId === te.id ? 'ring-2 ring-emerald-500 shadow-lg' : ''} ${editingTextId === te.id ? 'z-50 ring-0 shadow-none' : ''}`}
                        style={{
                          left: `${(te.x / scaleFactor) * visualScale}px`,
                          top: `${(te.y / scaleFactor) * visualScale}px`,
                          fontSize: `${(te.fontSize / scaleFactor) * visualScale}px`,
                          color: te.color,
                          fontFamily: te.fontFamily,
                          transform: 'translate(-50%, -50%)',
                          whiteSpace: 'nowrap',
                          pointerEvents: activeTool === 'text' ? 'auto' : 'none'
                        }}
                      >
                        {editingTextId === te.id ? (
                           <input
                             autoFocus
                             className="bg-transparent border-none outline-none text-center p-0 m-0 w-auto min-w-[50px]"
                             style={{ 
                               color: te.color, 
                               fontFamily: te.fontFamily, 
                               fontSize: 'inherit',
                               width: `${te.text.length + 1}ch`
                             }}
                             value={te.text}
                             onChange={(e) => handleUpdateText(te.id, { text: e.target.value })}
                             onBlur={() => setEditingTextId(null)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter' || e.key === 'Escape') {
                                 setEditingTextId(null);
                               }
                             }}
                             onClick={(e) => e.stopPropagation()}
                             onMouseDown={(e) => e.stopPropagation()}
                           />
                        ) : (
                          te.text
                        )}
                      </div>
                    );
                  })}
                  {points && activeTool === 'crop' && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                      {(() => {
                        const scaleFactor = imageRef.current!.naturalWidth / (imgLayoutSize?.w || 1);
                        const visualScale = zoom;
                        
                        return (
                          <>
                            <polygon points={points.map(p => `${(p.x / scaleFactor) * visualScale},${(p.y / scaleFactor) * visualScale}`).join(' ')} fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="3" />
                            
                            {points.map((p, i) => (
                              <circle 
                                key={`corner-${i}`} 
                                cx={(p.x / scaleFactor) * visualScale} 
                                cy={(p.y / scaleFactor) * visualScale} 
                                r="14" 
                                fill="#ffffff" 
                                stroke="#10b981" 
                                strokeWidth="4" 
                                className="pointer-events-auto cursor-pointer shadow-xl" 
                              />
                            ))}

                            {[0, 1, 2, 3].map((i) => {
                              const mid = getMidPoint(points[i], points[(i + 1) % 4]);
                              const p1 = points[i];
                              const p2 = points[(i+1)%4];
                              const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
                              return (
                                <rect 
                                  key={`edge-${i}`} 
                                  x={(mid.x / scaleFactor) * visualScale - 18} 
                                  y={(mid.y / scaleFactor) * visualScale - 6} 
                                  width="36" height="12" rx="6"
                                  fill="#ffffff" stroke="#10b981" strokeWidth="2.5" 
                                  style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${(mid.x/scaleFactor) * visualScale}px ${(mid.y/scaleFactor) * visualScale}px` }}
                                  className="pointer-events-auto cursor-pointer shadow-lg" 
                                />
                              );
                            })}

                            {(() => {
                               const center = getCenterPoint(points);
                               return (
                                 <circle 
                                   key="center-point"
                                   cx={(center.x / scaleFactor) * visualScale} 
                                   cy={(center.y / scaleFactor) * visualScale} 
                                   r="12"
                                   fill="#10b981" 
                                   stroke="white" 
                                   strokeWidth="3" 
                                   className="pointer-events-auto cursor-move shadow-2xl" 
                                 />
                               );
                            })()}
                          </>
                        );
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
