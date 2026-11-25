import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const cwd = resolve(import.meta.dirname, '..');

test('the packed Astro adapter contains its exports, client module and license', () => {
  const [artifact] = Object.values(JSON.parse(execFileSync('npm', ['pack', '--json', '--dry-run', '--ignore-scripts'], { cwd, encoding: 'utf8' })));
  const files = artifact.files.map(file => file.path).sort();
  assert.deepEqual(files, [
    'LICENSE',
    'README.md',
    'package.json',
    'src/MessagingFormShell.astro',
    'src/MessagingIdentityFields.astro',
    'src/messaging.css',
    'src/mount.mjs',
  ]);
  const manifest = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  for (const target of Object.values(manifest.exports)) assert.ok(files.includes(target.slice(2)));
  execFileSync(process.execPath, ['--check', 'src/mount.mjs'], { cwd });
});
