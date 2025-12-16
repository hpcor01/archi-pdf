import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface UpdateNotificationProps {
  isVisible: boolean;
  onUpdate: () => void;
  language: Language;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ isVisible, onUpdate, language }) => {
  if (!isVisible) return null;
  const t = TRANSLATIONS[language];

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-white dark:bg-gray-800 border border-emerald-500 shadow-2xl rounded-xl p-4 flex flex-col items-start animate-slide-up max-w-xs">
      <div className="flex items-center space-x-2 mb-3 text-emerald-600 dark:text-emerald-400">
        <RefreshCw className="animate-spin-slow" size={20} />
        <span className="font-semibold text-sm">{t.updateAvailable}</span>
      </div>
      <button 
        onClick={onUpdate}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2 px-4 rounded-lg transition text-sm shadow-md"
      >
        {t.updateNow}
      </button>
    </div>
  );
};

export default UpdateNotification;