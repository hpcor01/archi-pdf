import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(() => {
  const version = new Date().getTime().toString();
  
  return {
    plugins: [
      react(),
      {
        name: 'postbuild-version-file',
        writeBundle() {
          const distPath = path.resolve((process as any).cwd(), 'dist');
          // Verifica se a pasta dist existe antes de escrever
          if (fs.existsSync(distPath)) {
            fs.writeFileSync(
              path.join(distPath, 'version.json'),
              JSON.stringify({ version })
            );
          }
        }
      }
    ],
    define: {
      '__APP_VERSION__': JSON.stringify(version)
    },
    base: './', // Ensure relative paths for assets
    server: {
      // Proxy removed; fetching directly from CDN
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});