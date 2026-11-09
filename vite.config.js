import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const VERSION = `${pkg.version}.${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

// Obfuscates the final JS bundles. Set NO_OBFUSCATE=1 to skip (debugging).
// NOTE: this only makes copying harder; code that runs in a browser can never be fully hidden.
function obfuscate() {
  return {
    name: 'cc-obfuscate', apply: 'build', enforce: 'post',
    generateBundle(_, bundle) {
      if (process.env.NO_OBFUSCATE) return;
      for (const f of Object.values(bundle)) {
        if (f.type !== 'chunk' || !f.fileName.endsWith('.js')) continue;
        f.code = JavaScriptObfuscator.obfuscate(f.code, {
          sourceType: 'module', target: 'browser', compact: true, simplify: true,
          identifierNamesGenerator: 'hexadecimal', renameGlobals: false, renameProperties: false,
          stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.8, stringArrayRotate: true, stringArrayShuffle: true, stringArrayWrappersCount: 2,
          controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.2,
          deadCodeInjection: false, selfDefending: false, debugProtection: false, transformObjectKeys: false,
          splitStrings: false, unicodeEscapeSequence: false, disableConsoleOutput: false,
        }).getObfuscatedCode();
        f.map = null;
      }
    },
  };
}

// In dev, serve ./data as /data
function devData() {
  return {
    name: 'cc-dev-data', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const p = path.join('data', decodeURIComponent((req.url || '/').split('?')[0]));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) { res.setHeader('Content-Type', 'application/json'); res.end(fs.readFileSync(p)); } else next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [devData(), obfuscate()],
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
