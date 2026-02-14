
import React, { useState } from 'react';
import { Globe, Moon, Sun, ChevronDown, Trash, Maximize, AlertTriangle, Undo2, Zap, X as CloseIcon } from 'lucide-react';
import { AppSettings, Language, Theme } from '../types';
import { TRANSLATIONS } from '../constants';

interface TopBarProps {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: boolean) => void;
  onSave: () => void;
  onClearAll: () => void;
  onRemoveBgBatch: () => void;
  onUndoBatch?: () => void;
  canUndo?: boolean;
  isSaving: boolean;
  isProcessing: boolean;
  isPdfSelected: boolean;
  hasAnyPdf: boolean; 
  allSelected: boolean;
  hasSelection: boolean;
  onToggleSelectAll: (selected: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
  showCompressionHighlight?: boolean;
  onCloseHighlight?: () => void;
}

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'pt-BR', label: 'Português do Brasil' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
];

const TopBar: React.FC<TopBarProps> = ({ 
  settings, 
  updateSetting, 
  onSave, 
  onClearAll,
  onRemoveBgBatch,
  onUndoBatch,
  canUndo,
  isSaving,
  isProcessing,
  isPdfSelected,
  hasAnyPdf,
  allSelected,
  hasSelection,
  onToggleSelectAll,
  language,
  setLanguage,
  theme,
  toggleTheme,
  showCompressionHighlight,
  onCloseHighlight
}) => {
  const t = TRANSLATIONS[language];
  const [isLangOpen, setIsLangOpen] = useState(false);

  // Toggle OCR state with confirmation popup
  const handleOcrToggle = () => {
    if (!settings.useOCR) {
      const message = language === 'pt-BR' 
        ? "O processamento de OCR poderá ser significativamente mais lento. Deseja ativar?" 
        : "OCR processing may be significantly slower. Do you want to enable it?";
      
      if (window.confirm(message)) {
        updateSetting('useOCR', true);
      }
    } else {
      updateSetting('useOCR', false);
    }
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 select-none transition-colors duration-300 relative z-40">
      {/* Left Area: Theme and Language */}
      <div className="flex items-center space-x-4">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition"
          title="Alternar Tema"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="relative">
          <button 
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-200"
          >
            <Globe size={16} className="mr-2 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium">{LANGUAGES.find(l => l.code === language)?.label}</span>
            <ChevronDown size={14} className="ml-2 text-gray-400" />
          </button>
          
          {isLangOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsLangOpen(false)}></div>
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsLangOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${language === lang.code ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Area: Main Actions */}
      <div className="flex items-center space-x-6">
        
        {/* Batch Auto Crop Actions */}
        <div className="flex items-center space-x-2">
            <button 
              onClick={onRemoveBgBatch}
              disabled={isSaving || isProcessing || !hasSelection}
              className="flex items-center space-x-2 transition-all text-gray-700 dark:text-gray-200 hover:text-emerald-500 dark:hover:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed group"
              title={t.autoCropBatch}
            >
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 transition-colors">
                <Maximize size={18} />
              </div>
              <span className="text-sm font-semibold whitespace-nowrap hidden lg:inline">{t.autoCropBatch}</span>
            </button>

            {/* Undo Batch Action */}
            <button 
              onClick={onUndoBatch}
              disabled={isSaving || isProcessing || !canUndo}
              className="flex items-center space-x-2 transition-all text-gray-700 dark:text-gray-200 hover:text-orange-500 dark:hover:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed group"
              title={t.undo}
            >
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 transition-colors">
                <Undo2 size={18} />
              </div>
              <span className="text-sm font-semibold whitespace-nowrap hidden lg:inline">{t.undo}</span>
            </button>
        </div>

        <button 
          onClick={onClearAll}
          className="flex items-center space-x-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition"
          title={t.clearAll}
        >
          <Trash size={18} />
          <span className="text-sm font-semibold whitespace-nowrap hidden lg:inline">{t.clearAll}</span>
        </button>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

        {/* Compression Switch Toggle - Conditionally Enabled */}
        <div className="relative">
          <div className={`flex items-center space-x-3 transition-opacity duration-300 ${hasAnyPdf ? 'opacity-100' : 'opacity-30 pointer-events-none grayscale'}`}>
            <div className="flex flex-col items-end">
               <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase leading-none mb-1 tracking-widest">Compress</span>
               <button 
                  type="button"
                  disabled={!hasAnyPdf}
                  onClick={() => updateSetting('compressPdf', !settings.compressPdf)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shadow-inner ${settings.compressPdf ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                  aria-pressed={settings.compressPdf}
               >
                  <span 
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${settings.compressPdf ? 'translate-x-6' : 'translate-x-1'}`}
                  />
               </button>
            </div>
            {settings.compressPdf && (
              <span title={t.compressPdf}>
                <Zap size={18} className="text-orange-500" />
              </span>
            )}
          </div>

          {/* Destaque de Novo Recurso (Tooltip contextual) */}
          {showCompressionHighlight && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-[60] animate-fade-in pointer-events-auto">
               <div className="relative bg-orange-500 text-white p-3 rounded-2xl shadow-2xl min-w-[180px] border border-orange-400">
                  {/* Arrow */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-orange-500" />
                  
                  <div className="flex items-start justify-between space-x-2">
                     <div className="flex items-center space-x-2">
                        <Zap size={16} className="text-white fill-white" />
                        <span className="text-xs font-black uppercase tracking-tight whitespace-nowrap">
                          {language === 'pt-BR' ? "Novo: Comprimir arquivos PDF" : "New: Compress PDF files"}
                        </span>
                     </div>
                     <button 
                        onClick={(e) => { e.stopPropagation(); onCloseHighlight?.(); }}
                        className="p-1 hover:bg-white/20 rounded-full transition-colors"
                      >
                        <CloseIcon size={14} />
                     </button>
                  </div>
                  
                  {/* Pulse Effect Background */}
                  <div className="absolute -inset-1 border-2 border-orange-500/50 rounded-2xl animate-ping pointer-events-none" />
               </div>
            </div>
          )}
        </div>

        {/* OCR Switch Toggle - Conditionally Enabled */}
        <div className={`flex items-center space-x-3 transition-opacity duration-300 ${hasAnyPdf ? 'opacity-100' : 'opacity-30 pointer-events-none grayscale'}`}>
          <div className="flex flex-col items-end">
             <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase leading-none mb-1 tracking-widest">OCR AI</span>
             <button 
                type="button"
                disabled={!hasAnyPdf}
                onClick={handleOcrToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shadow-inner ${settings.useOCR ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                aria-pressed={settings.useOCR}
             >
                <span 
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${settings.useOCR ? 'translate-x-6' : 'translate-x-1'}`}
                />
             </button>
          </div>
          {settings.useOCR && (
            <span title={t.ocrWarning}>
              <AlertTriangle size={18} className="text-amber-500 animate-pulse" />
            </span>
          )}
        </div>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

        {/* Selection and Save Settings */}
        <div className="flex items-center space-x-4">
           <label className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
              <input 
                type="checkbox" 
                checked={allSelected}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                className="custom-checkbox"
              />
              <span className="text-xs font-bold whitespace-nowrap">{t.selectAll}</span>
           </label>

           <label className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
              <input 
                type="checkbox" 
                checked={settings.saveSeparately}
                onChange={(e) => updateSetting('saveSeparately', e.target.checked)}
                className="custom-checkbox"
              />
              <span className="text-xs font-bold whitespace-nowrap">{t.saveSeparately}</span>
           </label>
        </div>

        {/* Save Button */}
        <button 
          onClick={onSave}
          disabled={isSaving || isProcessing}
          className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/20 disabled:opacity-50 flex items-center min-w-[120px] justify-center"
        >
          {isSaving ? (
             <div className="flex items-center">
               <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
               {t.saving}
             </div>
          ) : t.save}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
