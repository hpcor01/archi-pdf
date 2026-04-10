
import { PdfPage } from '../components/PdfEditorModal';

const DB_NAME = 'ArchiPDFCache';
const STORE_NAME = 'pdf_pages';
const DB_VERSION = 1;

class PdfCacheService {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async get(itemId: string): Promise<{ pages: PdfPage[], bytes?: ArrayBuffer } | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(itemId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.pages) {
          // REGERAÇÃO DE URLs: Blobs vindos do IndexedDB precisam de novos Object URLs
          // Isso permite que o navegador renderize as imagens binárias instantaneamente
          result.pages = result.pages.map((page: PdfPage) => {
            if (page.thumbnailBlob) {
              return {
                ...page,
                thumbnail: URL.createObjectURL(page.thumbnailBlob)
              };
            }
            return page;
          });
        }
        resolve(result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async save(itemId: string, pages: PdfPage[], bytes?: ArrayBuffer): Promise<void> {
    const db = await this.init();
    
    // LIMPEZA ANTES DE SALVAR: Remover referências a URLs temporárias e arquivos originais
    // para evitar inconsistências e excesso de peso no IndexedDB
    const pagesToSave = pages.map(page => {
      const { originalFile, ...rest } = page;
      // Se tivermos o Blob, salvamos ele. A string 'thumbnail' (blob:url) não deve ser salva
      // porque ela expira quando a página é atualizada.
      return {
        ...rest,
        thumbnail: "" // Será regenerada no próximo 'get'
      };
    });

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ pages: pagesToSave, bytes, timestamp: Date.now() }, itemId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearCache(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const pdfCacheService = new PdfCacheService();
