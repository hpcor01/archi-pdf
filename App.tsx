
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, Sparkles, Info, Users, ShieldCheck, Github, ExternalLink, BookOpen, Layers, Maximize2, FileText, Settings, LayoutGrid } from 'lucide-react';
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

const APP_VERSION_LABEL = "2.5";

const App = () => {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [documents, setDocuments] = useState<DocumentGroup[]>([
    { id: '1', title: 'PDF 1', items: [], selected: false }
  ]);
  const [editingItem, setEditingItem] = useState<{ docId: string, item: ImageItem } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<Language>('pt-BR');
  const [showCompressionHighlight, setShowCompressionHighlight] = useState(false);
  const [showManualHighlight, setShowManualHighlight] = useState(false);
  const [showManual, setShowManual] = useState(false);
  
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

  const hasAnyPdf = useMemo(() => {
    return documents.some(doc => doc.items.some(item => item.type === 'pdf'));
  }, [documents]);

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
    const interval = setInterval(checkVersion, 60000);
    const handleFocus = () => checkVersion();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Controle de destaque das novas versões
  useEffect(() => {
    const seenVersion = localStorage.getItem('seen-app-version');
    if (seenVersion !== APP_VERSION_LABEL) {
      // Se nunca viu a 2.4, mostra destaque de compressão
      if (!seenVersion || parseFloat(seenVersion) < 2.4) {
        setShowCompressionHighlight(true);
      }
      // Mostra destaque do manual para a 2.5
      setShowManualHighlight(true);
    }
  }, []);

  const handleCloseCompressionHighlight = () => {
    setShowCompressionHighlight(false);
    // Só atualiza a versão global se ambos forem fechados ou se for o mais recente
    if (!showManualHighlight) localStorage.setItem('seen-app-version', APP_VERSION_LABEL);
  };

  const handleCloseManualHighlight = () => {
    setShowManualHighlight(false);
    localStorage.setItem('seen-app-version', APP_VERSION_LABEL);
  };

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
      await generatePDF(docsToSave, settings.useOCR, settings.compressPdf);
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
      "v2.5 - NOVO: Manual do Usuário interativo e detalhado",
      "v2.4 - Recurso de Compressão de PDF de alta performance",
      "v2.3 - Sistema de Detecção de Atualizações Automáticas",
      "v2.2 - Recorte Manual Profissional e IA OpenCV 4.x",
      "OCR Inteligente e suporte a PDF nativo integrados"
    ] : [
      "v2.5 - NEW: Detailed and interactive User Manual",
      "v2.4 - High-performance PDF Compression feature",
      "v2.3 - Automatic Update Detection System",
      "v2.2 - Professional Manual Crop and OpenCV 4.x AI",
      "Integrated Smart OCR and native PDF support"
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
          hasAnyPdf={hasAnyPdf}
          allSelected={documents.length > 0 && documents.every(d => d.selected)}
          hasSelection={documents.some(d => d.selected)}
          onToggleSelectAll={handleToggleSelectAll} language={language}
          setLanguage={setLanguage} theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          showCompressionHighlight={showCompressionHighlight}
          onCloseHighlight={handleCloseCompressionHighlight}
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
            
            <div className="absolute bottom-6 right-6 flex flex-col space-y-4 items-center z-30">
              <div className="relative">
                <button 
                  onClick={() => { setShowManual(true); if (showManualHighlight) handleCloseManualHighlight(); }} 
                  className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full shadow-lg flex items-center justify-center transition transform hover:scale-110 hover:bg-emerald-200 dark:hover:bg-emerald-800/50"
                  title={t.manualTitle}
                >
                  <BookOpen size={28} />
                </button>

                {/* Destaque para o Manual (v2.5) */}
                {showManualHighlight && (
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-4 z-[60] animate-fade-in pointer-events-auto">
                    <div className="relative bg-emerald-600 text-white p-3 rounded-2xl shadow-2xl min-w-[200px] border border-emerald-500">
                      {/* Arrow */}
                      <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-emerald-600" />
                      
                      <div className="flex items-start justify-between space-x-2">
                         <div className="flex items-center space-x-2">
                            <Sparkles size={16} className="text-white fill-white" />
                            <span className="text-xs font-black uppercase tracking-tight">
                              {language === 'pt-BR' ? "Novo: Manual do Usuário" : "New: User Manual"}
                            </span>
                         </div>
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleCloseManualHighlight(); }}
                            className="p-1 hover:bg-white/20 rounded-full transition-colors"
                          >
                            <X size={14} />
                         </button>
                      </div>
                      
                      {/* Pulse Effect Background */}
                      <div className="absolute -inset-1 border-2 border-emerald-500/50 rounded-2xl animate-ping pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleAddDocument} className="w-14 h-14 bg-emerald-500 hover:bg-emerald-400 rounded-full shadow-2xl flex items-center justify-center text-white transition transform hover:scale-105">
                <Plus size={32} />
              </button>
            </div>
          </div>
          <footer className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1 pb-1 relative z-40">
             <p>Αρχή - {t.footerQuote}</p>
             <div className="flex items-center justify-center space-x-2">
               <span>Αρχή PDF© {new Date().getFullYear()} - {t.rightsReserved}.</span>
               <span>|</span>
               <a target="_blank" rel="noopener noreferrer" href="https://app.pipefy.com/public/form/d_5r27Kf" className="hover:text-emerald-500 transition">{t.supportLink}</a>
               <span>|</span>
               <button onClick={() => { setShowAboutInfo(true); setShowVersionInfo(false); setShowManual(false); }} className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2">
                 {t.about}
               </button>
               <span>|</span>
               <button onClick={() => { setShowVersionInfo(true); setShowAboutInfo(false); setShowManual(false); }} className="hover:text-emerald-500 transition font-medium underline decoration-dotted underline-offset-2">
                 v{APP_VERSION_LABEL}
               </button>
             </div>
          </footer>
        </main>

        {/* Modal Versão */}
        {showVersionInfo && (
          <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl border border-emerald-500/30 z-[60] w-80 text-left transition-all duration-300 animate-slide-up">
             <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold text-base">{t.version} {APP_VERSION_LABEL}</h3>
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

        {/* Modal Manual do Usuário */}
        {showManual && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
             <div className="bg-white dark:bg-gray-900 w-full max-w-2xl p-8 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                   <div className="flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
                      <BookOpen size={28} />
                      <h3 className="text-2xl font-black">{t.manualTitle}</h3>
                   </div>
                   <button onClick={() => setShowManual(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition">
                      <X size={24} />
                   </button>
                </div>

                <p className="text-gray-600 dark:text-gray-400 mb-8 font-medium italic">
                   {t.manualIntro}
                </p>

                <div className="flex-1 overflow-y-auto pr-4 space-y-8 custom-scrollbar">
                   <section className="flex items-start space-x-4">
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex-shrink-0">
                         <Layers size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm mb-1">{t.manualOrganize}</h4>
                         <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t.manualOrganizeText}</p>
                      </div>
                   </section>

                   <section className="flex items-start space-x-4">
                      <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex-shrink-0">
                         <Maximize2 size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm mb-1">{t.manualAutoCrop}</h4>
                         <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t.manualAutoCropText}</p>
                      </div>
                   </section>

                   <section className="flex items-start space-x-4">
                      <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex-shrink-0">
                         <LayoutGrid size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm mb-1">{t.manualEditor}</h4>
                         <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t.manualEditorText}</p>
                      </div>
                   </section>

                   <section className="flex items-start space-x-4">
                      <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex-shrink-0">
                         <FileText size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm mb-1">{t.manualPdfTools}</h4>
                         <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t.manualPdfToolsText}</p>
                      </div>
                   </section>

                   <section className="flex items-start space-x-4">
                      <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl flex-shrink-0">
                         <Settings size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm mb-1">{t.manualSettings}</h4>
                         <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t.manualSettingsText}</p>
                      </div>
                   </section>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
                   <button onClick={() => setShowManual(false)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl transition shadow-lg shadow-emerald-500/20">
                      Entendi, vamos começar!
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* Modal Sobre */}
        {showAboutInfo && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
             <div className="bg-white dark:bg-gray-800 w-full max-w-md p-8 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 animate-fade-in relative">
                <button onClick={() => setShowAboutInfo(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                  <X size={20} />
                </button>
                
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
                    <Users size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{t.aboutTitle}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 leading-relaxed">
                    {t.developedBy}
                  </p>

                  <div className="w-full space-y-4 text-left">
                    <div className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
                      <ShieldCheck size={18} className="text-emerald-500" />
                      <span className="text-sm font-bold uppercase tracking-wider">{t.openSourceLicenses}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { name: 'PDF-lib', url: 'https://pdf-lib.js.org/' },
                        { name: 'OpenCV.js', url: 'https://docs.opencv.org/4.x/opencv.js' },
                        { name: 'Tesseract.js', url: 'https://tesseract.projectnaptha.com/' },
                        { name: 'PDF.js', url: 'https://mozilla.github.io/pdf.js/' },
                        { name: 'Lucide Icons', url: 'https://lucide.dev/' }
                      ].map(lib => (
                        <a key={lib.name} href={lib.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition group">
                          <span className="text-sm font-medium">{lib.name}</span>
                          <ExternalLink size={14} className="text-gray-400 group-hover:text-emerald-500 transition" />
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 flex items-center space-x-4">
                     <button onClick={() => { setShowAboutInfo(false); }} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                       Fechar
                     </button>
                  </div>
                </div>
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
