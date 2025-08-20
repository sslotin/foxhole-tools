import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis', // Define global for browser
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true, // Polyfill Buffer
        }),
      ],
    },
  },
  /*build: {
    rollupOptions: {
      external: ['canvas'],
    },
  },*/
});
