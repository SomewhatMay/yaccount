# Plan 3 — move theme controls to Settings

## Feedback

> Light/dark theme should move to settings.

## Confirmed current state

- `src/features/shell/ThemeToggle.tsx` is a binary resolved-theme toggle. It writes explicit
  `light` or `dark` through `next-themes`.
- `TopBar.tsx` renders that toggle at all widths. `MoreSheet.tsx` renders it again in its footer.
- `CommandPalette.tsx` adds a third theme entry (`act:theme`) and directly imports `useTheme`.
  Thus appearance currently has three non-settings entry points.
- `src/app/layout.tsx` configures `defaultTheme="system"` with `enableSystem`; the present binary
  toggle offers no way back to System after the first click.
- `src/features/settings/SettingsView.tsx` currently contains Data and Diagnostics only. Its own
  comment says appearance will move there when built.
- `src/components/ui/toggle-group.tsx` already provides an accessible Radix single-choice control;
  no dependency or new primitive is required.

## Intended behavior

- Settings gains an Appearance section before Data and Diagnostics.
- Theme is a single-choice setting with System, Light, and Dark. System is included because it is
  the configured default and must remain recoverable.
- Use `next-themes` storage as today. Theme is device/browser appearance, not financial/account
  data; do not add a synced `Setting` or op.
- Remove theme controls from TopBar, More, and the command palette. Settings is the only visible
  theme-changing surface.
- Keep provider configuration and semantic CSS tokens unchanged.

## UI shape

- Create `src/features/settings/AppearancePanel.tsx`.
- Follow existing Settings section language: small section heading, one-line explanation, bordered
  card/row, and a `ToggleGroup type="single"` with System/Light/Dark.
- Icons may aid scanning but labels remain visible. The setting must not be icon-only.
- Guard empty Radix `onValueChange` values so clicking the selected option cannot unset theme.
- Use `theme ?? "system"`, not `resolvedTheme`, because the control selects the stored policy,
  including System.

## TDD cycles

### Cycle 1 — Appearance behavior

1. RED: add `src/features/settings/AppearancePanel.test.tsx`. Mock `useTheme`, call the component,
   locate the `ToggleGroup`, and assert `type="single"`, current `value`, and all three labelled
   items.
2. Invoke `onValueChange("dark")`; assert `setTheme("dark")`. Invoke with an empty value; assert no
   additional call.
3. Run the test. Expected failure: module absent.
4. GREEN: implement the minimum panel.
5. Run `npm test`.

### Cycle 2 — Settings-only ownership

1. RED: add source assertions to the same test: `SettingsView.tsx` imports/renders
   `AppearancePanel`; `TopBar.tsx`, `MoreSheet.tsx`, and `CommandPalette.tsx` neither import
   `ThemeToggle` nor call `useTheme`; `act:theme` is absent.
2. Run the test. Expected failures: Settings has no panel and all three old surfaces still change
   theme.
3. GREEN: mount the panel in Settings, remove old controls/imports/action, and delete obsolete
   `ThemeToggle.tsx`.
4. Run `npm test`.

## Playwright

- Open Settings; assert System, Light, Dark controls are visible.
- Select Dark; assert `<html>` gains `dark`. Select Light; assert it loses `dark`.
- Reload Settings; assert selection persists through `next-themes` local storage.
- At mobile width, open More and assert no light/dark switch is present. At all widths, assert no
  topbar theme switch.

## Documentation

- Update `SettingsView.tsx` comment and heading copy to include appearance.
- Add the Settings-only theme rule to spec §9.4 or §9.8.
- No model/export documentation change: storage remains owned by `next-themes`.

## Acceptance

- Settings is the only theme-changing UI.
- System/Light/Dark are explicit and keyboard operable.
- Theme persists exactly as before.
- Topbar and More lose appearance clutter.
- Command search no longer returns a theme action.

## Commit

- Minimum one commit: `Move theme to settings`

## Unresolved questions

- None.
