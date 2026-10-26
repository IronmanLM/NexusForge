import { readdir } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve(import.meta.dirname, '..', 'src');
const minimum = process.env.MIN_TEST_FILES === undefined ? 3 : Number(process.env.MIN_TEST_FILES);

if (!Number.isFinite(minimum) || !Number.isInteger(minimum) || minimum < 0) {
  console.error('MIN_TEST_FILES must be a finite non-negative integer.');
  process.exit(1);
}

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(target);
    }
    return /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const testFiles = await collectTestFiles(sourceRoot);
const relativeFiles = testFiles.map((file) => path.relative(sourceRoot, file));
const requiredSuites = ['services/authService.test.ts', 'services/syncService.test.ts'];
const missingSuites = requiredSuites.filter((required) => !relativeFiles.includes(required));

if (testFiles.length < minimum || missingSuites.length > 0) {
  console.error(`Frontend test suite incomplete: ${testFiles.length}/${minimum} test files; missing: ${missingSuites.join(', ') || 'none'}`);
  process.exit(1);
}

console.log(`Frontend test suite guard: ${testFiles.length} test files, required auth/sync suites present.`);
