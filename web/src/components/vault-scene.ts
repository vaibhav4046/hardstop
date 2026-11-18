// The moving vault door in the home hero. Loaded on demand by
// hero-backdrop.tsx, after the page is idle, and never under reduced motion.
//
// It looks like the still picture it replaces: gold dots on a 4px grid, set
// by ordered (Bayer) dithering. The door underneath is a 3D model built with
// three.js; each frame it is lit and rendered small, one pixel per dot, and a
// second pass turns that brightness into dots. So the picture can move (the
// door swings shut, the bar slides home, the wheel turns, and it answers the
// pointer and the scroll) while staying the same drawing.
//
// Everything is built from shapes in code: no model, texture or image file is
// fetched, so the site's Content-Security-Policy needs nothing new.
//
// Cost is kept low. The renderer refuses a software-only graphics path
// (`failIfMajorPerformanceCaveat`), so a machine without a graphics card
// keeps the still picture. The model is drawn at a sixteenth of the canvas's
// pixels, at most 30 frames a second once the door has closed, and nothing
// at all while the hero is off screen or the tab is hidden.

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Texture,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The same grid and colours as hero-backdrop.tsx.
const CELL = 4 // CSS px between dots
const DOT = 2.4
const GOLD = [227, 176, 75].map((channel) => channel / 255)
const GOLD_LIGHT = [246, 214, 140].map((channel) => channel / 255)

const BOLTS = 14
const IDLE_FRAME_MS = 1000 / 30
const INTRO_S = 2.6 // door swings shut, the bar slides home, the wheel turns

