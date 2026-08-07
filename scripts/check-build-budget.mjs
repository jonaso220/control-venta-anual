import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const assetsDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const indexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const maximumJavaScriptBytes = 500 * 1024;
const maximumInitialGzipBytes = 220 * 1024;
const files = await readdir(assetsDirectory);
const javaScriptFiles = files.filter((file) => file.endsWith('.js'));

if (javaScriptFiles.length === 0) {
  throw new Error('No se encontraron archivos JavaScript compilados en dist/assets.');
}

const sizes = await Promise.all(javaScriptFiles.map(async (file) => ({
  file,
  bytes: (await stat(join(assetsDirectory, file))).size,
})));
const oversized = sizes.filter(({ bytes }) => bytes > maximumJavaScriptBytes);

if (oversized.length > 0) {
  const details = oversized
    .map(({ file, bytes }) => `${file}: ${(bytes / 1024).toFixed(1)} KiB`)
    .join('\n');
  throw new Error(`El presupuesto máximo es 500 KiB por chunk:\n${details}`);
}

const indexHtml = await readFile(indexPath, 'utf8');
const initialFiles = [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"?]+\.js)(?:\?[^\"]*)?"/g)]
  .map(match => match[1])
  .filter((file, index, allFiles) => allFiles.indexOf(file) === index);
if (initialFiles.length === 0) {
  throw new Error('No se pudieron identificar los chunks JavaScript iniciales en dist/index.html.');
}
const initialGzipBytes = (await Promise.all(initialFiles.map(async file => (
  gzipSync(await readFile(join(assetsDirectory, file))).length
)))).reduce((total, bytes) => total + bytes, 0);
if (initialGzipBytes > maximumInitialGzipBytes) {
  throw new Error(
    `La carga inicial comprimida supera 220 KiB: ${(initialGzipBytes / 1024).toFixed(1)} KiB.`,
  );
}

console.log(
  `Presupuesto aprobado: ${sizes.length} chunks <= 500 KiB y carga inicial gzip de ${(initialGzipBytes / 1024).toFixed(1)} KiB <= 220 KiB.`,
);
