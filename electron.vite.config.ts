import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/main.ts', formats: ['es'] },
      rollupOptions: {
        output: { entryFileNames: '[name].js' },
      },
      sourcemap: true,
      minify: false,
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/preload/preload.ts', formats: ['cjs'] },
      rollupOptions: {
        output: { entryFileNames: '[name].cjs' },
      },
      sourcemap: 'inline',
      minify: false,
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['mermaid'],
    },
  },
})