type Options = {
  /** Called once the first frame is on the canvas. */
  onReady: () => void
  /** Called if the browser takes the graphics context away; the still picture should come back. */
  onLost: () => void
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (progress: number) => 1 - (1 - progress) ** 3
/** Overshoots a little and settles: the bar landing in its bracket. */
const easeBack = (progress: number) => 1 + 2.2 * (progress - 1) ** 3 + 1.2 * (progress - 1) ** 2

/** Faint machined rings on the face of the door, and a glow fading out past the rim, drawn once. */
function radialTexture(stops: [number, string][], rings: boolean): Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (const [at, colour] of stops) gradient.addColorStop(at, colour)
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    if (rings) {
      for (let ring = 4; ring < size / 2; ring += 4) {
        context.strokeStyle = 'rgba(255, 228, 170, 0.05)'
        context.beginPath()
        context.arc(size / 2, size / 2, ring, 0, Math.PI * 2)
        context.stroke()
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** The door: rim, face, bolts, wheel, and the stop bar with its bracket. Facing +z, radius about 1. */
function buildDoor(face: Texture, halo: Texture) {
  const gold = new MeshStandardMaterial({ color: 0xe3b04b, metalness: 0.55, roughness: 0.42 })
  const goldDeep = new MeshStandardMaterial({ color: 0x6b5222, metalness: 0.9, roughness: 0.5 })
  const faceMaterial = new MeshStandardMaterial({ map: face, metalness: 0.2, roughness: 0.8 })
  // The bar is the brightest thing in the picture, as in the still one.
  const barMaterial = new MeshBasicMaterial({ color: 0xfff1cc })
  const haloMaterial = new MeshBasicMaterial({ map: halo, depthWrite: false })

  const door = new Group()

  // A soft glow on the wall round the door, so a few dots scatter past the rim.
  const wall = new Mesh(new PlaneGeometry(7, 7), haloMaterial)
  wall.position.z = -0.25
  door.add(wall)

  // The rim, turned on a lathe: a stepped lip round the edge of the door.
  const rimProfile = [
    [0.93, 0.06],
    [0.97, 0.15],
    [1.06, 0.17],
    [1.12, 0.1],
    [1.14, -0.12],
    [0.93, -0.12],
  ].map(([radius, depth]) => new Vector2(radius, depth))
  const rim = new Mesh(new LatheGeometry(rimProfile, 96), gold)
  rim.rotation.x = Math.PI / 2
  door.add(rim)

  const faceDisc = new Mesh(new CylinderGeometry(0.94, 0.94, 0.12, 96), [goldDeep, faceMaterial, goldDeep])
  faceDisc.rotation.x = Math.PI / 2
  door.add(faceDisc)

  const bolt = new CylinderGeometry(0.05, 0.05, 0.09, 16)
  for (let index = 0; index < BOLTS; index++) {
    const angle = (index / BOLTS) * Math.PI * 2
    const mesh = new Mesh(bolt, gold)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(0.76 * Math.cos(angle), 0.76 * Math.sin(angle), 0.08)
    door.add(mesh)
  }

  // The wheel: a ring, four spokes set diagonally so the bar crosses between them, and a hub.
  const wheel = new Group()
  wheel.position.z = 0.16
  wheel.add(new Mesh(new TorusGeometry(0.4, 0.04, 12, 64), gold))
  const spoke = new BoxGeometry(0.76, 0.06, 0.05)
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const mesh = new Mesh(spoke, gold)
    mesh.rotation.z = angle
    wheel.add(mesh)
  }
  door.add(wheel)

  // The stop: a bar across the door and on past its right edge, held by a bracket at the left.
  const bracket = new Mesh(new BoxGeometry(0.16, 0.3, 0.16), goldDeep)
  bracket.position.set(-1.28, 0, 0.2)
  door.add(bracket)
  const bar = new Mesh(new BoxGeometry(8, 0.13, 0.09), barMaterial)
  const barHome = 2.75 // the bar's centre once it is home: its left end sits in the bracket
  bar.position.set(barHome, 0, 0.3)
  door.add(bar)

  const materials: Material[] = [gold, goldDeep, faceMaterial, barMaterial, haloMaterial]
  return { door, wheel, bar, barHome, materials }
}

/** Turns the small render into gold dots: one cell per pixel of it, a dot where its brightness beats the Bayer threshold. */
function ditherPass(source: Texture) {
  const material = new ShaderMaterial({
    uniforms: {
      source: { value: source },
      size: { value: new Vector2(1, 1) },
      ratio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D source;
      uniform vec2 size; // the canvas in CSS px
      uniform float ratio;

      float bayer2(vec2 a) {
        a = floor(a);
        return fract(dot(a, vec2(0.5, a.y * 0.75)));
      }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

      void main() {
        // Counted from the top left, as the still picture's grid is, so the two line up.
        vec2 css = vec2(gl_FragCoord.x / ratio, size.y - gl_FragCoord.y / ratio);
        vec2 cell = floor(css / ${CELL.toFixed(1)});
        vec2 inside = css - cell * ${CELL.toFixed(1)};
        if (inside.x > ${DOT.toFixed(2)} || inside.y > ${DOT.toFixed(2)}) discard;
        vec2 centre = (cell + 0.5) * ${CELL.toFixed(1)} / size;
        vec3 colour = texture2D(source, vec2(centre.x, 1.0 - centre.y)).rgb;
        float lum = dot(colour, vec3(0.2126, 0.7152, 0.0722));
        float level = 1.0 - exp(-lum * 3.4);
        if (level <= bayer8(cell) + 0.008) discard;
        gl_FragColor = vec4(level > 0.8 ? vec3(${GOLD_LIGHT.map((channel) => channel.toFixed(4)).join(', ')}) : vec3(${GOLD.map((channel) => channel.toFixed(4)).join(', ')}), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  })
  const scene = new Scene()
  scene.add(new Mesh(new PlaneGeometry(2, 2), material))
  return { scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material }
}

/**
 * Starts the scene on `canvas`. Returns a function that stops it and frees
 * everything it made, or `null` if this browser cannot draw it well (no
 * WebGL, or only a software one), in which case nothing has changed.
 */
export function mountVault(canvas: HTMLCanvasElement, options: Options): (() => void) | null {
  // Asked for directly first: given no context, three would log an error before
  // throwing, and on a machine without a graphics card that is the normal case.
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  }
  const context = canvas.getContext('webgl2', attributes)
  if (!context) return null
  // Some browsers hand out a software renderer anyway (headless Chromium does,
  // with SwiftShader). Drawing on the processor is what this must never do.
  const debug = context.getExtension('WEBGL_debug_renderer_info')
  const name = String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER))
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) {
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }
  let renderer: WebGLRenderer | null = null
  try {
    renderer = new WebGLRenderer({ canvas, context, ...attributes })
    return run(canvas, renderer, options)
  } catch {
    renderer?.dispose()
    return null
  }
}

function run(canvas: HTMLCanvasElement, renderer: WebGLRenderer, { onReady, onLost }: Options): () => void {
  const ratio = Math.min(devicePixelRatio || 1, 2)
  renderer.setPixelRatio(ratio)
  renderer.setClearColor(0x000000, 0)

  // The model, lit. Light falls from the upper right, as in the still picture.
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const lighting = pmrem.fromScene(room, 0.04)
  const environment = lighting.texture
  scene.environment = environment
  scene.environmentIntensity = 0.16
  pmrem.dispose()
  room.dispose()
  const key = new DirectionalLight(0xffffff, 3.6)
  key.position.set(3, 3.2, 4)
  scene.add(key)

  const face = radialTexture(
    [
      [0, '#363636'],
      [1, '#141414'],
    ],
    true,
  )
  const halo = radialTexture(
    [
      [0, '#3a3a3a'],
      [0.16, '#2e2e2e'],
      [0.34, '#0c0c0c'],
      [0.6, '#000000'],
    ],
    false,
  )
  const { door, wheel, bar, barHome, materials } = buildDoor(face, halo)
  scene.add(door)

  // One pixel of this per dot on screen. Eight bits a channel is enough for a
  // brightness that only has to beat a 64-step threshold, and every WebGL 2
  // device can render into it.
  const target = new WebGLRenderTarget(1, 1, { magFilter: NearestFilter, minFilter: NearestFilter })
  const dither = ditherPass(target.texture)

  const camera = new PerspectiveCamera(28, 1, 0.1, 50)
  const fit = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    target.setSize(Math.ceil(width / CELL), Math.ceil(height / CELL))
    dither.material.uniforms.size.value = new Vector2(width, height)
    dither.material.uniforms.ratio.value = renderer.getPixelRatio()
    camera.aspect = width / height
    // The door's radius takes most of the half-height, and always fits across.
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const byHeight = 1 / (0.94 * tan)
    const byWidth = 1.3 / (tan * camera.aspect)
    camera.position.set(0, 0, Math.max(byHeight, byWidth))
    camera.updateProjectionMatrix()
  }
  fit()

  // Inputs the frame reads: how far the hero has scrolled away, and where the pointer is.
  let scrolled = 0
  const pointer = { x: 0, y: 0 }
  const tilt = { x: 0, y: 0 }
  const host = canvas.closest('.hero') ?? canvas
  const onScroll = () => {
    const box = host.getBoundingClientRect()
    scrolled = clamp01(-box.top / Math.max(1, box.height))
  }
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    pointer.x = (event.clientX / innerWidth) * 2 - 1
    pointer.y = (event.clientY / innerHeight) * 2 - 1
  }
  onScroll()

  const started = performance.now()
  let frame = 0
  let last = 0
  let isVisible = true
  let isReady = false

  const draw = (now: number) => {
    frame = 0
    const t = (now - started) / 1000
    const isIntro = t < INTRO_S
    if (!isIntro && now - last < IDLE_FRAME_MS) {
      schedule()
      return
    }
    last = now

    const swing = easeOut(clamp01(t / 1.6))
    const slide = clamp01((t - 0.7) / 0.9)
    const turn = easeOut(clamp01((t - 1.5) / 1.1))

    tilt.x += (pointer.y * 0.12 - tilt.x) * 0.06
    tilt.y += (pointer.x * 0.18 - tilt.y) * 0.06

    door.rotation.y = -0.85 * (1 - swing) + 0.08 * Math.sin(t * 0.35) + tilt.y + scrolled * 0.7
    door.rotation.x = 0.05 * Math.sin(t * 0.27) + tilt.x - scrolled * 0.25
    door.position.y = scrolled * 0.9
    bar.position.x = barHome + 8 * (1 - easeBack(slide))
    wheel.rotation.z = turn * (Math.PI / 2) + scrolled * Math.PI

    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.clear()
    renderer.render(dither.scene, dither.camera)
    if (!isReady) {
      isReady = true
      onReady()
    }
    schedule()
  }
  const schedule = () => {
    if (isVisible && !frame) frame = requestAnimationFrame(draw)
  }

  const seen = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting
    if (isVisible) schedule()
    else if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  })
  seen.observe(canvas)
  const resized = new ResizeObserver(fit)
  resized.observe(canvas)
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('pointermove', onPointer, { passive: true })

  let isStopped = false
  const stop = () => {
    if (isStopped) return
    isStopped = true
    if (frame) cancelAnimationFrame(frame)
    seen.disconnect()
    resized.disconnect()
    removeEventListener('scroll', onScroll)
    removeEventListener('pointermove', onPointer)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    for (const owner of [scene, dither.scene]) {
      owner.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
    }
    for (const material of materials) material.dispose()
    dither.material.dispose()
    face.dispose()
    halo.dispose()
    target.dispose()
    lighting.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  const onContextLost = () => {
    stop()
    onLost()
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  schedule()
  return stop
}
