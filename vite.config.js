import { defineConfig } from 'vite';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
// Version shown in Settings: major.minor from package.json + number of commits (grows with every change), plus the short commit id.
const sh = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const shallow = sh('git rev-parse --is-shallow-repository') === 'true';
const commits = !shallow && sh('git rev-list --count HEAD') ? Number(sh('git rev-list --count HEAD')) : (process.env.GITHUB_RUN_NUMBER ? Number(process.env.GITHUB_RUN_NUMBER) : 0);
const sha = (process.env.GITHUB_SHA || sh('git rev-parse HEAD') || 'local').slice(0, 7);
const [maj, min] = pkg.version.split('.');
const VERSION = `${maj}.${min}.${commits}`;
const BUILT = new Date().toISOString();
const BUILD_ID = `${VERSION}-${sha}-${Date.now().toString(36)}`; // unique per build: used to tell "same app" from "newer app"

/** Emits version.json (never cached by the service worker) so the app can ask "is there a newer version?" */
function versionFile() {
  return { name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION, sha, build: BUILD_ID, built: BUILT }) }); } };
}

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
  define: { __APP_VERSION__: JSON.stringify(VERSION), __APP_BUILD__: JSON.stringify(BUILD_ID), __APP_SHA__: JSON.stringify(sha), __APP_BUILT__: JSON.stringify(BUILT) },
  plugins: [devData(), versionFile(), obfuscate()],
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
