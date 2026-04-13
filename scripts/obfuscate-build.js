// Script de build — copie src/ vers build/src/ et obfusque les fichiers .js
// À exécuter avant electron-builder (prérequis : npm install javascript-obfuscator)

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const BUILD_DIR = path.join(__dirname, '..', 'build', 'src');

// Fichiers à ne pas obfusquer (structure critique ou Node/require)
const SKIP_OBFUSCATE = ['preload.js'];

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch (e) {
  console.error('Erreur: javascript-obfuscator non installé. Exécutez: npm install --save-dev javascript-obfuscator');
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function obfuscateFile(filePath) {
  const relativePath = path.relative(BUILD_DIR, filePath);
  const basename = path.basename(filePath);
  if (!basename.endsWith('.js')) return;
  if (SKIP_OBFUSCATE.includes(basename)) return;
  if (relativePath.includes('extensions')) return;

  const code = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    renameGlobals: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.5
  });
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
  console.log('  Obfusqué: ' + relativePath);
}

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.js')) {
      obfuscateFile(fullPath);
    }
  }
}

console.log('Build obfuscation...');
if (fs.existsSync(path.join(__dirname, '..', 'build'))) {
  fs.rmSync(path.join(__dirname, '..', 'build'), { recursive: true });
}
copyDir(SRC_DIR, BUILD_DIR);
console.log('Fichiers copiés. Obfuscation des .js...');
processDir(BUILD_DIR);
console.log('Terminé.');
