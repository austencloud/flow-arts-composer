# If You're Reading This

This is a letter to whoever finds this project and needs to understand it. Maybe the domain lapsed. Maybe you scanned a QR code on a playing card and ended up at a dead link. Maybe you're managing Austen's digital estate. Whatever brought you here, this document tells you how it all works and how to keep it running.

## What This Is

TKA (The Kinetic Alphabet) is a notation system for flow arts. Flow arts means spinning props with your hands: staves, fans, clubs. TKA maps every possible movement to a letter, so you can write down choreography the same way you write down words. The software in this repo renders those sequences as animated pictographs. Physical playing cards were printed with QR codes on them. Each QR code links to an animated viewer showing that card's sequence. If you're here because you scanned one of those cards, that's what was supposed to happen.

## How the QR Codes Work

There are two types of QR codes on the cards.

**Short codes** look like `tkaflowarts.com/q/A1F8`. The characters after `/q/` are a lookup key. When someone scans this code, the app queries a Firebase database (Firestore collection: `shortcodes`) to find the sequence data, then renders it. These codes are short and scan easily, but they need the server to work. QR codes on printed cards encode `TKA.RUN/{code}` — a Cloudflare Worker redirects to the `/q/` route.

**Inline codes** look like `tkaflowarts.com/q/s~z:...` where everything after `s~` is the sequence data itself, compressed. These are self-contained. No server call, no database lookup. The `s~` prefix tells the app to decode the data directly from the URL. These codes are longer (bigger QR pattern) but they survive infrastructure failures. If the server is gone, these still work with just the decoder.

The project previously used `thekineticalphabet.com` as its primary domain. That domain is still owned and redirects to `tkaflowarts.com`, so any URL with the old host resolves correctly. If you see the old domain in a screenshot or a blog post, follow it — the redirect does the right thing.

## What Keeps It Running

Three things:

1. **Domain names:** `tkaflowarts.com` (primary) and `thekineticalphabet.com` (legacy, redirects to primary). Registered through a standard registrar. If the primary lapses, every QR code on every printed card stops working. If the legacy lapses, any historical URL in the wild breaks. Annual renewal, usually around $12/year each.

2. **Firebase project:** `the-kinetic-alphabet`. This is the backend. Firestore holds user accounts, saved sequences, and the `shortcodes` collection that maps short QR codes to sequence data. The Spark (free) plan covers modest traffic. If usage grows, the Blaze (pay-as-you-go) plan kicks in. If the Firebase project is deleted or the billing account closes, short code QR lookups fail.

3. **Cloudflare:** Hosts the built frontend. The site is a static SvelteKit app deployed to Cloudflare Pages. Free tier. If this stops, the site goes down, but the data in Firebase is fine.

## If Firebase Dies

The short code QR codes (`/p/Abc123`) will stop resolving. The inline codes (`/p/s~...`) will still work if you have the decoder and a web server.

To recover the short codes, you need the Firestore `shortcodes` collection data. Each document's ID is the six-character code. Each document contains a `sequence` field (the word), and often `sequenceId` and `ownerId` fields pointing to the full sequence in `users/{ownerId}/sequences/{sequenceId}`.

If you have Firestore export data or JSON backups, you can rebuild the lookup in any database. The resolution logic is in `src/lib/shared/qr/services/implementations/ShortCodeManager.ts`, method `resolveShortCode`. It tries four strategies in order: public index lookup, sequenceId-as-word lookup, direct Firestore path, and embedded sequence data. Any replacement only needs to implement the first strategy (look up the code, return the sequence).

## If the Domain Dies

Every QR code on every printed card hardcodes a domain — `tkaflowarts.com` for current cards, `thekineticalphabet.com` for anything printed before the rebrand. If either expires and someone else registers it, those codes point to whatever the new owner puts there.

Options:
- **Renew the domains.** This is the simplest fix. Transfer to whoever is maintaining this.
- **Redirect from a new domain.** Buy a new domain, deploy the app there, and set up redirects. The app itself doesn't care what domain it runs on.
- **Inline codes still work.** If you have the decoder (next section) and the URL from the QR code, you can extract the `s~...` portion and decode it locally. The domain is just the delivery mechanism for inline codes.

## The Decoder

One file can decode any inline QR code:

```
src/lib/shared/navigation/services/implementations/SequenceEncoder.ts
```

This file contains the complete encode/decode logic. The key methods:
- `isInlineEncoded(code)` checks if a code starts with `s~`
- `decodeFromQR(encoded)` strips the `s~` prefix, decompresses with LZString, and parses the sequence data
- `decode(encoded)` parses the raw format: `startPlacement|step1|step2|...` where each step encodes two hand motions (blue and red) as compact character strings

The compression uses `lz-string` (npm package), specifically `compressToEncodedURIComponent` / `decompressFromEncodedURIComponent`. This is a well-documented, stable algorithm. If the npm package disappears, the LZString algorithm is simple enough to reimplement from its spec.

A future developer who wants to build a minimal viewer needs:
1. This encoder file (or a port of its decode logic)
2. The `lz-string` library (or equivalent)
3. A basic web page that reads the URL, calls decode, and renders the sequence data

The sequence data itself is an array of steps. Each step has two motions (one per hand), each with: start location, end location, start orientation, end orientation, rotation direction, number of turns, motion type, and prop type. All encoded as single characters with lookup tables defined at the top of the file.

## How to Keep It Alive

Checklist:

- [ ] Renew `tkaflowarts.com` and `thekineticalphabet.com` annually (legacy domain redirects to primary)
- [ ] Keep the Firebase project `the-kinetic-alphabet` active (check billing, don't let it get deleted for inactivity)
- [ ] Keep this GitHub repo public so the decoder is always accessible
- [ ] If migrating away from Firebase, export the `shortcodes` collection and the `users/*/sequences/*` subcollections
- [ ] If migrating away from Cloudflare, `npm run build` produces a static site that runs anywhere

The inline QR codes are the most durable thing here. They carry their own data. As long as someone can find `SequenceEncoder.ts` in this repo, those codes can be decoded forever, with or without a running server.

## Contact

Austen Cloud
austencloud@gmail.com
The Kinetic Alphabet
https://tkaflowarts.com
