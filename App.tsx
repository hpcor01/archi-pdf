import React, { useState, useEffect } from 'react';
import { Plus, X, Sparkles } from 'lucide-react';
import TopBar from './components/TopBar';
import DocumentColumn from './components/DocumentColumn';
import EditorModal from './components/EditorModal';
import PdfEditorModal from './components/PdfEditorModal';
import Toast from './components/Toast';
import UpdateNotification from './components/UpdateNotification';
import { DocumentGroup, AppSettings, ImageItem, Language, Theme } from './types';
import { INITIAL_SETTINGS, TRANSLATIONS } from './constants';
import { generatePDF } from './services/pdfService';
import { removeBackground } from './services/geminiService';

const App = () => {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [documents, setDocuments] = useState<DocumentGroup[]>([
    { id: '1', title: 'PDF 1', items: [], selected: false }
  ]);
  const [editingItem, setEditingItem] = useState<{ docId: string, item: ImageItem } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // State for batch AI operations
  const [language, setLanguage] = useState<Language>('pt-BR');
  
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
  
  // Version Info State
  const [showVersionInfo, setShowVersionInfo] = useState(false);

  const t = TRANSLATIONS[language];

  // --- Version Check Logic ---
  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Fetch version.json with timestamp to avoid caching the JSON file itself
        const response = await fetch(`./version.json?t=${new Date().getTime()}`);
        if (!response.ok) return;
        
        const data = await response.json();
        const remoteVersion = data.version;
        
        // __APP_VERSION__ is injected by Vite at build time
        if (typeof __APP_VERSION__ !== 'undefined' && remoteVersion !== __APP_VERSION__) {
          setIsUpdateAvailable(true);
        }
      } catch (error) {
        // Silent fail (dev mode or network error)
        console.debug("Version check failed", error);
      }
    };

    // Check on mount
    checkVersion();

    // Check every 5 minutes
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    
    // Check when window gains focus
    const handleFocus = () => checkVersion();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleUpdateApp = () => {
    // Reload the page to fetch new assets (cache busting is handled by Vite filenames usually, but reload ensures html update)
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
    if (documents.length <= 1) return; // Prevent deleting last column
    setDocuments(documents.filter(d => d.id !== id));
  };

  const handleRenameDocument = (id: string, name: string) => {
    setDocuments(documents.map(d => d.id === id ? { ...d, title: name } : d));
  };

  const handleToggleColumnSelection = (id: string, selected: boolean) => {
    setDocuments(documents.map(d => d.id === id ? { ...d, selected } : d));
  };

  const handleToggleSelectAll = (selected: boolean) => {
    setDocuments(documents.map(d => ({ ...d, selected })));
  };

  const handleClearAll = () => {
    // Reset to single empty column
    setDocuments([{ id: Date.now().toString(), title: 'PDF 1', items: [], selected: false }]);
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

  const handleRotateItem = async (docId: string, itemId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    const item = doc.items.find(i => i.id === itemId);
    if (!item || item.type !== 'image') return;

    // Use a canvas to rotate the image 90 degrees clockwise
    const img = new Image();
    img.src = item.url;
    await new Promise((resolve) => { img.onload = resolve; });

    const canvas = document.createElement('canvas');
    // Swap width and height for 90 deg rotation
    canvas.width = img.height;
    canvas.height = img.width;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Translate to center, rotate, translate back
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

      // Find and remove item from source
      const sourceItems = [...newDocs[sourceDocIndex].items];
      const itemIndex = sourceItems.findIndex(i => i.id === itemId);
      
      if (itemIndex === -1) return prevDocs;
      
      const [movedItem] = sourceItems.splice(itemIndex, 1);
      
      // Update source items
      newDocs[sourceDocIndex] = { ...newDocs[sourceDocIndex], items: sourceItems };

      // Add to target
      // If source and target are the same, we need to re-fetch items from the *updated* source (which is the target)
      // to avoid index shifting issues, but simpler to just operate on newDocs references
      
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

  const handleBatchRemoveBg = async () => {
    const docsToProcess = documents.filter(doc => doc.selected);
    
    if (docsToProcess.length === 0) {
       alert(language === 'en' ? "Select columns to process." : "Selecione as colunas para processar.");
       return;
    }

    setIsProcessing(true);

    // Collect all tasks first
    const tasks: { docId: string, itemId: string, url: string }[] = [];
    docsToProcess.forEach(doc => {
      doc.items.forEach(item => {
        if (item.type === 'image') {
          tasks.push({ docId: doc.id, itemId: item.id, url: item.url });
        }
      });
    });

    // Mark all as processing initially
    setDocuments(prev => prev.map(doc => {
      if (!doc.selected) return doc;
      return {
        ...doc,
        items: doc.items.map(item => item.type === 'image' ? { ...item, processing: true } : item)
      };
    }));

    try {
      // Process Sequentially (One by One) to avoid heavy load with Imgly in browser
      let successCount = 0;
      
      for (const task of tasks) {
        try {
          const newUrl = await removeBackground(task.url);
          successCount++;

          // Update this specific item immediately
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
           // Update status to failed (remove processing spinner)
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
      
      if (successCount < tasks.length) {
        setToast({ visible: true, message: t.batchProcessError, type: 'error' });
      } else {
        setToast({ visible: true, message: "Processamento concluído!", type: 'success' });
      }

    } catch (e) {
      console.error("Batch processing fatal error", e);
    } finally {
      setIsProcessing(false);
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
      await generatePDF(docsToSave);
      
      // Success Logic
      setToast({ visible: true, message: t.docSaved, type: 'success' });
      
      // Clear documents after a short delay to allow PDF generation/download to initiate
      setTimeout(() => {
        handleClearAll();
      }, 500);

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

  // Changelog Content
  const getChangelog = () => {
    if (language === 'pt-BR') {
        return [
            "Layout melhorado",
            "Adicionado rodapé na aplicação",
            "Agora o Αρχή PDF é capaz de ler e editar arquivos PDF",
            "Novo visual na tela de edição de imagens",
            "É possível mesclar imagens a arquivos PDF",
            "Adicionado filtros de imagem",
            "Agora é possível girar a imagem, diretamente no modal de edição"
        ];
    }
    // Fallback/Translation for other languages
    return [
        "Improved layout",
        "Added footer to the application",
        "Αρχή PDF can now read and edit PDF files",
        "New visual design for image editing screen",
        "It is possible to merge images with PDF files",
        "Added image filters",
        "Now you can rotate imagem directly in the image editor modal"
    ];
  };

  return (
    <div className={theme}>
      <div 
        className={`flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white font-sans transition-colors duration-300 relative`}
      >
        <TopBar 
          settings={settings} 
          updateSetting={handleUpdateSetting} 
          onSave={handleSave}
          onClearAll={handleClearAll}
          onRemoveBgBatch={handleBatchRemoveBg}
          isSaving={isSaving}
          isProcessing={isProcessing}
          allSelected={allSelected}
          onToggleSelectAll={handleToggleSelectAll}
          language={language}
          setLanguage={setLanguage}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        {/* Main Workspace */}
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
                    onMoveItem={handleMoveItem}
                    language={language}
                  />
                ))}
                
                {/* Empty spacer for visual balance when scrolling right */}
                <div className="w-20 flex-shrink-0" />
              </div>
            </div>

            {/* Floating Action Button - Positioned inside the dashed frame */}
            <button 
              onClick={handleAddDocument}
              className="absolute bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 rounded-full shadow-2xl flex items-center justify-center text-white transition transform hover:scale-105 z-30"
              title="Nova Coluna"
            >
              <Plus size={32} />
            </button>
          </div>

          {/* Footer - Outside the dashed frame, bottom of screen area */}
          <footer className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1 pb-1 relative z-40">
             <p>Αρχή - {t.footerQuote}</p>
             <p>
               Αρχή PDF© {new Date().getFullYear()} - {t.rightsReserved}. |{' '}
               <a title="Help" href="mailto:ti@advocaciabichara.com.br" className="hover:text-emerald-500 transition">{t.supportLink}</a> |{' '}
               <button 
                 onClick={() => setShowVersionInfo(!showVersionInfo)} 
                 className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2"
               >
                 Versão 2.0
               </button>
             </p>
          </footer>
        </main>

        {/* Version Info Modal/Toast */}
        {showVersionInfo && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl border border-emerald-500/30 z-[60] w-80 text-left transition-all duration-300 animate-slide-up">
             <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold text-base">Versão 2.0</h3>
                 </div>
                 <button 
                   onClick={() => setShowVersionInfo(false)} 
                   className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                 >
                   <X size={16}/>
                 </button>
             </div>
             <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-300 list-disc pl-4">
                 {getChangelog().map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                 ))}
             </ul>
             <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-b border-r border-emerald-500/30 rotate-45"></div>
          </div>
        )}

        {/* Toast Notification */}
        <Toast 
          message={toast.message}
          type={toast.type}
          isVisible={toast.visible}
          onClose={() => setToast({ ...toast, visible: false })}
          language={language}
        />

        {/* Update Notification Popup */}
        <UpdateNotification 
          isVisible={isUpdateAvailable}
          onUpdate={handleUpdateApp}
          language={language}
        />

        {/* Image Editor Modal */}
        {editingItem && editingItem.item.type === 'image' && (
          <EditorModal 
            item={editingItem.item}
            isOpen={!!editingItem}
            onClose={() => setEditingItem(null)}
            onUpdate={handleUpdateItem}
            language={language}
          />
        )}

        {/* PDF Editor Modal */}
        {editingItem && editingItem.item.type === 'pdf' && (
          <PdfEditorModal
            item={editingItem.item}
            isOpen={!!editingItem}
            onClose={() => setEditingItem(null)}
            onUpdate={handleUpdateItem}
            language={language}
          />
        )}
      </div>
    </div>
  );
};

export default App;