---
name: ledgercraft-knowledge-sync
description: Keeps LedgerCraft TARGET_ARCHITECTURE.md, AGENTS.md, and project skills/rules current after each reconstruction wave. Use at the end of a wave, after a schema or API cutover, or when an agent discovers drift between code and docs.
---

# Knowledge sync

A wave is not done when tests pass if the docs still describe the lost Supabase world or a future that is not true yet.

## When to run

- End of every wave (W0–W9)
- After a domain loses its last `supabase.from`
- After adding/renaming a skill or rule
- When implementation contradicts `TARGET_ARCHITECTURE.md`

## Update map

| Artifact | What to change |
| --- | --- |
| `TARGET_ARCHITECTURE.md` | Current reconstruction status: what exists, what is still Lane A, next gate. Do not silently rewrite the end-state spec. |
| `AGENTS.md` | File map, commands, stack that is actually true, agent roster pointers |
| `.cursor/skills/ledgercraft-bootstrap/SKILL.md` | Current wave, next command, ports — keep in lockstep with TARGET status |
| `.cursor/skills/*/SKILL.md` | Procedures that drifted; add a skill if the same prompt was pasted twice |
| `.cursor/rules/*.mdc` | Only durable constraints (keep short) |
| Reconstruction canvas | Wave todo status if the operating plan changed |

## Status language

Write present tense facts:

- "Hosted public schema is empty"
- "Customers read via Hono"
- "Web invoices still use supabase-js"

Do not write "will" as if it already shipped.

## Skill maintenance

- Keep each `SKILL.md` under 500 lines
- Descriptions: third person, WHAT + WHEN, trigger terms
- Verification before a pull request stays in `ledgercraft-verify`. Do not add a second verify-pr skill.
- If a skill is wrong, patch it in the same PR as the code that proved it wrong
- Delete skills that describe abandoned procedures

## Close-out checklist

- [ ] Current status in `TARGET_ARCHITECTURE.md` matches git
- [ ] `AGENTS.md` commands still run
- [ ] New repeating workflow has a skill or an explicit decision not to
- [ ] No second architecture spec file was added
