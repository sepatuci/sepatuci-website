/**
 * The embers of the opening splash, drawn on a plain 2D canvas: a few hundred
 * tinted sprites that drift in from beyond the edges, gather into a halo
 * around the logo, and let go outward when the ring pulses. No WebGL, so a
 * machine without it still gets the full splash, and the background canvas
 * that follows is the only WebGL context the page ever opens.
 */

export interface EmberField {
  /** Begins spawning and gathering. Safe to call before the sprite has loaded. */
  start(): void;
  /** Lets the embers go outward and fade. */
  release(): void;
  /** Stops drawing and frees everything. */
  dispose(): void;
}

const COUNT = 320;
const SPAWN_MS = 500;
const HALO_PX = 110;
const RELEASE_MS = 600;
const MAX_DPR = 1.5;
const TINT = "#d4aaff";

interface Ember {
  spawnAt: number;
  angle: number;
  startR: number;
  targetR: number;
  travelMs: number;
  size: number;
  wobble: number;
  /** Set when released: outward speed in px per ms. */
  vx: number;
  vy: number;
  x: number;
  y: number;
}

/** The sprite recoloured once, so each frame only copies pixels. */
function tintSprite(image: HTMLImageElement): HTMLCanvasElement | null {
  const sprite = document.createElement("canvas");
  sprite.width = image.naturalWidth || image.width;
  sprite.height = image.naturalHeight || image.height;
  const context = sprite.getContext("2d");
  if (!context || sprite.width === 0 || sprite.height === 0) return null;
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = TINT;
  context.fillRect(0, 0, sprite.width, sprite.height);
  return sprite;
}

const easeIn = (t: number): number => t * t;
const settle = (t: number): number => t * t * (3 - 2 * t);

export function createEmberField(canvas: HTMLCanvasElement, host: HTMLElement, spriteSrc: string): EmberField {
  const context = canvas.getContext("2d");
  let sprite: HTMLCanvasElement | null = null;
  let embers: Ember[] = [];
  let width = 0;
  let height = 0;
  let startedAt: number | null = null;
  let releasedAt: number | null = null;
  let frame = 0;
  let disposed = false;
  let hidden = false;

  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    if (!disposed) sprite = tintSprite(image);
  };
  image.src = spriteSrc;

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  resize();

  const draw = (now: number) => {
    if (disposed || !context) return;
    frame = 0;
    if (!hidden) frame = requestAnimationFrame(draw);
    context.clearRect(0, 0, width, height);
    if (!sprite || startedAt === null) return;
    const cx = width / 2;
    const cy = height / 2;
    context.globalCompositeOperation = "lighter";

    for (const ember of embers) {
      if (now < ember.spawnAt) continue;
      let alpha: number;
      let size = ember.size;
      if (releasedAt !== null) {
        const t = Math.min((now - releasedAt) / RELEASE_MS, 1);
        if (t >= 1) continue;
        const dt = 16;
        ember.x += ember.vx * dt;
        ember.y += ember.vy * dt;
        alpha = 1 - t;
      } else {
        const t = Math.min((now - ember.spawnAt) / ember.travelMs, 1);
        const r = ember.startR + (ember.targetR - ember.startR) * easeIn(t);
        if (t >= 1) {
          // Arrived: a slow turn around the logo, with a little shimmer.
          ember.angle += 0.0012 * 16;
        }
        const wobble = t >= 1 ? Math.sin(now * 0.003 + ember.wobble) * 4 : 0;
        ember.x = cx + Math.cos(ember.angle) * (r + wobble);
        ember.y = cy + Math.sin(ember.angle) * (r + wobble);
        const flicker = 0.6 + 0.4 * Math.sin(now * 0.004 + ember.wobble);
        alpha = Math.min(1, t * 2) * flicker;
        size = ember.size * (0.7 + 0.3 * settle(t));
      }
      context.globalAlpha = Math.max(0, Math.min(1, alpha));
      context.drawImage(sprite, ember.x - size / 2, ember.y - size / 2, size, size * (sprite.height / sprite.width));
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  };

  const onVisibility = () => {
    hidden = document.visibilityState === "hidden";
    if (!hidden && frame === 0 && !disposed) frame = requestAnimationFrame(draw);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    start() {
      if (disposed || startedAt !== null) return;
      const begun = performance.now();
      startedAt = begun;
      const halfDiagonal = Math.hypot(width, height) / 2;
      embers = Array.from({ length: COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const startR = halfDiagonal * (0.9 + Math.random() * 0.4);
        return {
          spawnAt: begun + Math.random() * SPAWN_MS,
          angle,
          startR,
          targetR: HALO_PX * (0.8 + Math.random() * 0.5),
          travelMs: 800 + Math.random() * 500,
          size: 5 + Math.random() * 12,
          wobble: Math.random() * Math.PI * 2,
          vx: 0,
          vy: 0,
          x: width / 2 + Math.cos(angle) * startR,
          y: height / 2 + Math.sin(angle) * startR,
        };
      });
      if (frame === 0) frame = requestAnimationFrame(draw);
    },
    release() {
      if (disposed || releasedAt !== null) return;
      releasedAt = performance.now();
      for (const ember of embers) {
        const speed = 0.25 + Math.random() * 0.35;
        const spread = (Math.random() - 0.5) * 0.6;
        ember.vx = Math.cos(ember.angle + spread) * speed;
        ember.vy = Math.sin(ember.angle + spread) * speed;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      image.onload = null;
      embers = [];
      context?.clearRect(0, 0, width, height);
    },
  };
}
