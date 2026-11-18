'use client'

// The picture behind the home headline: a vault door with a bar across it,
// worked out from a few circles and lines and drawn as gold dots with ordered
// dithering. It is generated here; there is no image file. Decorative only.
//
// The picture is drawn once. The one thing that moves is a glow along the
// bar, and that is a strip of CSS laid over the bar's dots (see home.css), not
// a redraw: redrawing the canvas many times a second cost a whole processor
// core on a machine without a graphics card.

import { useEffect, useRef } from 'react'

const CELL = 4 // CSS px between dots
const DOT = 2.4
const GOLD = 'rgb(227 176 75)'
const GOLD_LIGHT = 'rgb(246 214 140)'

/** 8x8 Bayer matrix: the threshold each dot position compares the brightness against. */
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

const BOLTS = 14
const SPOKES = 4
const LIGHT = -0.9 // radians: light falls from the upper right
const BAR = 0.062 // half the height of the bright part of the bar, in door radii

/** Brightness, 0 to 1, of the door at a point. `dx`, `dy` are measured from its centre in door radii. */
function brightness(dx: number, dy: number): number {
  const d = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const lit = 0.5 + 0.5 * Math.cos(angle - LIGHT)

  // The stop: a bar lying across the door and on past its right edge.
  if (dx > -1.3 && Math.abs(dy) < 0.085) return Math.abs(dy) > BAR ? 0.03 : 0.9 + 0.1 * lit
  if (dx > -1.3 && Math.abs(dy) < 0.115) return 0.04

  if (d > 1.14) return 0.11 * Math.exp(-(d - 1.14) * 2.4)
  if (d > 1) return 0.1 + 0.16 * lit
  if (d > 0.84) return 0.16 + 0.7 * lit * Math.sin(((d - 0.84) / 0.16) * Math.PI)

  // Bolts set into the rim's inner edge.
  const step = (Math.PI * 2) / BOLTS
  const nearest = Math.round(angle / step) * step
  if (Math.hypot(dx - 0.76 * Math.cos(nearest), dy - 0.76 * Math.sin(nearest)) < 0.034) return 0.82

  // The wheel: a ring, and four spokes set diagonally so the bar crosses between them.
  if (d > 0.36 && d < 0.43) return 0.4 + 0.5 * lit
  if (d < 0.36) {
    const turn = (Math.PI * 2) / SPOKES
    const offset = Math.abs((((angle % turn) + turn) % turn) - turn / 2)
    if (d * Math.sin(offset) < 0.03) return 0.66
  }

  // The face: lighter toward the light, with faint machined rings.
  return 0.12 + 0.24 * lit * d + 0.035 * Math.cos(d * 46)
}

/** Draws the picture, and tells the glow where the bar's dots are. */
function paint(canvas: HTMLCanvasElement, glow: HTMLElement | null): void {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const context = canvas.getContext('2d')
  if (!context || width === 0 || height === 0) return
  const ratio = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  context.scale(ratio, ratio)

  // Behind the copy (home.css positions it there on a wide screen), the door stands in the right half.
  // As a band under the copy, it fills the band and is cropped above and below.
  const isBehind = getComputedStyle(canvas).position === 'absolute'
  const radius = isBehind ? Math.min(height * 0.47, width * 0.3) : Math.max(height * 0.72, width * 0.36)
  const centreX = isBehind ? width * 0.75 : width * 0.5
  const centreY = height * 0.5

  // The glow covers the bright rows of the bar, from just left of the door's
  // centre (clear of the copy) to the right edge, on the same grid as the dots.
  if (glow) {
    const firstRow = Math.ceil((centreY - BAR * radius) / CELL)
    const lastRow = Math.floor((centreY + BAR * radius) / CELL)
    glow.hidden = !isBehind
    glow.style.top = `${firstRow * CELL}px`
    glow.style.height = `${(lastRow - firstRow) * CELL + DOT}px`
    glow.style.left = `${Math.ceil((centreX - 0.5 * radius) / CELL) * CELL}px`
  }

  for (let row = 0; row * CELL < height; row++) {
    for (let column = 0; column * CELL < width; column++) {
      const level = brightness((column * CELL - centreX) / radius, (row * CELL - centreY) / radius)
      if (level * 64 <= BAYER[row & 7][column & 7]) continue
      context.fillStyle = level > 0.8 ? GOLD_LIGHT : GOLD
      context.fillRect(column * CELL, row * CELL, DOT, DOT)
    }
  }
}

export function HeroBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const glow = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    // Also draws it the first time: an observer reports the size it starts with.
    const observer = new ResizeObserver(() => paint(canvas, glow.current))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <canvas ref={ref} className="hero-backdrop" aria-hidden="true" />
      <span ref={glow} className="hero-glow" aria-hidden="true" hidden>
        <span />
      </span>
    </>
  )
}
