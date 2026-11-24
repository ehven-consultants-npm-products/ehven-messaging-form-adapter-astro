import { enhanceMessagingForm } from '@ehven/messaging-form-core/browser';

const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const forms = new Map();
let loader;

function loadTurnstile() {
  loader ??= new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Turnstile took too long to initialize.')), 15_000);
    function ready() {
      const api = window.turnstile;
      if (typeof api?.ready !== 'function') {
        failed();
        return;
      }
      api.ready(() => {
        clearTimeout(timeout);
        resolve(api);
      });
    }
    function failed() {
      clearTimeout(timeout);
      reject(new Error('Turnstile could not load.'));
    }
    if (window.turnstile) {
      ready();
      return;
    }
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', failed, { once: true });
    document.head.append(script);
  });
  return loader;
}

function mount(form) {
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-form-status-verification]');
  const widget = form.querySelector('[data-messaging-turnstile]');
  if (!button || !status || !widget) return;

  const events = new AbortController();
  const noun = form.dataset.noun || 'submission';
  let controller, api, widgetId;
  let verified = false;

  function setVerified(value) {
    if (events.signal.aborted) return;
    verified = value;
    button.disabled = !verified || Boolean(controller?.pending);
    if (verified) status.hidden = true;
  }

  function showUnavailable() {
    setVerified(false);
    status.textContent = 'Verification is temporarily unavailable. Reload the page to try again.';
    status.hidden = false;
  }

  form.addEventListener('submit', event => {
    if (!verified || controller?.pending) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true, signal: events.signal });

  forms.set(form, () => {
    events.abort();
    controller?.destroy();
    if (widgetId) {
      try { api.remove(widgetId); } catch { /* The widget container may already be gone. */ }
    }
  });

  void loadTurnstile().then(turnstile => {
    if (events.signal.aborted || !form.isConnected) return;
    api = turnstile;
    controller = enhanceMessagingForm(form, {
      messages: {
        working: `Sending your ${noun}…`,
        accepted: `Thank you. Your ${noun} has been sent.`,
      },
      verification: {
        reset() {
          verified = false;
          queueMicrotask(() => {
            if (events.signal.aborted) return;
            setVerified(false);
            try { api.reset(widgetId); } catch { showUnavailable(); }
          });
        },
      },
    });
    widgetId = api.render(widget, {
      sitekey: widget.dataset.sitekey,
      action: widget.dataset.action,
      theme: 'auto',
      callback: () => setVerified(true),
      'expired-callback': () => setVerified(false),
      'timeout-callback': () => setVerified(false),
      'error-callback': () => { showUnavailable(); return true; },
      'unsupported-callback': showUnavailable,
    });
    if (!widgetId) throw new Error('Turnstile did not render.');
  }).catch(() => {
    if (!events.signal.aborted) showUnavailable();
  });
}

function refreshForms() {
  for (const [form, destroy] of forms) {
    if (!form.isConnected) {
      destroy();
      forms.delete(form);
    }
  }
  for (const form of document.querySelectorAll('form[data-messaging-astro]')) {
    if (!forms.has(form) && !form.hasAttribute('data-messaging-unavailable')) mount(form);
  }
}

refreshForms();
document.addEventListener('astro:page-load', refreshForms);
