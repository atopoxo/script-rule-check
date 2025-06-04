import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true
      }
    })
  ],
  server: {
    host: 'localhost',
    port: 5173,  // 指定端口
    strictPort: true,  // 严格端口
    watch: {
      usePolling: true, // 在某些文件系统上需要
      interval: 1000    // 轮询间隔
    },
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS"
    }
  },
  base: './',
  define: {
    global: 'window',
    'process.env': {},
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'), // 输出到插件目录
    assetsDir: 'static',
    emptyOutDir: true,
    sourcemap: true, // 启用源码映射
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: `static/[name].js`,
        chunkFileNames: `static/[name].js`,
        assetFileNames: `static/[name].[ext]`
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@types': path.resolve(__dirname, 'src/types'),
      "@assets": path.resolve(__dirname, 'src/assets'),
    },
    extensions: ['.ts', '.js', '.vue', '.json']
  },
  optimizeDeps: {
    include: [
      'src/global.d.ts'
    ]
  }
});
