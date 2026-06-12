# VisualAtlas

An infinite 3D canvas for exploring public art and photo archives. Browse thousands of images from the Art Institute of Chicago, NASA, the Met, Smithsonian, Internet Archive, and Biodiversity Heritage Library — or load your own — all floating in a navigable three-dimensional field.

Built as a single HTML file. No framework, no build step.

![VisualAtlas screenshot](https://raw.githubusercontent.com/beneb85/visual-atlas/main/Assets/preview.png)

---

## Features

**Explore & Navigate**
- Infinite field of image tiles rendered in WebGL via Three.js
- Mouse drag to pan, scroll/trackpad to fly forward and back
- Touch support: one finger pans, two-finger pinch flies
- Click any image to focus it full-frame with hi-res texture and archive metadata

**Archive Sources**
| Source | Content |
|---|---|
| Art Institute of Chicago | Public-domain paintings, prints, photos |
| WikiMedia Commons | publicly accessible online library of free-to-use images |
| NASA | Space imagery and mission photography |
| The Met | Metropolitan Museum of Art collection |
| Smithsonian | Cross-institution collections |
| Internet Archive | Vintage scans and photographs |
| Biodiversity Heritage Library | Natural history illustrations |
| My Uploads | Local image files (drag & drop) |
| Own Links | Dropbox, Google Drive, or any direct URL |

**Cluster Mode**
Switch from the open field into a grouped layout — images cluster by color family, decade, subject, or other facets derived from each archive's metadata.

**Filter Panel**
Narrow the canvas by color, date range, subject, and more. Filters apply live across both explore and cluster modes.

**Bookmarks**
Save images to a persistent bookmark list, accessible from the dock.

**Gesture Navigation** *(optional, camera required)*
Hands-free navigation powered by MediaPipe Hand Landmarker — camera is requested only when you enable the mode.

| Gesture | Action |
|---|---|
| Point left / right | Glide that way — hold to keep moving |
| Point up / down | Fly forward / back through the field |
| Fist | Stop — holds the current position |
| Victory ✌ then open hand | Focus the centred image · release to close |

**Ambient Music**
Optional background audio track toggled from the dock.

**Mobile**
Responsive layout with bottom-sheet panels for Filter, Bookmarks, and Archive Browser.

---

## Run locally

No install needed for the canvas itself — just serve the folder:

```bash
npm start
# or: npx serve . -p 3001 -c serve-canvas.json
```

Then open [http://localhost:3001](http://localhost:3001).

### Photo metadata pipeline (optional)

`scripts/process-photos.mjs` reads a folder of images, extracts EXIF data and dominant colors via `sharp` + `exifr`, and writes `photos.json` — used by the "My Uploads" source.

```bash
npm install
npm run process
```

---

## Tech

- [Three.js](https://threejs.org/) r169 — WebGL renderer, loaded from CDN
- [MediaPipe Tasks-Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) — hand tracking, lazy-loaded from CDN on first enable
- Vanilla JS, no bundler, no framework
- Single file: `infinite-canvas.html` (~9 000 lines of HTML / CSS / JS)

---

## Structure

```
infinite-canvas.html        main app (self-contained)
infinite-canvas.stable.html last stable snapshot
photos.json                 sample photo manifest
audio/meditation.mp3        ambient music track
scripts/process-photos.mjs  photo metadata pipeline
serve-canvas.json           serve config (routes / → canvas)
```

---

## License

Archive content is served from public APIs and subject to each institution's terms. The application code is MIT.
