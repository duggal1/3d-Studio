# Harshit Studio — Design

Harshit Studio is a browser-based 3D asset studio for loading GLB/3D files, inspecting them, playing embedded animations, and combining animations into a preview video. No signup, no dashboard bloat, no distractions. The 3D asset is the product surface; the UI stays quiet around it.

## Visual direction

Use a dark, minimal, glass-first interface inspired by native macOS tooling.

- Full-screen 3D viewport as the primary canvas.
- Near-black background, never pure decorative gradients.
- Floating controls instead of heavy sidebars where possible.
- Square or near-square geometry. Avoid oversized rounded cards.
- Thin `0.5px` translucent borders.
- Glass surfaces use subtle vertical highlights, not opaque black panels.
- Shadows stay soft and restrained.
- No unnecessary decoration, illustrations, marketing UI, or gradients outside functional glass.

## Glass surface

```css
background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
border: .5px solid rgba(255,255,255,.13);
border-radius: 0;
backdrop-filter: blur(32px) saturate(180%) brightness(.92);
-webkit-backdrop-filter: blur(32px) saturate(180%) brightness(.92);
box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 0 0 .5px rgba(0,0,0,.18), 0 10px 30px rgba(0,0,0,.18);
```

## Typography

Native system typography, weight 400, sentence case, compact spacing. No uppercase labels or bold-heavy UI.

## Layout and interaction

The viewport owns almost the entire screen. File information, animation controls, camera actions, and export controls float above it only when useful. Drag-and-drop is immediate, camera movement is smooth, and UI transitions stay within 120–180ms.
