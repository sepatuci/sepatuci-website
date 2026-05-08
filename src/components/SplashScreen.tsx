'use client';

import { useEffect, useRef, useState } from 'react';
import phoenixImg from '@/assets/logos/sep_logos/sep_white.png';
import emberImg    from '@/assets/logos/ember.png';

// ── Particle constants ────────────────────────────────────────────────────────
const MAX_P    = 600;
const FROZEN_R = 0.08; // world-space radius — within this → frozen

// Particle states (stored in Float32Array for speed)
const S_GATHERING = 1;
const S_FROZEN    = 2;
const S_EXPLODING = 3;
const S_DRIFTING  = 4;

export default function SplashScreen() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('splashSeen');
  });

  const splashRef       = useRef<HTMLDivElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const logoRef         = useRef<HTMLImageElement>(null);
  const shockwaveRef    = useRef<HTMLDivElement>(null);
  const whiteOverlayRef = useRef<HTMLDivElement>(null);

  // Bridges between the two useEffects — set by particle effect, called by GSAP
  const explodeFnRef  = useRef<((now: number) => void) | null>(null);
  const disposeFnRef  = useRef<(() => void) | null>(null);

  // ── Particle system ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let torn   = false;

    // Per-particle state
    const pState     = new Float32Array(MAX_P); // S_*
    const xArr       = new Float32Array(MAX_P);
    const yArr       = new Float32Array(MAX_P);
    const vxArr      = new Float32Array(MAX_P);
    const vyArr      = new Float32Array(MAX_P);
    const szArr      = new Float32Array(MAX_P); // base size (px)
    const wobArr     = new Float32Array(MAX_P);
    const ageArr     = new Float32Array(MAX_P);
    // Explosion + drift targets
    const expTimeArr = new Float32Array(MAX_P);
    const expVxArr   = new Float32Array(MAX_P);
    const expVyArr   = new Float32Array(MAX_P);
    const drfVxArr   = new Float32Array(MAX_P);
    const drfVyArr   = new Float32Array(MAX_P);

    (async () => {
      const THREE = await import('three');
      if (torn) return;

      const w      = window.innerWidth;
      const h      = window.innerHeight;
      const aspect = w / h;
      // Max distance from center to corner in world units
      const maxD   = Math.sqrt(aspect * aspect + 1);

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const scene  = new THREE.Scene();
      // Centered coordinate system: x ∈ [-aspect, aspect], y ∈ [-1, 1]
      const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
      camera.position.z = 10;

      const emberTex = await new THREE.TextureLoader().loadAsync(
        (emberImg as { src: string }).src
      );
      if (torn) { emberTex.dispose(); renderer.dispose(); return; }

      const positions = new Float32Array(MAX_P * 3);
      const gpuSizes  = new Float32Array(MAX_P);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSize',    new THREE.BufferAttribute(gpuSizes, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map:        { value: emberTex },
          pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: /* glsl */`
          attribute float aSize;
          uniform   float pixelRatio;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * pixelRatio;
            gl_Position  = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */`
          uniform sampler2D map;
          void main() {
            vec4 c = texture2D(map, gl_PointCoord);
            if (c.a < 0.01) discard;
            gl_FragColor = c;
          }
        `,
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
      });

      scene.add(new THREE.Points(geo, mat));

      let spawned    = 0;
      const gatherT0 = performance.now();

      function initGathering(i: number) {
        // Spawn in 10% band from any edge
        const side  = Math.floor(Math.random() * 4);
        const edgeY = 0.2;          // 10% of total height (=2)
        const edgeX = aspect * 0.2; // 10% of total width (=2*aspect)
        let x: number, y: number;

        if (side === 0) {       // top
          x = (Math.random() * 2 - 1) * aspect;
          y = 1.0 - Math.random() * edgeY;
        } else if (side === 1) { // bottom
          x = (Math.random() * 2 - 1) * aspect;
          y = -1.0 + Math.random() * edgeY;
        } else if (side === 2) { // left
          x = -aspect + Math.random() * edgeX;
          y = (Math.random() * 2 - 1);
        } else {                  // right
          x = aspect - Math.random() * edgeX;
          y = (Math.random() * 2 - 1);
        }

        xArr[i] = x; yArr[i] = y;

        // Velocity toward (0,0) with ±15° variation
        const baseAngle = Math.atan2(-y, -x);
        const vary      = (Math.random() - 0.5) * (30 * Math.PI / 180);
        const speed     = 0.006 + Math.random() * 0.006;
        vxArr[i]  = Math.cos(baseAngle + vary) * speed;
        vyArr[i]  = Math.sin(baseAngle + vary) * speed;
        szArr[i]  = 5 + Math.random() * 12;
        wobArr[i] = Math.random() * Math.PI * 2;
        ageArr[i] = 0;
        pState[i] = S_GATHERING;
      }

      function triggerExplosion(now: number) {
        for (let i = 0; i < spawned; i++) {
          if (pState[i] === 0) continue;
          const outAngle = Math.random() * Math.PI * 2;
          const outSpeed = 0.012 + Math.random() * 0.018;
          expVxArr[i]   = Math.cos(outAngle) * outSpeed;
          expVyArr[i]   = Math.sin(outAngle) * outSpeed;
          drfVxArr[i]   = (Math.random() - 0.5) * 0.003;
          drfVyArr[i]   = 0.002 + Math.random() * 0.004;
          vxArr[i]      = expVxArr[i];
          vyArr[i]      = expVyArr[i];
          expTimeArr[i] = now;
          pState[i]     = S_EXPLODING;
        }
      }

      // Expose to GSAP useEffect via refs
      explodeFnRef.current = triggerExplosion;

      function animate() {
        if (torn) return;
        animId = requestAnimationFrame(animate);
        const now = performance.now();

        // Staggered spawn: quadratic curve over 2500ms → all 600 by end
        const gt = Math.min((now - gatherT0) / 2500, 1);
        const targetSpawned = Math.floor(MAX_P * gt * gt);
        while (spawned < targetSpawned) { initGathering(spawned); spawned++; }

        for (let i = 0; i < spawned; i++) {
          const st = pState[i];
          if (st === 0) continue;
          ageArr[i]++;

          if (st === S_GATHERING) {
            const dist = Math.sqrt(xArr[i] ** 2 + yArr[i] ** 2);
            if (dist < FROZEN_R) {
              pState[i] = S_FROZEN;
            } else {
              // Accelerate as particle approaches center
              const m = 1.0 + (1.0 - Math.min(dist / maxD, 1)) * 2.0;
              xArr[i] += vxArr[i] * m;
              yArr[i] += vyArr[i] * m;
            }

          } else if (st === S_FROZEN) {
            // Stays at center — additive blending creates hot core glow

          } else if (st === S_EXPLODING) {
            const t    = Math.min((now - expTimeArr[i]) / 1000, 1);
            const ease = t * t * (3 - 2 * t); // smoothstep velocity lerp
            vxArr[i]   = expVxArr[i] * (1 - ease) + drfVxArr[i] * ease;
            vyArr[i]   = expVyArr[i] * (1 - ease) + drfVyArr[i] * ease;
            xArr[i]   += vxArr[i];
            yArr[i]   += vyArr[i];
            if (t >= 1) pState[i] = S_DRIFTING;

          } else if (st === S_DRIFTING) {
            xArr[i] += drfVxArr[i] + Math.sin(ageArr[i] * 0.05 + wobArr[i]) * 0.0008;
            yArr[i] += drfVyArr[i];
            // Wrap: reset particles that exit the top
            if (yArr[i] > 1.2) {
              xArr[i]     = (Math.random() * 2 - 1) * aspect;
              yArr[i]     = -1.2 - Math.random() * 0.1;
              drfVxArr[i] = (Math.random() - 0.5) * 0.003;
              drfVyArr[i] = 0.002 + Math.random() * 0.004;
            }
          }

          let s = szArr[i];
          if (st === S_FROZEN) s *= 1.4; // frozen particles are slightly larger → more glow

          positions[i * 3]     = xArr[i];
          positions[i * 3 + 1] = yArr[i];
          positions[i * 3 + 2] = 0;
          gpuSizes[i] = Math.max(0, s);
        }

        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate    = true;
        renderer.render(scene, camera);
      }

      animate();

      disposeFnRef.current = () => {
        geo.dispose(); mat.dispose(); emberTex.dispose(); renderer.dispose();
      };
    })().catch(console.error);

    return () => {
      torn = true;
      cancelAnimationFrame(animId);
      disposeFnRef.current?.();
      explodeFnRef.current  = null;
      disposeFnRef.current  = null;
    };
  }, [visible]);

  // ── GSAP timeline ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    let killTl: (() => void) | null = null;
    let torn = false;

    (async () => {
      const { gsap } = await import('gsap');
      if (torn) return;

      const splash       = splashRef.current;
      const logo         = logoRef.current;
      const shockwave    = shockwaveRef.current;
      const whiteOverlay = whiteOverlayRef.current;
      if (!splash || !logo || !shockwave || !whiteOverlay) return;

      // GSAP owns logo positioning; centering via xPercent/yPercent avoids
      // inline-transform conflicts during the scale bloom.
      gsap.set(logo, {
        xPercent: -50, yPercent: -50,
        left: '50%', top: '50%',
        scale: 1, opacity: 0,
      });

      const tl = gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem('splashSeen', 'true');
          document.getElementById('splash-mask')?.remove();
          setVisible(false);
        },
      });
      killTl = () => tl.kill();

      // ── Phase 1: The Gathering (0 → 2.5s) ─────────────────────────────────
      // Particle system handles spawning; timeline just waits.
      tl.to({}, { duration: 2.5 });

      // ── Phase 2: Shockwave & Reveal (2.5 → 3.0s) ──────────────────────────
      tl
        // Trigger particle explosion exactly at 2.5s
        .call(() => explodeFnRef.current?.(performance.now()))
        // Ring grows from 0 to 200vw, fades out simultaneously
        .fromTo(
          shockwave,
          { width: 0, height: 0, opacity: 1 },
          { width: window.innerWidth * 2, height: window.innerWidth * 2,
            opacity: 0, duration: 0.5, ease: 'power2.out' }
        )
        // Logo snaps in at the same instant as the shockwave
        .set(logo, { opacity: 1 }, '<');

      // ── Phase 3: The Hold (3.0 → 4.0s) ────────────────────────────────────
      // Logo sits centered; particles drift upward.
      tl.to({}, { duration: 1.0 });

      // ── Phase 4: Bloom & Transition (4.0 → 5.2s) ──────────────────────────
      tl
        // Logo blooms outward (0.8s), orange overlay fades in simultaneously (0.6s)
        .to(logo, { scale: 15, duration: 0.8, ease: 'power3.in' })
        .to(whiteOverlay, { opacity: 1, duration: 0.6, ease: 'power2.in' }, '<')
        // At peak orange (0.6s into phase 4 = when overlay finishes):
        // cursor is at logo-end (0.8s after phase4 start); subtract 0.2s → 0.6s mark
        .call(() => {
          if (torn) return;
          window.dispatchEvent(new CustomEvent('splash-crossfade-start'));
          gsap.to(splash, { opacity: 0, duration: 0.4, ease: 'power2.out' });
        }, [], '-=0.2')
        // Hold until landing page fade-in settles
        .to({}, { duration: 0.4 }); // timeline ends at 5.2s → onComplete fires
    })().catch(console.error);

    return () => {
      torn = true;
      killTl?.();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={splashRef}
      data-splash-screen=""
      style={{
        position:        'fixed',
        inset:           0,
        background:      'radial-gradient(ellipse at bottom, #3a1200 0%, #1a0800 45%, #000000 100%)',
        zIndex:          9999,
        overflow:        'hidden',
      }}
    >
      {/* Three.js particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position:      'absolute',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Expanding shockwave ring */}
      <div
        ref={shockwaveRef}
        style={{
          position:      'absolute',
          left:          '50%',
          top:           '50%',
          width:         0,
          height:        0,
          transform:     'translate(-50%, -50%)',
          border:        '2px solid rgba(255, 200, 100, 0.9)',
          borderRadius:  '50%',
          opacity:       0,
          pointerEvents: 'none',
          zIndex:        2,
        }}
      />

      {/* White bloom overlay */}
      <div
        ref={whiteOverlayRef}
        style={{
          position:        'absolute',
          inset:           0,
          backgroundColor: '#1a0800',
          opacity:         0,
          pointerEvents:   'none',
          zIndex:          3,
        }}
      />

      {/* Phoenix logo — positioned and animated entirely by GSAP */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={logoRef}
        src={(phoenixImg as { src: string }).src}
        alt=""
        aria-hidden="true"
        style={{
          position:      'absolute',
          width:         180,
          height:        'auto',
          opacity:       0,
          mixBlendMode:  'screen',
          pointerEvents: 'none',
          userSelect:    'none',
          zIndex:        4,
        }}
      />
    </div>
  );
}
