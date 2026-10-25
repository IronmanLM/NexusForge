import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function git(...args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

test('local backend persistence files are ignored by git', () => {
  assert.doesNotThrow(() => git('check-ignore', '-q', 'backend/data/state.json'));
  assert.doesNotThrow(() => git('check-ignore', '-q', 'backend/data/resources/private-upload.pdf'));
});

test('state.json is ignored at every project path', () => {
  assert.doesNotThrow(() => git('check-ignore', '-q', 'discord-bot/data/state.json'));
  assert.doesNotThrow(() => git('check-ignore', '-q', 'local/runtime/state.json'));
});

test('no state.json persistence database is tracked', () => {
  const trackedFiles = git('ls-files');
  const trackedStateFiles = trackedFiles.split('\n').filter((path) => path === 'state.json' || path.endsWith('/state.json'));
  assert.deepEqual(trackedStateFiles, []);
});
