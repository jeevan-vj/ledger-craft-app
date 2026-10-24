# Web error monitoring

The Vite app reports browser errors to Sentry when `VITE_SENTRY_DSN` is present at build time. With no DSN, the SDK is left out of the production bundle. Local development, unit tests, and CI stay quiet until the project exists.

The SDK is a separate chunk. It loads after the first paint, and it is not module-preloaded, so it is not part of the first JavaScript download. Errors and the signed-in user id that happen before it loads are queued and sent when it starts. The error screen can appear before a Sentry event id exists; Reload still works.

Session Replay, Feedback, and performance tracing are off. That keeps the added download near 30 kB gzip instead of about 65 kB on the main chunk. Route crashes still use the React Router `errorElement` and the same fallback screen. `@sentry/react` 11 uses `dataCollection` instead of `sendDefaultPii`; the app turns off automatic user details, cookies, HTTP headers, request and response bodies, and stack-frame variables. The signed-in user is stored by id only. A `beforeSend` / `beforeBreadcrumb` scrubber also removes form-input values and replaces share tokens in `/shared/invoice/:token`, `/shared/quote/:token`, `/api/public/quotes/:token`, and `/api/public/invoices/:token` URLs with `[redacted]`.

API failures keep the Hono envelope's `requestId` on the thrown error. When that error is reported, Sentry stores it as the `requestId` tag so the browser event can be matched to the API log.

## GitHub settings

Create a Sentry project for the browser app. The project slug is `ledgercraft-web`. Platform: React.

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | Repository variable | Public DSN inlined by Vite. Empty means the SDK is omitted from the build. |
| `SENTRY_ORG` | Repository variable | Sentry organization slug. Required only when uploading source maps. |
| `SENTRY_PROJECT` | Repository variable, optional | Defaults to `ledgercraft-web`. |
| `SENTRY_AUTH_TOKEN` | Production environment secret | Auth token used to upload source maps. Not a Vite variable. |

The token needs release and source-map upload access for that project (`project:releases` and `org:read`). Do not put the token in `VITE_` variables or in the Pages bundle.

`VITE_SENTRY_DSN` is read while `pnpm build` runs in `.github/workflows/release.yml`. Changing the variable does not affect a site that is already deployed. Publish again after saving it.

The release name is the git SHA (`github.sha`). The same value is passed to the browser as `VITE_SENTRY_RELEASE` and to `sentry-cli` as `SENTRY_RELEASE`. `VITE_APP_VERSION` and `VITE_BUILD_HASH` are sent as tags. A local build with no SHA uses the build hash as the release name.

## Source maps

Production builds emit hidden source maps (`build.sourcemap: 'hidden'`). Browsers are not told to download them. After `pnpm build`, the release workflow:

1. Uploads the maps when `SENTRY_AUTH_TOKEN` is set. The step prints a skip message and exits successfully when the token is absent.
2. Deletes every `dist/**/*.map` file.
3. Deploys the remaining `dist` to Cloudflare Pages.

Workbox ignores `**/*.map`, and the build check rejects a service worker that precaches a `.map` URL. `pnpm deploy:cloudflare` uses the same upload-then-delete order before `wrangler pages deploy`.

## How to verify

1. Save the repository variable, organization slug, and production token described above.
2. Open a pull request and confirm the web typecheck, lint, unit tests, and build jobs pass. The source-map upload does not run on pull requests.
3. Merge to `main`. In the Release workflow, the upload step either prints `Uploaded ... web source maps for release <git sha>` or `SENTRY_AUTH_TOKEN is not set; skipping web source map upload.` The "Verify published build" step still checks `version.json`, the login page, and `/api/me` returning 401.
4. Confirm a map is not public. Take an asset name from the published `index.html` and request it with `.map` added. The response is 404.
5. In Sentry, open the release named with that commit SHA and confirm the uploaded files are present.
6. To send one event, put the DSN in `.env.local`, run `pnpm dev`, and temporarily throw `new Error('Sentry web test')` from a rendered component. The app should show the "Something went wrong" screen with a Reload button. The Sentry issue should have that release, your user id and no email, and no form values or share token. Remove the throw before committing.
7. For an API link, cause a server error and let it reach the error screen. The event tag `requestId` should match the id in the API log.
