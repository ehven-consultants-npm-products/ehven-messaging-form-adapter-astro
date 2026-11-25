import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const core = process.env.MESSAGING_CORE_PATH ?? resolve(root, '../ehven-messaging-form-core');
const fixture = await mkdtemp(join(tmpdir(), 'messaging-astro-'));
const run = (cwd, args) => execFileSync('npm', args, {
  cwd, encoding: 'utf8', timeout: 150_000,
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
});
const pack = directory => {
  const [artifact] = Object.values(JSON.parse(run(directory, ['pack', '--json', '--ignore-scripts', '--pack-destination', fixture])));
  return join(fixture, artifact.filename);
};

try {
  await mkdir(join(fixture, 'src/pages'), { recursive: true });
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'messaging-astro-consumer', private: true }));
  run(fixture, ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'astro@7.3.8', 'jsdom@29.1.1', pack(core), pack(root)]);
  await writeFile(join(fixture, 'src/pages/index.astro'), `---
import Shell from '@ehven/messaging-form-adapter-astro/shell';
import Identity from '@ehven/messaging-form-adapter-astro/identity-fields';
---
<html lang="en"><head><title>Messaging form fixture</title></head><body>
  <Shell source="one" endpoint="/api/contact" variant="contact" noun="message" turnstileSiteKey="fixture-key" formAttributes={{ id: 'one' }} privacyUrl="/privacy/">
    <Identity variant="contact" />
    <textarea name="message" aria-label="Message"></textarea>
  </Shell>
  <Shell source="two" endpoint="/api/request" variant="request" turnstileSiteKey="fixture-key" formAttributes={{ id: 'two' }}>
    <Identity variant="request" />
  </Shell>
  <Shell source="three" endpoint="/api/disabled" disabled turnstileSiteKey="fixture-key" formAttributes={{ id: 'off' }} />
  <Shell source="four" endpoint="/api/missing-key" turnstileSiteKey="" formAttributes={{ id: 'missing-key' }} />
</body></html>`);
  run(fixture, ['exec', '--offline', '--', 'astro', 'build']);
  const html = await readFile(join(fixture, 'dist/index.html'), 'utf8');
  const { JSDOM } = await import(pathToFileURL(join(fixture, 'node_modules/jsdom/lib/api.js')));
  const { window } = new JSDOM(html, { url: 'https://fixture.example/' });
  const { document } = window;
  const one = document.getElementById('one');
  const two = document.getElementById('two');
  const off = document.getElementById('off');
  const missingKey = document.getElementById('missing-key');
  const submit = form => form.querySelector('button');
  const status = form => form.querySelector('[data-form-status]');
  assert.equal(one.method, 'post');
  assert.equal(one.getAttribute('action'), '/api/contact');
  assert.equal(one.elements.source.value, 'one');
  assert.equal(one.elements.email.maxLength, 254);
  assert.equal(one.elements.email_confirmation.required, true);
  assert.equal(one.querySelector('[data-form-privacy] a').getAttribute('href'), '/privacy/');
  assert.equal(off.querySelector('[data-messaging-turnstile]'), null);
  assert.equal(missingKey.querySelector('[data-messaging-turnstile]'), null);
  const modules = [...document.querySelectorAll('script[type="module"]')];
  assert.equal(modules.length, 1, 'Astro should include one shared browser script for all forms.');
  const bundled = modules[0].getAttribute('src');
  const code = bundled ? await readFile(join(fixture, 'dist', bundled), 'utf8') : modules[0].textContent;
  assert.match(code, /challenges\.cloudflare\.com/);

  const widgets = new Map();
  const resets = [];
  const removes = [];
  const requests = [];
  Object.assign(globalThis, { window, document, AbortController: window.AbortController });
  window.turnstile = {
    ready(callback) { callback(); },
    render(element, options) {
      const id = element.closest('form').id;
      const tokenInput = document.createElement('input');
      tokenInput.type = 'hidden';
      tokenInput.name = 'cf-turnstile-response';
      element.append(tokenInput);
      widgets.set(id, { ...options, callback(token) {
        tokenInput.value = token;
        options.callback(token);
      } });
      return id;
    },
    reset(id) {
      resets.push(id);
      document.getElementById(id).elements['cf-turnstile-response'].value = '';
    },
    remove(id) { removes.push(id); },
  };
  window.fetch = async (url, init) => {
    requests.push({ url, source: init.body.get('source'), token: init.body.get('cf-turnstile-response') });
    return Response.json({ ok: true, outcome: 'accepted' }, { status: 202 });
  };
  const bundlePath = join(fixture, 'browser-bundle.mjs');
  await writeFile(bundlePath, code);
  await import(pathToFileURL(bundlePath));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...widgets.keys()], ['one', 'two']);
  assert.equal(widgets.get('one').action, 'contact');
  assert.ok([one, two, off, missingKey].every(form => submit(form).disabled));
  const submitEvent = () => new window.Event('submit', { bubbles: true, cancelable: true });
  assert.equal(one.dispatchEvent(submitEvent()), false);
  assert.deepEqual(requests, []);
  widgets.get('one').callback('fixture');
  widgets.get('two').callback('fixture');
  assert.equal(submit(one).disabled, false);
  assert.equal(submit(two).disabled, false);
  for (const field of ['first_name', 'last_name']) one.elements[field].value = 'Fixture';
  for (const field of ['email', 'email_confirmation']) one.elements[field].value = 'fixture@example.org';
  assert.equal(one.dispatchEvent(submitEvent()), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{ url: 'https://fixture.example/api/contact', source: 'one', token: 'fixture' }]);
  assert.equal(status(one).dataset.kind, 'success');
  assert.equal(status(one).textContent, 'Thank you. Your message has been sent.');
  assert.deepEqual(resets, ['one']);
  assert.equal(submit(one).disabled, true);
  assert.equal(submit(two).disabled, false);
  widgets.get('one')['error-callback']();
  assert.equal(status(one).dataset.kind, 'success');
  assert.equal(one.querySelector('[data-form-status-verification]').hidden, false);
  widgets.get('one').callback('fixture');
  assert.equal(one.querySelector('[data-form-status-verification]').hidden, true);
  widgets.get('two')['expired-callback']();
  assert.equal(submit(two).disabled, true);
  one.remove();
  document.dispatchEvent(new window.Event('astro:page-load'));
  assert.deepEqual(removes, ['one']);
  window.close();
  console.log('PASS: installed Astro build, form markup, compiled browser submission and per-form widget lifecycle.');
} finally {
  await rm(fixture, { recursive: true, force: true });
}
