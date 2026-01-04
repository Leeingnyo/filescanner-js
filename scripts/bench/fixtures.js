import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';

export function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function createFileTree(params) {
  const { rootDir, files, depth, branch, prefix = 'file', extension = 'txt' } = params;
  const created = [];
  for (let i = 0; i < files; i += 1) {
    const segments = [];
    let remaining = i;
    for (let d = 0; d < depth; d += 1) {
      const bucket = remaining % branch;
      remaining = Math.floor(remaining / branch);
      segments.push(`d${d}-${bucket}`);
    }
    const dirPath = path.join(rootDir, ...segments);
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, `${prefix}-${i}.${extension}`);
    fs.writeFileSync(filePath, `content-${i}`);
    created.push(path.relative(rootDir, filePath));
  }
  return created;
}

export function mutateContent(params) {
  const { rootDir, files, count, suffix = 'changed' } = params;
  const indices = pickIndices(files.length, count);
  for (const idx of indices) {
    const filePath = path.join(rootDir, files[idx]);
    fs.writeFileSync(filePath, `content-${idx}-${suffix}`);
  }
  return indices.map((idx) => files[idx]);
}

export function moveFiles(params) {
  const { rootDir, files, count, targetDir = 'moved' } = params;
  const indices = pickIndices(files.length, count, files.length - count);
  const moved = [];
  for (const idx of indices) {
    const relPath = files[idx];
    const srcPath = path.join(rootDir, relPath);
    const baseName = path.basename(relPath);
    const dstDir = path.join(rootDir, targetDir);
    fs.mkdirSync(dstDir, { recursive: true });
    const dstPath = path.join(dstDir, baseName);
    fs.renameSync(srcPath, dstPath);
    moved.push({ from: relPath, to: path.relative(rootDir, dstPath) });
  }
  return moved;
}

export async function createZip(params) {
  const { zipPath, entries } = params;
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    if (entry.dir || (entry.content === undefined && entry.name.endsWith('/'))) {
      zip.addEmptyDirectory(entry.name);
    } else {
      zip.addBuffer(Buffer.from(entry.content ?? '', 'utf8'), entry.name);
    }
  }
  zip.end();
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    zip.outputStream.pipe(out);
    out.on('close', resolve);
    out.on('error', reject);
  });
}

export async function createZips(params) {
  const { rootDir, count, entriesPerZip = 10 } = params;
  const archiveDir = path.join(rootDir, 'archives');
  fs.mkdirSync(archiveDir, { recursive: true });
  for (let i = 0; i < count; i += 1) {
    const entries = [];
    for (let j = 0; j < entriesPerZip; j += 1) {
      entries.push({ name: `file-${j}.txt`, content: `zip-${i}-${j}` });
    }
    await createZip({ zipPath: path.join(archiveDir, `archive-${i}.zip`), entries });
  }
  return archiveDir;
}

function pickIndices(total, count, start = 0) {
  if (count <= 0) return [];
  const indices = [];
  const step = Math.max(1, Math.floor((total - start) / count));
  for (let i = 0; i < count; i += 1) {
    const idx = Math.min(total - 1, start + i * step);
    indices.push(idx);
  }
  return indices;
}
