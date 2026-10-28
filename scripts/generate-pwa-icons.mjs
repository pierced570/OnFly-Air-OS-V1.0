/**
 * Resize brand mark → PWA / Apple touch icons (any + maskable).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mark = path.join(root, 'public/brand/onfly-mark.png')
const outDir = path.join(root, 'public/brand')

const BG = { r: 12, g: 12, b: 14, alpha: 1 } // #0C0C0E

async function square(size, name) {
  await sharp(mark)
    .resize(size, size, { fit: 'contain', background: BG })
    .png()
    .toFile(path.join(outDir, name))
  console.log(`wrote ${name} (${size}x${size})`)
}

/** Maskable: icon content in ~80% safe zone on brand background. */
async function maskable(size, name) {
  const inner = Math.round(size * 0.72)
  const icon = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: BG })
    .png()
    .toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(path.join(outDir, name))
  console.log(`wrote ${name} (${size}x${size} maskable)`)
}

await mkdir(outDir, { recursive: true })
await square(180, 'apple-touch-icon.png')
await square(192, 'pwa-192.png')
await square(512, 'pwa-512.png')
await maskable(512, 'pwa-512-maskable.png')
