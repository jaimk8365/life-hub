# Life Hub Finance — Money Map design system

## Product and job

Life Hub Finance is a private, encrypted, mobile-first household finance app. The Money Map must help an ADHD user understand where ordinary base income goes without reading a ledger. It is explanatory and read-only: it never moves money, edits balances or treats transfers as spending.

The redesigned section has one clearly labelled two-option toggle:

- **Simple map**: a calm, flat diagram that can be scanned in seconds.
- **Flow mode**: the same facts and hierarchy with subtle animated pulses travelling along connectors to show direction.

Both modes use identical data and totals. Overtime, redraw and internal transfers are not recurring household income. Money remaining in Everyday is described as available before daily spending, not safe-to-spend.

## Visual language

- Keep the existing joyful Finance palette: cream background, white cards, deep plum ink, lilac controls, turquoise connections, deep pink emphasis and small yellow highlights.
- Use system sans-serif for labels and figures. A high-contrast serif may be used only for the section title.
- Use rounded 14–18px cards, thin lavender borders and very soft shadows.
- Use meaningful familiar icons sparingly: income, home, bills, piggy bank, child savings and loans. Do not make the map childish.
- Keep labels short. Put secondary explanations behind an information control or beneath the map in one small note.
- Use dummy/example amounts only in design drafts.

## Simple map

- Start with one compact Household income card.
- Flow into Everyday as the main account.
- From Everyday, branch into Bills, Loan Repayments, personal spending, Sinking Funds and children’s savings.
- From Loan Repayments, show the individual loan destinations.
- From Sinking Funds, show named allocations as compact chips rather than full account cards.
- Show “Remains in Everyday” as a final outcome with groceries, fuel and general card spending beneath it.
- Internal account transfers belong in a separate compact panel below the main distribution map.

## Flow mode

- Keep the same accessible DOM order and wording as Simple map.
- Use CSS connector lines with small glowing dots or pulses that travel from source to destination.
- Differentiate main income flow, transfers and loan repayments by colour or line style, not by animation speed alone.
- Motion must be subtle, non-distracting and automatically disabled when `prefers-reduced-motion: reduce` is active.
- No canvas/WebGL requirement; it must remain reliable inside a static encrypted page and on iPhone.

## Interaction and accessibility

- Toggle controls must be at least 44px tall, keyboard-operable and expose pressed/selected state.
- Persist the selected view locally and sync it only through the existing encrypted Finance settings.
- Cards remain tappable only where they already have a real destination or detail action.
- Never rely on colour alone. Every connection includes a text amount/frequency.
- Mobile must not require horizontal scrolling. On narrow screens, branches become a vertical stepped flow.
- Use `prefers-reduced-motion` and keep static content fully usable when animations are disabled.

## Privacy boundary

Never place account numbers, real balances, real income, real transfer amounts, names tied to financial figures, passcodes, tokens or other personal financial data in public source, design prompts or design artifacts. Production values remain in the ignored private source and are emitted only into the encrypted deployed page.
