# TaoVideo DESIGN.md

Source: installed from `voltagent/awesome-design-md` as a project-level design brief. This app should use a Linear-inspired operational shell with selective Runway-inspired media treatment for video/storyboard previews.

## Visual Direction

TaoVideo is a production tool, not a marketing landing page. The UI should feel like a precise studio console: dark, dense, readable, and optimized for repeated work. The interface should expose status, inputs, media references, and review actions without decorative clutter.

Use the Linear-style dark surface ladder for the application chrome:
- `canvas`: `#010102`
- `surface-1`: `#0f1011`
- `surface-2`: `#141516`
- `surface-3`: `#18191a`
- `hairline`: `#23252a`
- `hairline-strong`: `#34343a`
- `ink`: `#f7f8f8`
- `ink-muted`: `#d0d6e0`
- `ink-subtle`: `#8a8f98`
- `accent`: `#5e6ad2`
- `accent-hover`: `#828fff`
- `success`: `#27a644`
- `warning`: `#f5b301`
- `danger`: `#ef4444`

For generated media, storyboard previews, and video outputs, borrow Runway's restraint: let actual images and video carry the visual richness. Do not add gradient blobs, decorative orbs, or loud color blocks behind functional UI.

## Typography

Use a single sans-serif stack:
`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Use mono only for IDs, paths, model keys, request logs, and code-like values:
`ui-monospace, "SF Mono", Menlo, Consolas, monospace`

Type scale:
- App title: 28px, 600, line-height 1.15
- Section title: 18px, 600, line-height 1.25
- Panel title: 15px, 600, line-height 1.3
- Body: 14px, 400, line-height 1.5
- Caption/meta: 12px, 400, line-height 1.4
- Button: 14px, 500, line-height 1.2

Letter spacing should be `0` except small uppercase labels, which may use `0.04em`.

## Layout

Prefer an app-shell layout:
- Left panel: source inputs, Flow connection, product/character references, output settings.
- Center or primary panel: pipeline progress, current stage, actionable controls.
- Right panel: script editor, storyboard review, final video preview.

Desktop should prioritize side-by-side scanning. Mobile collapses to a single column with major sections in this order: connection/status, product inputs, character/reference assets, generation settings, script/storyboard, output.

Spacing scale: 4, 8, 12, 16, 24, 32, 48.
Maximum content width can be wide, but panels should keep readable internal line lengths.

## Components

Buttons:
- Primary: accent background, white text, 8px radius, 8px 14px padding.
- Secondary: surface-1 background, hairline border, ink text.
- Ghost/icon: transparent or surface-1, hairline hover, 32-36px stable size.
- Destructive: use danger only for release/delete/reset actions.

Inputs:
- Background surface-1.
- 1px hairline border.
- 8px radius.
- 40-44px height for text/select controls.
- Focus ring uses accent, not a full glow.

Cards and panels:
- Cards are for functional modules only, not page decoration.
- Radius should be 8px or 12px.
- Use hairline borders instead of heavy shadows.
- Avoid cards inside cards. Nested groups should use dividers, bands, or compact rows.

Status:
- Extension connected: success.
- Waiting/running: warning.
- Error: danger.
- IDs and media handles should be mono and copy-friendly.

Media:
- Product, character, storyboard, and output previews should use real image/video surfaces.
- Media frames use 8px radius, black background, and subtle hairline border.
- Do not crop product/reference images when accuracy matters; use `object-fit: contain`.

## Interaction Rules

Flow extension state must be visible near Flow-dependent actions. If a user selects product or character assets while Flow is enabled, show whether the asset has been uploaded to Flow and expose the media ID.

Pipeline actions should be explicit and staged:
1. Analyze product/script.
2. Generate storyboard/reference media.
3. Review/edit scenes.
4. Render video.
5. Download/open output.

Disable controls only when the pipeline stage truly prevents editing. Explain blocked states with concise inline status, not large instructional cards.

## Do

- Keep the app dense but calm.
- Use real generated media as the strongest visual element.
- Keep Flow project, product media ID, and character media ID visible.
- Make settings scannable with compact labels, status rows, and segmented controls.
- Use consistent icon buttons for upload, refresh, delete, reset, download, and open-external actions.

## Don't

- Do not build a landing page or hero marketing section.
- Do not use decorative gradient orbs, bokeh blobs, or oversized illustrations.
- Do not use huge headings inside tool panels.
- Do not hide important Flow/reference state behind only color.
- Do not use heavy shadows, nested cards, or one-note purple gradients.
