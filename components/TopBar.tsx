import React, { useState } from 'react';
import { Globe, Moon, Sun, ChevronDown, Trash, Eraser } from 'lucide-react';
import { AppSettings, Language, Theme } from '../types';
import { TRANSLATIONS } from '../constants';

interface TopBarProps {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: boolean) => void;
  onSave: () => void;
  onClearAll: () => void;
  onRemoveBgBatch: () => void;
  isSaving: boolean;
  isProcessing: boolean;
  allSelected: boolean;
  onToggleSelectAll: (selected: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
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
  isSaving,
  isProcessing,
  allSelected,
  onToggleSelectAll,
  language,
  setLanguage,
  theme,
  toggleTheme
}) => {
  const t = TRANSLATIONS[language];
  const [isLangOpen, setIsLangOpen] = useState(false);

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 select-none transition-colors duration-300 relative z-40">
      {/* Left: Theme & Language */}
      <div className="flex items-center space-x-4">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Language Dropdown */}
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

      {/* Right: Actions */}
      <div className="flex items-center space-x-6">
        
        {/* Clear All Button */}
        <button 
          onClick={onClearAll}
          className="flex items-center space-x-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition"
          title={t.clearAll}
        >
          <Trash size={16} />
          <span className="text-sm font-medium">{t.clearAll}</span>
        </button>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

        {/* Bulk AI Action */}
        <button 
          onClick={onRemoveBgBatch}
          disabled={true}
          className="flex items-center space-x-2 text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition disabled:opacity-50"
          title={t.removeBgBatch}
        >
          <Eraser size={16} />
          <span className="text-sm font-medium">{t.removeBgBatch}</span>
        </button>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2"></div>

        <label className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
           <input 
             type="checkbox" 
             checked={allSelected}
             onChange={(e) => onToggleSelectAll(e.target.checked)}
             className="custom-checkbox"
           />
           <span className="text-sm font-medium">{t.selectAll}</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
           <input 
             type="checkbox" 
             checked={settings.saveSeparately}
             onChange={(e) => updateSetting('saveSeparately', e.target.checked)}
             className="custom-checkbox"
           />
           <span className="text-sm font-medium">{t.saveSeparately}</span>
        </label>
        
        <label className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
           <input 
             type="checkbox" 
             checked={settings.saveInGroup}
             onChange={(e) => updateSetting('saveInGroup', e.target.checked)}
             className="custom-checkbox"
           />
           <span className="text-sm font-medium">{t.saveInGroup}</span>
        </label>

        <button 
          onClick={onSave}
          disabled={isSaving || isProcessing}
          className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-sm font-medium transition shadow-lg shadow-emerald-500/20 dark:shadow-emerald-900/20 disabled:opacity-50 flex items-center"
        >
          {isSaving ? t.saving : t.save}
        </button>
      </div>
    </header>
  );
};

export default TopBar;