import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  root: path.join(__dirname, 'src', 'scraper_app'),
  // Copie src/img (ranks, etc.) à la racine du build pour que img/ranks/*.png soit disponibles
  publicDir: path.join(__dirname, 'src', 'img'),
  build: {
    outDir: path.join(__dirname, 'src', 'scraper'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, 'src', 'scraper_app', 'index.html'),
    },
  },
});
