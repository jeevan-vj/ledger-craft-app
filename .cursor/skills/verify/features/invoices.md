# Invoices

Invoices shows the signed-in organisation's invoice list, or the empty start state when none exist.

## Sub-features

- `invoices-open` opens the list from Home or the sidebar.
- `invoices-empty` shows the first-run empty state.
- `invoices-create-entry` exposes the control that starts a draft.

## How to get to it (user POV)

- Choose `Invoices` in the sidebar.
- On Home, choose `Create your first invoice` or `New invoice` (both go to `/invoices/new`, not the list).
- Open `/invoices` while signed in.

## Driving it with the browser

Preconditions:

- `sign-up` in this same browser session has finished, or you have signed in at `/login` with an account that already exists in this SQLite file.
- Doctor still passes. Logged-out `/invoices` redirects to `/login` and is not the list.

- **Open the list.** Choose the sidebar link named `Invoices`, or go to `http://127.0.0.1:8080/invoices`. The heading reads `Invoices`.
- **Empty organisation.** With no invoices, the panel title is `Here's how to get started` and an action is named `Create invoice` (`data-testid="empty-create-invoice"`). Screenshot the heading and that action.
- **Create entry.** Choose `Create invoice`. The URL becomes `/invoices/new`. Screenshot the form. Do not claim an invoice was saved unless a later `GET` shows it in the list.
- **Existing rows.** When the list is non-empty, the header action is `New Invoice` and the table shows invoice numbers. This fresh database has no rows, so that state is not the default proof.

## Gotchas

- There is no seeded invoice. An empty state is the expected proof on a new SQLite file. Do not invent rows to make a populated table appear.
- Home's `Create your first invoice` skips the list. The list entry is the sidebar or `/invoices`.
- A loading line `Loading invoices...` means the request has not finished. Wait for the heading's empty state or the rows.
