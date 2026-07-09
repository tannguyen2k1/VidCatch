import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from './manifest.json' assert { type: 'json' };

function copyIcons() {
  return {
    name: 'copy-icons',
    closeBundle() {
      const outDir = resolve('dist/icons');
      mkdirSync(outDir, { recursive: true });
      for (const name of ['icon16.png', 'icon48.png', 'icon128.png', 'icon16-gray.png', 'icon48-gray.png', 'icon128-gray.png']) {
        copyFileSync(resolve('icons', name), resolve(outDir, name));
      }
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
    copyIcons(),
  ],
  build: {
    target: 'esnext'
  }
});
