# Ehven Messaging Form for Astro

Use the shell and identity fields in an Astro page with a same-origin endpoint that implements the messaging form contract.

## Install

```sh
npm install @ehven/messaging-form-core @ehven/messaging-form-adapter-astro
```

Requires Node.js 24 or later and an existing Astro project on Astro 7.3.8 or a later compatible 7.x release.

```astro
---
import MessagingFormShell from '@ehven/messaging-form-adapter-astro/shell';
import MessagingIdentityFields from '@ehven/messaging-form-adapter-astro/identity-fields';
---

<MessagingFormShell source="contact-page" endpoint="/api/contact" privacyUrl="/privacy/">
  <MessagingIdentityFields />
  <label>
    Message
    <textarea name="message" required></textarea>
  </label>
</MessagingFormShell>
```

- Set `PUBLIC_TURNSTILE_SITE_KEY` or pass `turnstileSiteKey` to the shell. Use `disabled` to keep the form offline. The browser needs JavaScript to complete Turnstile. Each available form requires its own valid challenge before submission.
- Validate Turnstile on the server and keep the secret there. The endpoint accepts form data and returns the messaging form JSON contract.
- Use the slot for additional fields. Set `variant` on both components to use matching classes. Use `privacyText` to supply your own disclosure.
- The theme uses CSS custom properties beginning with `--ehven-`. The shell imports its styles automatically.

Run `npm run check` to inspect the package or `npm run check:astro` to build a fixture from packed dependencies. Use `MESSAGING_CORE_PATH` to point the fixture at a checkout of messaging-form-core. The default is a sibling checkout.

MIT

## Support

Patch releases within 0.1 are intended to be compatible. Future 0.x minor releases may change APIs. Open an issue for bugs and usage questions. For a security concern, use the contact form to request a private reporting channel and keep credentials, tokens and submissions out of the public tracker. [Issues](https://github.com/ehven-consultants-npm-products/ehven-messaging-form-adapter-astro/issues) · [Contact](https://ehven.com/contact/)
