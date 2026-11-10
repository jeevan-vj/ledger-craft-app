# Web app updates

A production build is identified by `public/version.json` (`hash` and `buildTime`). The same values are embedded in the JavaScript bundle. After a deploy, an open or returning browser should pick up that build without a manual hard refresh.

## When the page checks

The web app fetches `/version.json` with `cache: 'no-store'` and calls `registration.update()`:

- once on load
- when the window is focused or the tab becomes visible (those two events share a one-second debounce)
- about once a minute while the tab stays open
- when the browser restores the page from the back-forward cache

Development skips these checks. The service worker is registered with `updateViaCache: 'none'`, so the update request does not trust a cached `sw.js`. `public/_headers` keeps `/sw.js` at `no-cache`, `/version.json` at `no-store`, and content-hashed `/workbox-*.js` immutable.

## When the page reloads

The page reloads once when either of these is true:

- `version.json` has a different hash and a later `buildTime` than the running bundle
- a new service worker takes control of a page that already had a controller

The first claim, when the document was loaded from the network with no controller, does not reload.

Loop guards:

- `sessionStorage` key `ledgercraft:app-update-reload` stores the target hash. A document that is still the old build does not reload for that hash again.
- `ledgercraft:app-update-controller` stores the build hash that already reloaded for a service-worker claim. A later claim can reload after that build has changed.
- After a reload lands on the target hash, the version flag is cleared. A controller flag from an older build is cleared too.

Hiding the tab never reloads the page. Invoice, quote, and bill editor routes, and any mounted invoice or expense editor, do not reload on their own. Those screens show an update notice with a Reload button. On every other screen the pending update is applied on the next in-app navigation, which loads the new document. A failed `version.json` read does not reload.

## What the service worker caches

Workbox precaches hashed scripts and styles only. It does not precache `index.html`, and `navigateFallback` is off, so a navigation is not answered from the previous app shell. A client route that has not been cached no longer opens offline. Document navigations use the network (`cache: 'reload'`) and fall back to a short-lived cache only when the network fails. `/api/`, `/shared/`, and `/version.json` are network-only. Shared invoice and quote pages still load while online, and `public/_headers` still sends `no-store` and `Referrer-Policy: no-referrer` for those paths.
