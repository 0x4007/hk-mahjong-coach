# Accessibility

The semantic DOM controls are the source of truth for action. Every legal move is a labelled
button, every tile face has an English/compact-code accessible label, status updates use live
regions, and the replay timeline has both a range scrubber and keyboard-focusable event buttons.
The 3D canvas is optional presentation and never the only way to play.

Keyboard map:

- `Tab` / `Shift+Tab`: move through navigation, actions, hints, and replay controls.
- `Enter` / `Space`: activate a focused action or navigation control.
- `W A S D`: move in the first-person scene when the canvas has focus.
- `Esc`: release pointer lock.
- Arrow keys: adjust the replay range input.

The Profile screen persists high-contrast and reduced-motion preferences. Reduced motion is applied
to both CSS transitions/animations and the browser preference path. High contrast strengthens text,
surfaces, borders, and accent contrast; information is never conveyed by color alone. Verify with
`pnpm test:e2e`, keyboard-only Playwright interaction, a screen reader reading the action dock, and
a browser with WebGL disabled to confirm the semantic fallback remains usable.
