
import React, { useState, useEffect } from 'react';
import { Plus, X, Sparkles, Info, Users, ShieldCheck } from 'lucide-react';
import TopBar from './components/TopBar';
import DocumentColumn from './components/DocumentColumn';
import EditorModal from './components/EditorModal';
import PdfEditorModal from './components/PdfEditorModal';
import Toast from './components/Toast';
import UpdateNotification from './components/UpdateNotification';
import { DocumentGroup, AppSettings, ImageItem, Language, Theme } from './types';
import { INITIAL_SETTINGS, TRANSLATIONS } from './constants';
import { generatePDF } from './services/pdfService';
import { autoCropImage } from './services/cvService';

const App = () => {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [documents, setDocuments] = useState<DocumentGroup[]>([
    { id: '1', title: 'PDF 1', items: [], selected: false }
  ]);
  const [editingItem, setEditingItem] = useState<{ docId: string, item: ImageItem } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<Language>('pt-BR');
  
  const [batchHistory, setBatchHistory] = useState<DocumentGroup[] | null>(null);
  
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('app-theme');
      return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    }
    return 'light';
  });
  
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success'
  });

  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [showVersionInfo, setShowVersionInfo] = useState(false);
  const [showAboutInfo, setShowAboutInfo] = useState(false);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch(`./version.json?t=${new Date().getTime()}`);
        if (!response.ok) return;
        const data = await response.json();
        const remoteVersion = data.version;
        if (typeof __APP_VERSION__ !== 'undefined' && remoteVersion !== __APP_VERSION__) {
          setIsUpdateAvailable(true);
        }
      } catch (error) {
        console.debug("Version check failed", error);
      }
    };
    checkVersion();
  }, []);

  const handleUpdateApp = () => window.location.reload();

  const handleUpdateSetting = (key: keyof AppSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleAddDocument = () => {
    const newId = (documents.length + 1).toString();
    setDocuments([...documents, { id: Date.now().toString(), title: `PDF ${newId}`, items: [], selected: false }]);
  };

  const handleDeleteDocument = (id: string) => {
    if (documents.length <= 1) return; 
    setDocuments(documents.filter(d => d.id !== id));
  };

  const handleRenameDocument = (id: string, name: string) => {
    setDocuments(documents.map(d => id === d.id ? { ...d, title: name } : d));
  };

  const handleToggleColumnSelection = (id: string, selected: boolean) => {
    setDocuments(documents.map(d => id === d.id ? { ...d, selected } : d));
  };

  const handleToggleSelectAll = (selected: boolean) => {
    setDocuments(documents.map(d => ({ ...d, selected })));
  };

  const handleClearAll = () => {
    setDocuments([{ id: Date.now().toString(), title: 'PDF 1', items: [], selected: false }]);
    setBatchHistory(null);
  };

  const handleAddItem = async (docId: string, files: FileList) => {
    const newItems: ImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const type = file.type === 'application/pdf' ? 'pdf' : 'image';
      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        url,
        originalUrl: url,
        originalFile: file,
        name: file.name,
        type,
        selected: false
      });
    }
    setDocuments(prev => prev.map(doc => 
      doc.id === docId ? { ...doc, items: [...doc.items, ...newItems] } : doc
    ));
  };

  const handleRemoveItem = (docId: string, itemId: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === docId ? { ...doc, items: doc.items.filter(i => i.id !== itemId) } : doc
    ));
  };

  const handleEditItem = (docId: string, item: ImageItem) => {
    setEditingItem({ docId, item });
  };

  const handleUpdateItem = (updatedItem: ImageItem) => {
    if (!editingItem) return;
    setDocuments(prev => prev.map(doc => {
      if (doc.id === editingItem.docId) {
        return {
          ...doc,
          items: doc.items.map(i => i.id === updatedItem.id ? updatedItem : i)
        };
      }
      return doc;
    }));
  };

  const handleResetToOriginal = (docId: string, itemId: string) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        items: doc.items.map(item => {
          if (item.id !== itemId) return item;
          return { ...item, url: item.originalUrl, backupUrl: undefined };
        })
      };
    }));
    setToast({ visible: true, message: language === 'pt-BR' ? "Imagem restaurada." : "Image restored.", type: 'success' });
  };

  const handleRestoreItem = (docId: string, itemId: string) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id !== docId) return doc;
      return {
        ...doc,
        items: doc.items.map(item => {
          if (item.id !== itemId || !item.backupUrl) return item;
          return { ...item, url: item.backupUrl, backupUrl: undefined };
        })
      };
    }));
  };

  const handleRotateItem = async (docId: string, itemId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    const item = doc.items.find(i => i.id === itemId);
    if (!item || item.type !== 'image') return;
    const img = new Image();
    img.src = item.url;
    await new Promise((resolve) => { img.onload = resolve; });
    const canvas = document.createElement('canvas');
    canvas.width = img.height; canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(90 * Math.PI / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    const newUrl = canvas.toDataURL();
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, items: d.items.map(i => i.id === itemId ? { ...item, url: newUrl } : i) } : d));
  };

  const handleMoveItem = (sourceDocId: string, itemId: string, targetDocId: string, targetIndex: number | null) => {
    setDocuments(prevDocs => {
      const newDocs = [...prevDocs];
      const sourceDocIndex = newDocs.findIndex(d => d.id === sourceDocId);
      const targetDocIndex = newDocs.findIndex(d => d.id === targetDocId);
      if (sourceDocIndex === -1 || targetDocIndex === -1) return prevDocs;
      const sourceItems = [...newDocs[sourceDocIndex].items];
      const itemIndex = sourceItems.findIndex(i => i.id === itemId);
      if (itemIndex === -1) return prevDocs;
      const [movedItem] = sourceItems.splice(itemIndex, 1);
      newDocs[sourceDocIndex] = { ...newDocs[sourceDocIndex], items: sourceItems };
      const targetItems = sourceDocId === targetDocId ? sourceItems : [...newDocs[targetDocIndex].items];
      if (targetIndex === null || targetIndex >= targetItems.length) targetItems.push(movedItem);
      else targetItems.splice(targetIndex, 0, movedItem);
      newDocs[targetDocIndex] = { ...newDocs[targetDocIndex], items: targetItems };
      return newDocs;
    });
  };

  const handleBatchAutoCrop = async () => {
    const docsToProcess = documents.filter(doc => doc.selected);
    if (docsToProcess.length === 0) return;
    setBatchHistory(JSON.parse(JSON.stringify(documents)));
    setIsProcessing(true);
    const tasks: { docId: string, itemId: string, url: string }[] = [];
    docsToProcess.forEach(doc => {
      doc.items.forEach(item => {
        if (item.type === 'image') tasks.push({ docId: doc.id, itemId: item.id, url: item.url });
      });
    });
    setDocuments(prev => prev.map(doc => doc.selected ? { ...doc, items: doc.items.map(i => i.type === 'image' ? { ...i, processing: true, backupUrl: i.url } : i) } : doc));
    try {
      let successCount = 0;
      for (const task of tasks) {
        try {
          const newUrl = await autoCropImage(task.url);
          if (newUrl !== task.url) successCount++;
          setDocuments(prev => prev.map(doc => doc.id === task.docId ? { ...doc, items: doc.items.map(i => i.id === task.itemId ? { ...i, url: newUrl, processing: false } : i) } : doc));
        } catch (e) {
          setDocuments(prev => prev.map(doc => doc.id === task.docId ? { ...doc, items: doc.items.map(i => i.id === task.itemId ? { ...i, processing: false } : i) } : doc));
        }
      }
      setToast({ visible: true, message: successCount > 0 ? "Recorte concluído!" : "Nenhum documento identificado.", type: successCount > 0 ? 'success' : 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoBatch = () => {
    if (batchHistory) { setDocuments(batchHistory); setBatchHistory(null); }
  };

  const handleSave = async () => {
    const docsToSave = documents.filter(doc => doc.selected);
    if (docsToSave.length === 0) return;
    setIsSaving(true);
    try {
      await generatePDF(docsToSave, settings.useOCR);
      setToast({ visible: true, message: t.docSaved, type: 'success' });
      setTimeout(() => handleClearAll(), 500);
    } catch (e) {
      setToast({ visible: true, message: t.docSaveError, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const getChangelog = () => {
    return language === 'pt-BR' ? [
      "v2.2 - NOVO: Recorte Manual com Perspectiva (Correção de homografia)",
      "v2.2 - Melhoria na IA de Detecção Automática (OpenCV)",
      "v2.2 - Botão Desfazer para recortes em lote",
      "OCR Inteligente integrado",
      "Suporte a arquivos PDF nativos"
    ] : [
      "v2.2 - NEW: Manual Perspective Crop (Homography)",
      "v2.2 - Improved AI Auto-Detection (OpenCV)",
      "v2.2 - Batch Undo feature",
      "Integrated Smart OCR",
      "Native PDF support"
    ];
  };

  return (
    <div className={theme}>
      <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white font-sans transition-colors duration-300 relative">
        <TopBar 
          settings={settings} updateSetting={handleUpdateSetting} onSave={handleSave}
          onClearAll={handleClearAll} onRemoveBgBatch={handleBatchAutoCrop}
          onUndoBatch={handleUndoBatch} canUndo={!!batchHistory}
          isSaving={isSaving} isProcessing={isProcessing}
          isPdfSelected={documents.some(d => d.selected && d.items.some(i => i.type === 'pdf'))}
          allSelected={documents.length > 0 && documents.every(d => d.selected)}
          hasSelection={documents.some(d => d.selected)}
          onToggleSelectAll={handleToggleSelectAll} language={language}
          setLanguage={setLanguage} theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        />
        <main className="flex-1 overflow-hidden p-4 sm:p-6 flex flex-col">
          <div className="flex-1 w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-3xl relative flex flex-col overflow-hidden transition-colors dark:bg-[#232B3A]">
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6 custom-scrollbar">
              <div className="flex h-full"> 
                {documents.map(doc => (
                  <DocumentColumn 
                    key={doc.id} document={doc} settings={settings} onAddItem={handleAddItem}
                    onRemoveItem={handleRemoveItem} onEditItem={(item) => handleEditItem(doc.id, item)}
                    onRenameDoc={handleRenameDocument} onDeleteDoc={handleDeleteDocument}
                    onToggleSelection={handleToggleColumnSelection} onRotateItem={handleRotateItem}
                    onRestoreItem={handleRestoreItem} onResetToOriginal={handleResetToOriginal}
                    onMoveItem={handleMoveItem} language={language}
                  />
                ))}
              </div>
            </div>
            <button onClick={handleAddDocument} className="absolute bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 rounded-full shadow-2xl flex items-center justify-center text-white transition transform hover:scale-105 z-30">
              <Plus size={32} />
            </button>
          </div>
          <footer className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1 pb-1 relative z-40">
             <p>Αρχή - {t.footerQuote}</p>
             <p>
               Αρχή PDF© {new Date().getFullYear()} - {t.rightsReserved}. |{' '}
               <a target="_blank" rel="noopener noreferrer" href="https://app.pipefy.com/public/form/d_5r27Kf" className="hover:text-emerald-500 transition">{t.supportLink}</a> |{' '}
               <button onClick={() => setShowVersionInfo(!showVersionInfo)} className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2">
                 Versão 2.2
               </button>
             </p>
          </footer>
        </main>
        {showVersionInfo && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl border border-emerald-500/30 z-[60] w-80 text-left transition-all duration-300 animate-slide-up">
             <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold text-base">Versão 2.2</h3>
                 </div>
                 <button onClick={() => setShowVersionInfo(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16}/></button>
             </div>
             <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-300 list-disc pl-4 mb-4">
                 {getChangelog().map((f, i) => <li key={i}>{f}</li>)}
             </ul>
             <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start space-x-2">
                <Info size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">{t.comingSoon}</p>
             </div>
          </div>
        )}
        <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={() => setToast({ ...toast, visible: false })} language={language} />
        <UpdateNotification isVisible={isUpdateAvailable} onUpdate={handleUpdateApp} language={language} />
        {editingItem && editingItem.item.type === 'image' && <EditorModal item={editingItem.item} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdateItem} language={language} />}
        {editingItem && editingItem.item.type === 'pdf' && <PdfEditorModal item={editingItem.item} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdateItem} language={language} />}
      </div>
    </div>
  );
};

export default App;
