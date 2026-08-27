# iOS keyboard/Search research

Research date: 2026-08-27. Scope: current iOS Safari and installed Home Screen PWA
keyboard, focus, Visual Viewport, fixed dialogs, and safe areas.

## Hardware status

No real iOS hardware or simulator is attached to this workspace. Real-device reproduction and
approval are therefore unavailable. [Issue #44](https://github.com/SomewhatMay/yaccount/issues/44)
is the required Safari/PWA validation gate; automation in this branch is not a substitute.

## Current evidence

- WebKit supports the Visual Viewport API specifically for on-screen-keyboard-aware overlays.
  `height`, `offsetTop`, `resize`, and `scroll` are the intended inputs:
  [WebKit Safari 13](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).
- WebKit still has no `interactive-widget` implementation, so the existing viewport metadata is
  useful elsewhere but cannot be the iOS fix:
  [WebKit #259770](https://bugs.webkit.org/show_bug.cgi?id=259770),
  [CSS Viewport specification](https://drafts.csswg.org/css-device-adapt/#interactive-widget-section).
- Safari UI may publish the final viewport height only at the end of the keyboard animation:
  [WebKit #265578](https://bugs.webkit.org/show_bug.cgi?id=265578). Installed PWAs can publish
  resize before the new metrics are readable; sampling in `requestAnimationFrame` is the recorded
  workaround: [WebKit #254861](https://bugs.webkit.org/show_bug.cgi?id=254861).
- Standalone-PWA viewport height can become stale after keyboard/rotation cycles:
  [WebKit #218983](https://bugs.webkit.org/show_bug.cgi?id=218983). Safe-area bottom also remains
  nonzero while the keyboard is present:
  [WebKit #217754](https://bugs.webkit.org/show_bug.cgi?id=217754).
- Current iOS 26 reports include viewport pan after keyboard open/dismiss and unreliable offsets,
  especially in WKWebView. Whole-body compensation is described as fragile because it breaks
  fixed descendants: [WebKit #311821](https://bugs.webkit.org/show_bug.cgi?id=311821),
  [WebKit #300523](https://bugs.webkit.org/show_bug.cgi?id=300523).
- WebKit intentionally restricts software-keyboard activation for programmatic focus outside a
  user gesture: [WebKit #195884](https://bugs.webkit.org/show_bug.cgi?id=195884). HTML defines
  `autofocus` inside a shown dialog as the dialog focus target:
  [HTML Standard](https://html.spec.whatwg.org/multipage/interaction.html#the-autofocus-attribute).

## Implementation constraints

- Keep `interactiveWidget` as progressive metadata; never depend on it for iOS geometry.
- Sample both Visual Viewport `resize` and `scroll` after one animation frame; coalesce bursts.
- Anchor only the active sheet/dialog. Never translate `body`, freeze global scrolling, or assume
  `offsetTop` alone is correct.
- Size scroll regions from current visible height. Move focused long-sheet fields inside their own
  scrollport; do not call page-level `scrollTo`.
- Focus Search synchronously as its user-opened dialog appears; retain explicit HTML autofocus.
- Treat `env(safe-area-inset-*)` as physical cutout padding, not keyboard height.
- Fall back to ordinary responsive CSS when Visual Viewport is absent.

## Automated validation boundary

Tests may prove geometry, event coalescing, focus intent, inner scrolling, and repeated synthetic
cycles. They cannot prove keyboard appearance, Safari toolbar timing, installed-PWA restoration,
Dynamic Island behavior, or device-specific WebKit regressions. Those remain open in issue #44.
