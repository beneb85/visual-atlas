#!/usr/bin/env node
/**
 * Photo processing pipeline.
 *
 * Scans an input directory of photos and produces ./photos.json — a manifest
 * the infinite canvas loads to place, filter, and cluster the user's own images.
 *
 * For each photo it extracts:
 *   - filename
 *   - EXIF date (DateTimeOriginal, falling back to file mtime) → YYYY-MM-DD
 *   - GPS { lat, lon } when present
 *   - dimensions { width, height }
 *   - dominant color (hex)
 *   - a downscaled WebP thumbnail (used as the canvas texture)
 *   - location (optional reverse geocode of GPS via OpenStreetMap Nominatim)
 *
 * The AI block (caption / description / scene / activity / objects / mood) is
 * STUBBED for now — see TODO(ai). A later scripts/ai-enrich.mjs backfills it.
 *
 * Usage:
 *   node scripts/process-photos.mjs [inputDir]   (default: ./photos)
 *   node scripts/process-photos.mjs ./photos --no-geocode
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const inputArg = args.find((a) => !a.startsWith('--')) || 'photos';
const DO_GEOCODE = !args.includes('--no-geocode');

const INPUT_DIR  = path.resolve(ROOT, inputArg);
const THUMB_DIR  = path.join(INPUT_DIR, '.thumbs');
const OUT_FILE   = path.join(ROOT, 'photos.json');
const THUMB_SIZE = 640;

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic']);

// ── Helpers ───────────────────────────────────────────────────────────────────
const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const slugify = (name) =>
  name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'img';

const fmtDate = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

// ── Reverse geocoding (optional, throttled, cached) ──────────────────────────
const geoCache = new Map();
let lastGeoCall = 0;

async function reverseGeocode(lat, lon) {
  if (!DO_GEOCODE || lat == null || lon == null) return null;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (geoCache.has(key)) return geoCache.get(key);

  // Nominatim usage policy: max 1 req/sec, identifying User-Agent required.
  const wait = 1100 - (Date.now() - lastGeoCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'infinite-canvas-pipeline/1.0', 'Accept-Language': 'en' } });
    const data = await res.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.county || a.state || data.name || null;
    const loc = place ? (a.country ? `${place}, ${a.country}` : place) : null;
    geoCache.set(key, loc);
    return loc;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

// ── Per-image processing ──────────────────────────────────────────────────────
async function processImage(file) {
  const filename = path.basename(file);
  const id = slugify(filename);

  // EXIF date + GPS (tolerant of files without EXIF).
  let exif = null, gpsData = null;
  try { exif = await exifr.parse(file, { tiff: true, exif: true, gps: true }); } catch {}
  try { gpsData = await exifr.gps(file); } catch {}

  const stat = await fs.stat(file);
  const date = fmtDate(exif?.DateTimeOriginal || exif?.CreateDate) || fmtDate(stat.mtime);

  const gps = (gpsData && gpsData.latitude != null)
    ? { lat: +gpsData.latitude.toFixed(6), lon: +gpsData.longitude.toFixed(6) }
    : null;

  // Dimensions + dominant color via sharp.
  const img = sharp(file, { failOn: 'none' });
  const meta = await img.metadata();
  let dominantColor = '#888888';
  try {
    const { dominant } = await img.stats();
    dominantColor = toHex(dominant.r, dominant.g, dominant.b);
  } catch {}

  // Thumbnail (canvas texture).
  const thumbName = `${id}.webp`;
  await sharp(file, { failOn: 'none' })
    .rotate()                          // respect EXIF orientation
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(THUMB_DIR, thumbName));

  const location = gps ? await reverseGeocode(gps.lat, gps.lon) : null;

  return {
    id,
    filename,
    thumb: `${inputArg}/.thumbs/${thumbName}`,
    src: `${inputArg}/${filename}`,
    date,
    gps,
    location,
    width: meta.width ?? null,
    height: meta.height ?? null,
    dominantColor,
    // TODO(ai): backfilled by scripts/ai-enrich.mjs (Claude vision).
    ai: {
      caption: null,
      description: null,
      scene: null,
      activity: null,
      objects: [],
      mood: null,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await fs.access(INPUT_DIR);
  } catch {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    console.error(`Create it and drop photos in, e.g.:  mkdir -p ${path.relative(ROOT, INPUT_DIR)} && cp ~/Pictures/*.jpg $_`);
    process.exit(1);
  }

  await fs.mkdir(THUMB_DIR, { recursive: true });

  const entries = await fs.readdir(INPUT_DIR);
  const files = entries
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(INPUT_DIR, f))
    .sort();

  if (!files.length) {
    console.error(`No images found in ${INPUT_DIR} (looked for ${[...EXT].join(', ')}).`);
    process.exit(1);
  }

  console.log(`Processing ${files.length} image(s) from ${path.relative(ROOT, INPUT_DIR)}/ …`);
  const manifest = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const entry = await processImage(f);
      manifest.push(entry);
      console.log(`  [${i + 1}/${files.length}] ${entry.filename}  ${entry.date}  ${entry.dominantColor}${entry.location ? '  ' + entry.location : ''}`);
    } catch (err) {
      console.warn(`  [${i + 1}/${files.length}] ${path.basename(f)} — skipped: ${err.message}`);
    }
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.length} entries → ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
