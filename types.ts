
export interface ImageItem {
  id: string;
  url: string; // URL atual (com edições)
  originalUrl: string; // Cache da imagem original (sem edições)
  originalFile?: File;
  name: string;
  type: 'image' | 'pdf';
  width?: number;
  height?: number;
  selected: boolean;
  processing?: boolean; // True if AI is working on it
  backupUrl?: string; // URL da última operação (para desfazer lote)
}

export interface DocumentGroup {
  id: string;
  title: string;
  items: ImageItem[];
  selected: boolean;
  isSorting?: boolean;
}

export interface AppSettings {
  convertToPdf: boolean;
  saveSeparately: boolean;
  saveInGroup: boolean;
  useOCR: boolean;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Language = 'pt-BR' | 'en' | 'he' | 'el' | 'es';
export type Theme = 'light' | 'dark';

// Global constant definition injected by Vite
declare global {
  const __APP_VERSION__: string;
}
