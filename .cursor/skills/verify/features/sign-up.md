# Create an account

Create account lets a new owner register with email and password, land on Home, and see that same user from `/api/me`.

## Sub-features

- `signup-open` shows the registration form.
- `signup-submit` creates the Better Auth user and organisation membership.
- `signup-home` shows Home for that session.
- `signup-me` returns the same email with role `owner`.

## How to get to it (user POV)

- Open `/signup`.
- On `/login`, follow `Sign up for free`.

## Driving it with the browser

Preconditions:

- Doctor passes for this run's API and Vite.
- The SQLite file has no user with the email you will type.
- `control` tooling is the browser plus `curl`. There is no `control-ledgercraft` binary.

- **Open the form.** Go to `http://127.0.0.1:8080/signup`. The heading reads `Create your account`. Fields are named `Full name`, `Email address`, and `Password`.
- **Fill the form.** Use a disposable address such as `verify-$RUN_ID@example.com`, name `Verify Owner`, and a password of at least 8 characters that contains an uppercase letter, a lowercase letter, and a digit (example shape `Verify-pass1`). Check the box in the label that begins `I agree to the`.
- **Submit.** Choose `Create account`. The button stays disabled until those fields validate. Screenshot the filled form before the click.
- **Land on Home.** The app routes through `/onboarding` and `ProtectedRoute` replaces it with `/` because signup marks onboarding complete. The heading reads `Home`. A link named `Create your first invoice` is present when the organisation has no invoices. Screenshot this screen.
- **Confirm the session.** From this browser, `GET /api/me` returns 200. `user.email` is the address you typed, `user.name` is `Verify Owner`, and `membership.role` is `owner`.
- **Confirm the row.** Read the disposable SQLite file and find that email in `users`. The Home heading alone is not persistence proof.

## Gotchas

- `Create account` ignores clicks while disabled. The terms checkbox is required. Its accessible name is `I agree to the Terms of Service and Privacy Policy`.
- A service-worker dialog named `Update available` can cover the form. Dismiss `Dismiss update prompt` before the screenshot and the submit. It can return after navigation.
- Google on this form returns `Google sign-in is not available yet. Use email and password.`
- Copying `.env.example` sets a Postgres `DATABASE_URL` and signup cannot open the database.
- Node 22 reaches `/api/healthz` and then throws `statement.setReturnArrays is not a function` on the first write.
- `/api/readyz` returns ok after `SELECT 1` even when migrations were not applied. Run `pnpm db:migrate` on this file first.
- Do not reuse an email. Better Auth rejects the duplicate. Pick a new address per run.
