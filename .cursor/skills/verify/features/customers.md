# Customers

Customers shows the signed-in organisation's customer list, or the empty start state when none exist.

## Sub-features

- `customers-open` opens the list from the sidebar.
- `customers-empty` shows the first-run empty state.
- `customers-add-entry` exposes the control that starts a customer.

## How to get to it (user POV)

- Choose `Customers` in the sidebar.
- Open `/customers` while signed in.

## Driving it with the browser

Preconditions:

- `sign-up` in this same browser session has finished.
- Doctor still passes. Logged-out `/customers` redirects to `/login`.

- **Open the list.** Choose the sidebar link named `Customers`, or go to `http://127.0.0.1:8080/customers`. The heading reads `Customers`.
- **Empty organisation.** With no customers, the panel title is `Here's how to get started` and the description mentions people and businesses you invoice. The action is named `Add a customer`. Screenshot the heading and that action.
- **Add entry.** Choose `Add a customer`. A create form opens. Screenshot it. Do not claim a customer was saved unless the list shows the name after you close and reopen Customers.

## Gotchas

- There is no seeded customer. The empty state is the expected proof on a new SQLite file.
- The empty-state action has no `data-testid`. Use the accessible name `Add a customer`.
- The header button `New Customer` renders only after at least one customer exists.
