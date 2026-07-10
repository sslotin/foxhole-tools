import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ViteRestart from 'vite-plugin-restart';

export default defineConfig({
  plugins: [
    vue(),
    // Auto-restart the dev server when generated artifacts change (e.g. after
    // `npm run build:data`), so the browser refreshes without a manual restart.
    // Source edits still use normal HMR.
    //
    // Watch the generated data files EXPLICITLY (not a directory and not `**`):
    //  - a bare dir path like `parser/data` is treated by micromatch as a glob
    //    that matches only the dir itself, so file changes inside never match;
    //  - `parser/data/**` would match and restart correctly, but adds hundreds
    //    of recursive inotify watches (public icons are huge) and hits the
    //    kernel watcher limit (ENOSPC), crashing the server.
    //  - explicit files = 2 watches, always match, and build:data rewrites both
    //    every run, so the restart also re-serves public/icons fresh (fixing the
    //    icon staleness the public/ rmSync causes).
    // `contentCheck: false` (default true) forces a restart on every build:data
    // run, not only when content changed — also catches icon-only changes.
    ViteRestart({
      restart: ['parser/data/metadata.json', 'parser/data/recipes.json'],
      contentCheck: false,
    }),
  ],
});