import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// Bakes the app version into the service worker cache name so every release
// starts from a clean cache (public/sw.js ships with a __APP_VERSION__ token).
function swVersion(): Plugin {
  let outDir = 'dist'
  return {
    name: 'khallesa-sw-version',
    configResolved(cfg) {
      outDir = cfg.build.outDir
    },
    closeBundle() {
      const file = `${outDir}/sw.js`
      if (!existsSync(file)) return
      const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string
      writeFileSync(file, readFileSync(file, 'utf8').replace(/__APP_VERSION__/g, version))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // './' lets the build run from file:// inside the Capacitor WebView (APK)
  base: './',
  plugins: [react(), tailwindcss(), swVersion()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
