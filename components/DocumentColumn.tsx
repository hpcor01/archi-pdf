
import React, { useState, useRef } from 'react';
import { Trash2, FileText, Plus, Search, RotateCw, Undo2, RotateCcw } from 'lucide-react';
import { DocumentGroup, ImageItem, AppSettings, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface DocumentColumnProps {
  document: DocumentGroup;
  settings: AppSettings;
  onAddItem: (docId: string, files: FileList) => void;
  onRemoveItem: (docId: string, itemId: string) => void;
  onEditItem: (item: ImageItem) => void;
  onRenameDoc: (docId: string, name: string) => void;
  onDeleteDoc: (docId: string) => void;
  onToggleSelection: (docId: string, selected: boolean) => void;
  onRotateItem?: (docId: string, itemId: string) => void;
  onRestoreItem?: (docId: string, itemId: string) => void;
  onResetToOriginal?: (docId: string, itemId: string) => void;
  onMoveItem?: (sourceDocId: string, itemId: string, targetDocId: string, targetIndex: number | null) => void;
  language: Language;
}

const DocumentColumn: React.FC<DocumentColumnProps> = ({ 
  document, 
  settings, 
  onAddItem, 
  onRemoveItem, 
  onEditItem, 
  onRenameDoc,
  onDeleteDoc,
  onToggleSelection,
  onRotateItem,
  onRestoreItem,
  onResetToOriginal,
  onMoveItem,
  language
}) => {
  const t = TRANSLATIONS[language];
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [hoveredPreviewId, setHoveredPreviewId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddItem(document.id, e.target.files);
    }
    e.target.value = '';
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
    else setIsDraggingItem(true);
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    setIsDraggingItem(false);
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    setIsDraggingItem(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddItem(document.id, e.dataTransfer.files);
      return;
    }
    const dragData = e.dataTransfer.getData('application/json');
    if (dragData && onMoveItem) {
      try {
        const { docId: sourceDocId, itemId } = JSON.parse(dragData);
        onMoveItem(sourceDocId, itemId, document.id, null);
      } catch (err) { console.error("Drop Error", err); }
    }
  };

  const handleItemDragStart = (e: React.DragEvent, item: ImageItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ docId: document.id, itemId: item.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) setDragOverIndex(index);
  };

  const handleItemDragLeave = (e: React.DragEvent) => setDragOverIndex(null);

  const handleItemDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    setIsDraggingItem(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddItem(document.id, e.dataTransfer.files);
      return;
    }
    const dragData = e.dataTransfer.getData('application/json');
    if (dragData && onMoveItem) {
      try {
        const { docId: sourceDocId, itemId } = JSON.parse(dragData);
        onMoveItem(sourceDocId, itemId, document.id, index);
      } catch (err) { console.error("Item Drop Error", err); }
    }
  };

  return (
    <div className={`w-80 flex-shrink-0 flex flex-col border rounded-xl overflow-hidden h-full mr-4 relative group transition-colors duration-200 ${isDraggingFile ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500' : isDraggingItem ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-400' : 'bg-white dark:bg-[#18181B] border-gray-300 dark:border-gray-700'}`} onDragOver={handleContainerDragOver} onDragLeave={handleContainerDragLeave} onDrop={handleContainerDrop}>
      <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <input type="checkbox" checked={document.selected} onChange={(e) => onToggleSelection(document.id, e.target.checked)} className="custom-checkbox" />
          <div className="flex flex-col">
            <input value={document.title} onChange={(e) => onRenameDoc(document.id, e.target.value)} className="bg-transparent text-sm font-bold text-gray-800 dark:text-gray-200 focus:outline-none focus:border-b border-emerald-500 w-32 placeholder-gray-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.total}: {document.items.length}</span>
          </div>
        </div>
        <button onClick={() => onDeleteDoc(document.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 rounded-md transition"><Trash2 size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {document.items.length === 0 && (
          <div onClick={() => fileInputRef.current?.click()} className={`h-40 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-lg m-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isDraggingFile ? 'border-emerald-500 text-emerald-500' : 'border-gray-200 dark:border-gray-700 hover:border-emerald-400'}`}>
            <span className="text-sm">{isDraggingFile ? t.dropHere : t.dragDrop}</span>
          </div>
        )}
        
        {document.items.map((item, index) => (
          <div key={item.id} draggable onDragStart={(e) => handleItemDragStart(e, item)} onDragOver={(e) => handleItemDragOver(e, index)} onDragLeave={handleItemDragLeave} onDrop={(e) => handleItemDrop(e, index)} className={`relative group/item bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 flex items-center space-x-3 border transition shadow-sm ${dragOverIndex === index ? 'border-t-2 border-t-emerald-500' : 'border-gray-200 dark:border-gray-700'} hover:border-gray-400 cursor-move`}>
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 relative border border-gray-200 dark:border-gray-700">
               {item.type === 'image' ? (
                 <>
                   <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                   {item.processing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>}
                   <button className="absolute top-0 right-0 w-6 h-6 bg-white/90 dark:bg-gray-900/80 hover:bg-emerald-500 hover:text-white text-gray-600 dark:text-gray-300 flex items-center justify-center transition-colors z-10 rounded-bl-lg" onMouseEnter={() => setHoveredPreviewId(item.id)} onMouseLeave={() => setHoveredPreviewId(null)} onClick={(e) => { e.stopPropagation(); onEditItem(item); }}><Search size={12} /></button>
                 </>
               ) : <FileText className="text-red-500" size={20} />}
            </div>

            {hoveredPreviewId === item.id && item.type === 'image' && (
              <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                 <div className="bg-white dark:bg-gray-900 p-2 rounded-xl border shadow-2xl max-w-[500px] max-h-[500px]">
                    <img src={item.url} alt="Preview" className="max-w-full max-h-[480px] object-contain rounded-lg" />
                 </div>
              </div>
            )}

            <div className="flex-1 min-w-0 pr-6">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-1">{item.name}</p>
              <div className="flex items-center space-x-2">
                <button onClick={() => onEditItem(item)} className="text-[10px] bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 transition">{t.edit}</button>
                {item.type === 'image' && (
                  <>
                    <button onClick={() => onRotateItem?.(document.id, item.id)} className="text-[10px] bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 transition" title={t.rotate}><RotateCw size={11} /></button>
                    {item.backupUrl && <button onClick={() => onRestoreItem?.(document.id, item.id)} className="text-[10px] bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 px-2 py-0.5 rounded text-orange-600 dark:text-orange-300 transition" title={t.restore}><Undo2 size={11} /></button>}
                    {item.url !== item.originalUrl && <button onClick={() => onResetToOriginal?.(document.id, item.id)} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 px-2 py-0.5 rounded text-blue-600 dark:text-blue-300 transition flex items-center" title={t.reset}><RotateCcw size={11} className="mr-1" /> Cache</button>}
                  </>
                )}
              </div>
            </div>
            <button onClick={() => onRemoveItem(document.id, item.id)} className="absolute top-2.5 right-2 p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 transition-colors">
         <label className="flex items-center justify-center w-full py-2.5 border border-gray-300 dark:border-gray-600 border-dashed rounded-lg text-gray-500 hover:text-emerald-600 hover:border-emerald-500 hover:bg-white dark:hover:bg-gray-800 transition cursor-pointer text-sm font-medium">
           <Plus size={16} className="mr-1.5" /> {t.addFiles}
           <input ref={fileInputRef} type="file" multiple accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf" className="hidden" onChange={handleFileChange} />
         </label>
      </div>
    </div>
  );
};

export default DocumentColumn;
