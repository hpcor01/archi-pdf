import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, FolderOpen, X } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  isVisible: boolean;
  onClose: () => void;
  language: Language;
}

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose, language }) => {
  const t = TRANSLATIONS[language];

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto close after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const handleOpenFolder = () => {
    // Browsers prevent direct access to file system explorer for security.
    // We show an alert or notification explaining where it is.
    alert(t.folderInfo);
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] flex items-center p-4 rounded-xl shadow-2xl border transition-all duration-300 animate-slide-up
      ${type === 'success' 
        ? 'bg-white dark:bg-gray-800 border-emerald-500 text-gray-800 dark:text-white' 
        : 'bg-white dark:bg-gray-800 border-red-500 text-gray-800 dark:text-white'}`}
    >
      <div className={`mr-3 ${type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
        {type === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
      </div>
      
      <div className="flex flex-col mr-6">
        <span className="font-medium text-sm">{message}</span>
        {type === 'success' && (
          <button 
            onClick={handleOpenFolder}
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline mt-1 flex items-center text-left"
          >
            <FolderOpen size={12} className="mr-1" />
            {t.openFolder}
          </button>
        )}
      </div>

      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
        <X size={18} />
      </button>
    </div>
  );
};

export default Toast;