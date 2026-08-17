# Persistence

## localStorage is infrastructure, not architecture

The app persists to `localStorage` today. That is an implementation detail
living behind `lib/storage.ts`, which exposes four functions:

```ts
loadFamilyState()   // → { family, positions }, always usable
saveFamilyState({ family, positions })
clearFamilyState()
freshSeedState()    // → an independent copy of the seed family
```

`window` is touched nowhere else in the codebase. No domain module imports this
one: `family-operations.ts` is pure and knows nothing about storage, so its
tests need no browser. Swapping in a real backend means rewriting this module
and its callers' `async` handling — nothing else.

## One key, one versioned payload

```
family-tree:state → { version: 1, family: FamilyTreeData, positions: PositionOverrides }
```

Family data and positions share a payload deliberately. With separate keys, a
position save and a family save are two independent writes, and the obvious
implementation of either — read, modify, write — can clobber the other. One
payload with a single writer removes that class of bug rather than documenting
it.

The version lives *inside* the payload, under a stable key. Putting it in the
key name instead would make an unsupported version indistinguishable from no
data at all; keeping it inside means an unknown version is something we read
and reject on purpose.

There is no migration framework, and shouldn't be one until a second version
exists. An unsupported version falls back to seed data.

## Validation is asymmetric, on purpose

Stored JSON is untrusted — hand-edited, half-written, or left by an older
build — so nothing parsed is assumed to match its TypeScript type.

**Genealogy is all-or-nothing.** If any person or union fails its structural
check, or two records share an id, the whole family is rejected and the seed is
used. Salvaging the readable half would produce a document that looks fine but
has quietly lost people, which is worse than visibly starting over.

**Positions are filtered entry by entry.** They are cosmetic and mutually
independent, so one corrupt override costs that node's placement and nothing
more. A bad position must never cost the family document beside it.

Only structure is checked here. Domain rules — no ancestry cycles, one parental
union per person, no duplicate partner unions — belong to `family-operations.ts`
and are enforced when data is edited, not when it is read.

## Pre-release keys

Two keys predate the versioned payload: `family-tree:data:v1` (a bare
`FamilyTreeData`) and `family-tree:positions:v1` (a bare `PositionOverrides`).

They are migrated on load rather than ignored: whatever is readable is folded
into the current payload, the old keys are deleted, and anything malformed
falls back as usual. The cost is about fifteen lines and it preserves manual
layout work that people have already done. Migration runs only when no current
payload exists, so a current payload always wins.

This is the one migration we carry. Once released, schema changes go through
the `version` field instead.

## Seed isolation

`seedData` is an imported module constant. Handing it to the app directly would
let edits mutate it in place, leaking one session's changes into every later
fallback load within the same page. `freshSeedState()` returns a
`structuredClone`, so each fallback is independent and safe to edit.
