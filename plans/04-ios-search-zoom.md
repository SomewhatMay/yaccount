# Plan: prevent iOS PWA search auto-zoom

## Reported behavior

Opening Search sometimes zooms the installed iOS PWA into its search field. Safari tab mode is untested.

## Code findings

- `CommandPalette` opens a `CommandDialog` and explicitly focuses its `CommandInput` on phones using `focus({ preventScroll: true })` plus `autoFocus`.
- `src/components/ui/command.tsx` styles the actual `CommandPrimitive.Input` with Tailwind `text-sm`, which computes to 14px.
- iOS WebKit may magnify a focused form control whose text is below 16px. `preventScroll` prevents scroll movement, not focus magnification.
- The viewport metadata in `src/app/layout.tsx` correctly keeps `initialScale: 1`, `viewportFit: cover`, and keyboard resize metadata. Disabling user scaling would harm accessibility and is not needed.
- Existing `ios-interactions.test.ts` and search Playwright cases verify focus and visual-viewport geometry, but never verify input font size or page scale.

## Implementation direction

- Make only the command search input 16px on phone (`text-base`) and retain the compact 14px size from `sm` upward (`sm:text-sm`).
- Do not add `maximum-scale`, `user-scalable=no`, blur/refocus tricks, or global input sizing.
- Keep synchronous focus, Visual Viewport handling, dialog dimensions, and result typography unchanged.

## TDD sequence

1. Add/extend `ios-interactions.test.ts` before implementation to require the responsive `text-base sm:text-sm` search-input contract and reject zoom-disabling viewport metadata.
2. Extend the mobile search Playwright case before implementation to assert computed input font size is at least 16px. On desktop, assert the breakpoint can retain 14px.
3. Run focused Vitest/Playwright; confirm mobile computed size fails at 14px.
4. Change only `CommandInput` responsive font utilities.
5. Run focused tests until green.

## Validation

- `npm test -- src/features/ui/ios-interactions.test.ts`
- Mobile and desktop search Playwright cases.
- Repeated synthetic keyboard viewport test remains green.
- Full `npm test` after the fix and full Playwright at final integration.
- Manual installed-iPhone PWA check: record `visualViewport.scale`, open/close Search repeatedly from multiple screens, type, clear, dismiss keyboard, and confirm scale remains 1 with no enlarged page.

## Acceptance criteria

- Search input computes to at least 16px below `sm`.
- Desktop search retains current compact appearance.
- No restrictive viewport scaling metadata is added.
- Search still focuses immediately and keyboard/dialog geometry tests pass.
- Repeated PWA Search openings do not zoom the page.

## Risks and mitigations

- Playwright Chromium does not reproduce WebKit focus zoom: assert the causal CSS invariant and retain device validation.
- A global form-control rule could disturb dense sheets: scope change to `CommandInput` only.
- Larger text may crowd the placeholder: field is full-width/truncates naturally; verify 390px viewport.

## Unresolved questions

None.
