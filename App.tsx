
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
  const [isProcessing, setIsProcessing] = useState(false); // State for batch operations
  const [language, setLanguage] = useState<Language>('pt-BR');
  
  // Undo Logic for Batch Operations
  const [batchHistory, setBatchHistory] = useState<DocumentGroup[] | null>(null);
  
  // Theme State with Persistence
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('app-theme');
      return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    }
    return 'light';
  });
  
  // Toast State
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success'
  });

  // Update Availability State
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  
  // Modals States
  const [showVersionInfo, setShowVersionInfo] = useState(false);
  const [showAboutInfo, setShowAboutInfo] = useState(false);

  const t = TRANSLATIONS[language];

  // --- Version Check Logic ---
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
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    const handleFocus = () => checkVersion();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleUpdateApp = () => {
    window.location.reload();
  };

  // --- Handlers ---

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
        originalUrl: url, // Cache permanente do estado inicial
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
      doc.id === docId 
        ? { ...doc, items: doc.items.filter(i => i.id !== itemId) } 
        : doc
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
    setToast({ visible: true, message: language === 'pt-BR' ? "Imagem restaurada ao original." : "Restored to original image.", type: 'success' });
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
    setToast({ visible: true, message: language === 'pt-BR' ? "Ação de lote desfeita para esta imagem." : "Batch action undone for this image.", type: 'success' });
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
    canvas.width = img.height;
    canvas.height = img.width;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(90 * Math.PI / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    const newUrl = canvas.toDataURL();
    const updatedItem = { ...item, url: newUrl };
    
    setDocuments(prev => prev.map(d => {
      if (d.id === docId) {
        return {
          ...d,
          items: d.items.map(i => i.id === itemId ? updatedItem : i)
        };
      }
      return d;
    }));
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
      
      if (targetIndex === null || targetIndex >= targetItems.length) {
        targetItems.push(movedItem);
      } else {
        targetItems.splice(targetIndex, 0, movedItem);
      }

      newDocs[targetDocIndex] = { ...newDocs[targetDocIndex], items: targetItems };
      return newDocs;
    });
  };

  const handleBatchAutoCrop = async () => {
    const docsToProcess = documents.filter(doc => doc.selected);
    if (docsToProcess.length === 0) {
       alert(language === 'en' ? "Select columns to process." : "Selecione as colunas para processar.");
       return;
    }

    setBatchHistory(JSON.parse(JSON.stringify(documents)));
    setIsProcessing(true);

    const tasks: { docId: string, itemId: string, url: string }[] = [];
    docsToProcess.forEach(doc => {
      doc.items.forEach(item => {
        if (item.type === 'image') {
          tasks.push({ docId: doc.id, itemId: item.id, url: item.url });
        }
      });
    });

    setDocuments(prev => prev.map(doc => {
      if (!doc.selected) return doc;
      return {
        ...doc,
        items: doc.items.map(item => item.type === 'image' ? { ...item, processing: true, backupUrl: item.url } : item)
      };
    }));

    try {
      let successCount = 0;
      for (const task of tasks) {
        try {
          const newUrl = await autoCropImage(task.url);
          if (newUrl !== task.url) successCount++;
          setDocuments(prev => prev.map(doc => {
             if (doc.id !== task.docId) return doc;
             return {
                ...doc,
                items: doc.items.map(item => {
                   if (item.id !== task.itemId) return item;
                   return { ...item, url: newUrl, processing: false };
                })
             };
          }));
        } catch (e) {
           console.error(`Failed to process item ${task.itemId}`, e);
           setDocuments(prev => prev.map(doc => {
             if (doc.id !== task.docId) return doc;
             return {
                ...doc,
                items: doc.items.map(item => {
                   if (item.id !== task.itemId) return item;
                   return { ...item, processing: false };
                })
             };
           }));
        }
      }
      
      if (successCount === 0 && tasks.length > 0) {
        setToast({ visible: true, message: language === 'pt-BR' ? "Nenhum documento identificado automaticamente." : "No documents identified.", type: 'error' });
      } else {
        setToast({ visible: true, message: language === 'pt-BR' ? "Recorte automático concluído!" : "Auto-crop completed!", type: 'success' });
      }
    } catch (e) {
      console.error("Batch processing error", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoBatch = () => {
    if (batchHistory) {
      setDocuments(batchHistory);
      setBatchHistory(null);
      setToast({ visible: true, message: language === 'pt-BR' ? "Recortes revertidos." : "Crops reverted.", type: 'success' });
    }
  };

  const handleSave = async () => {
    const docsToSave = documents.filter(doc => doc.selected);
    if (docsToSave.length === 0) {
      alert(language === 'en' ? "Select at least one column to save." : "Selecione pelo menos uma coluna para salvar.");
      return;
    }

    setIsSaving(true);
    try {
      await generatePDF(docsToSave, settings.useOCR);
      setToast({ visible: true, message: t.docSaved, type: 'success' });
      setTimeout(() => { handleClearAll(); }, 500);
    } catch (e) {
      console.error(e);
      setToast({ visible: true, message: t.docSaveError, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('app-theme', newTheme);
      return newTheme;
    });
  };

  const allSelected = documents.length > 0 && documents.every(d => d.selected);
  const hasSelection = documents.some(d => d.selected);
  const isPdfSelected = documents.some(doc => doc.selected && doc.items.some(item => item.type === 'pdf'));

  const getChangelog = () => {
    if (language === 'pt-BR') {
        return [
            "v2.3 - Recorte Manual com Perspectiva (Correção de homografia)",
            "v2.3 - Botão Desfazer para recortes em lote",
            "IA OpenCV 4.x para Recorte Automático Inteligente",
            "Cache inteligente de imagens para restauração individual completa",
            "OCR Inteligente (Torna PDFs pesquisáveis)",
            "Αρχή PDF é capaz de ler e editar arquivos PDF",
            "É possível mesclar imagens a arquivos PDF"
        ];
    }
    return [
        "v2.3 - Manual Perspective Crop (Homography correction)",
        "v2.3 - Undo Button for batch crops",
        "OpenCV 4.x AI for Intelligent Auto-Crop",
        "Intelligent image cache for complete individual restoration",
        "Smart OCR (Makes PDFs searchable)",
        "Αρχή PDF can read and edit PDF files",
        "Merge images with PDF files"
    ];
  };

  const getLicenses = () => [
    { name: "React", license: "MIT" },
    { name: "Lucide React", license: "ISC" },
    { name: "PDF-lib", license: "MIT" },
    { name: "PDF.js", license: "Apache 2.0" },
    { name: "Tesseract.js", license: "Apache 2.0" },
    { name: "OpenCV.js", license: "Apache 2.0" },
    { name: "Tailwind CSS", license: "MIT" }
  ];

  return (
    <div className={theme}>
      <div className={`flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white font-sans transition-colors duration-300 relative`}>
        <TopBar 
          settings={settings} 
          updateSetting={handleUpdateSetting} 
          onSave={handleSave}
          onClearAll={handleClearAll}
          onRemoveBgBatch={handleBatchAutoCrop}
          onUndoBatch={handleUndoBatch}
          canUndo={!!batchHistory}
          isSaving={isSaving}
          isProcessing={isProcessing}
          isPdfSelected={isPdfSelected}
          allSelected={allSelected}
          hasSelection={hasSelection}
          onToggleSelectAll={handleToggleSelectAll}
          language={language}
          setLanguage={setLanguage}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        <main className="flex-1 overflow-hidden p-4 sm:p-6 flex flex-col">
          <div className="flex-1 w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-3xl relative flex flex-col overflow-hidden transition-colors dark:bg-[#232B3A]">
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6 custom-scrollbar">
              <div className="flex h-full"> 
                {documents.map(doc => (
                  <DocumentColumn 
                    key={doc.id}
                    document={doc}
                    settings={settings}
                    onAddItem={handleAddItem}
                    onRemoveItem={handleRemoveItem}
                    onEditItem={(item) => handleEditItem(doc.id, item)}
                    onRenameDoc={handleRenameDocument}
                    onDeleteDoc={handleDeleteDocument}
                    onToggleSelection={handleToggleColumnSelection}
                    onRotateItem={handleRotateItem}
                    onRestoreItem={handleRestoreItem}
                    onResetToOriginal={handleResetToOriginal}
                    onMoveItem={handleMoveItem}
                    language={language}
                  />
                ))}
                <div className="w-20 flex-shrink-0" />
              </div>
            </div>

            <button onClick={handleAddDocument} className="absolute bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 rounded-full shadow-2xl flex items-center justify-center text-white transition transform hover:scale-105 z-30" title="Nova Coluna">
              <Plus size={32} />
            </button>
          </div>

          <footer className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1 pb-1 relative z-40">
             <p>Αρχή - {t.footerQuote}</p>
             <p>
               Αρχή PDF© {new Date().getFullYear()} - {t.rightsReserved}. |{' '}
               <a title="Help" target="_blank" rel="noopener noreferrer" href="https://app.pipefy.com/public/form/d_5r27Kf" className="hover:text-emerald-500 transition">{t.supportLink}</a> |{' '}
               <button onClick={() => { setShowAboutInfo(false); setShowVersionInfo(!showVersionInfo); }} className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2">
                 {t.version} 2.3
               </button> |{' '}
               <button onClick={() => { setShowVersionInfo(false); setShowAboutInfo(!showAboutInfo); }} className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2">
                 {t.about}
               </button>
             </p>
          </footer>
        </main>

        {showVersionInfo && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl border border-emerald-500/30 z-[60] w-80 text-left transition-all duration-300 animate-slide-up">
             <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold text-base">{t.version} 3</h3>
                 </div>
                 <button onClick={() => setShowVersionInfo(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16}/></button>
             </div>
             <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-300 list-disc pl-4 mb-4">
                 {getChangelog().map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                 ))}
             </ul>
             <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start space-x-2">
                <Info size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">{t.comingSoon}</p>
             </div>
          </div>
        )}

        {showAboutInfo && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl border border-emerald-500/30 z-[60] w-80 sm:w-96 text-left transition-all duration-300 animate-slide-up overflow-hidden">
             <div className="flex justify-between items-center mb-4 p-1">
                 <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                    <Users size={18} />
                    <h3 className="font-bold text-base">{t.aboutTitle}</h3>
                 </div>
                 <button onClick={() => setShowAboutInfo(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16}/></button>
             </div>
             <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <section><p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{t.developedBy} <strong>L. Stivan</strong> e <strong>Hugo Cordeiro</strong>.</p></section>
                <section className="pt-2 border-t border-gray-100 dark:border-gray-700">
                   <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-3">
                      <ShieldCheck size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">{t.openSourceLicenses}</span>
                   </div>
                   <div className="grid grid-cols-1 gap-2">
                      {getLicenses().map((lib, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                           <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{lib.name}</span>
                           <span className="text-[10px] font-black bg-gray-200 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{lib.license}</span>
                        </div>
                      ))}
                   </div>
                </section>
             </div>
          </div>
        )}

        <Toast 
          message={toast.message}
          type={toast.type}
          isVisible={toast.visible}
          onClose={() => setToast({ ...toast, visible: false })}
          language={language}
        />
        <UpdateNotification isVisible={isUpdateAvailable} onUpdate={handleUpdateApp} language={language} />
        {editingItem && editingItem.item.type === 'image' && <EditorModal item={editingItem.item} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdateItem} language={language} />}
        {editingItem && editingItem.item.type === 'pdf' && <PdfEditorModal item={editingItem.item} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdateItem} language={language} />}
      </div>
    </div>
  );
};

export default App;
