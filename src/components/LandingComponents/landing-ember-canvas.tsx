'use client';

import { useEffect, useRef } from 'react';
import emberImg from '@/assets/logos/ember.png';

// ── Particle counts ───────────────────────────────────────────────────────────
const COUNT_RISE  = 200; // hero section — rise from bottom
const COUNT_BOUND = 80;  // seam embers at hero/stats boundary
const COUNT_FALL  = 150; // stats section — drift downward
const COUNT_FE    = 80;  // FE section — sparse rising embers

const COUNT  = COUNT_RISE + COUNT_BOUND + COUNT_FALL + COUNT_FE;
const I_BOUND = COUNT_RISE;
const I_FALL  = COUNT_RISE + COUNT_BOUND;
const I_FE    = COUNT_RISE + COUNT_BOUND + COUNT_FALL;

// ── Coordinate system (canvas spans 300vh) ────────────────────────────────────
//   y = 3  →  top of hero     (CSS: 0vh)
//   y = 2  →  hero/stats seam (CSS: 100vh)
//   y = 1  →  stats/FE seam   (CSS: 200vh)
//   y = 0  →  bottom of FE    (CSS: 300vh)
//
//   Hero  : y ∈ [2, 3]
//   Stats : y ∈ [1, 2]
//   FE    : y ∈ [0, 1]

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export default function LandingEmberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let torn   = false;

    const xArr      = new Float32Array(COUNT);
    const yArr      = new Float32Array(COUNT);
    const zArr      = new Float32Array(COUNT);
    const vxArr     = new Float32Array(COUNT);
    const vyArr     = new Float32Array(COUNT);
    const baseSize  = new Float32Array(COUNT);
    const ageArr    = new Float32Array(COUNT);
    const maxAgeArr = new Float32Array(COUNT);
    const wobbleArr = new Float32Array(COUNT);

    let aspect = window.innerWidth / window.innerHeight;

    // ── Rising embers — hero [2, 3] ────────────────────────────────────────────
    function initRising(i: number, randomAge: boolean) {
      xArr[i]      = Math.random() * aspect;
      yArr[i]      = 2.0 + Math.random() * 0.1;    // bottom 10% of hero
      zArr[i]      = (Math.random() - 0.5);
      vxArr[i]     = (Math.random() - 0.5) * 0.006;
      vyArr[i]     = 0.002 + Math.random() * 0.006; // upward
      baseSize[i]  = 7.0 + Math.random() * 24.5;
      maxAgeArr[i] = 200 + Math.floor(Math.random() * 201);
      wobbleArr[i] = Math.random() * Math.PI * 2;
      ageArr[i]    = randomAge ? Math.floor(Math.random() * maxAgeArr[i]) : 0;
    }

    // ── Boundary embers — hero/stats seam y ≈ 2.0 ─────────────────────────────
    function initBoundary(i: number, randomAge: boolean) {
      xArr[i]      = Math.random() * aspect;
      yArr[i]      = 2.0 + (Math.random() - 0.5) * 0.3; // ±15% around seam
      zArr[i]      = (Math.random() - 0.5);
      vxArr[i]     = (Math.random() - 0.5) * 0.004;
      const dir    = Math.random() < 0.5 ? 1 : -1;
      vyArr[i]     = dir * (0.001 + Math.random() * 0.003);
      baseSize[i]  = 5.25 + Math.random() * 17.5;
      maxAgeArr[i] = 150 + Math.floor(Math.random() * 151);
      wobbleArr[i] = Math.random() * Math.PI * 2;
      ageArr[i]    = randomAge ? Math.floor(Math.random() * maxAgeArr[i]) : 0;
    }

    // ── Falling embers — stats [1, 2] ──────────────────────────────────────────
    function initFalling(i: number, randomAge: boolean) {
      xArr[i]      = Math.random() * aspect;
      yArr[i]      = 2.0 - Math.random() * 0.04;   // just below hero/stats seam
      zArr[i]      = (Math.random() - 0.5);
      vxArr[i]     = (Math.random() - 0.5) * 0.006;
      vyArr[i]     = -(0.001 + Math.random() * 0.003); // downward
      baseSize[i]  = 7.0 + Math.random() * 24.5;
      maxAgeArr[i] = 200 + Math.floor(Math.random() * 201);
      wobbleArr[i] = Math.random() * Math.PI * 2;
      ageArr[i]    = randomAge ? Math.floor(Math.random() * maxAgeArr[i]) : 0;
    }

    // ── Rising embers — FE section [0, 1], sparse ──────────────────────────────
    function initFE(i: number, randomAge: boolean) {
      xArr[i]      = Math.random() * aspect;
      yArr[i]      = Math.random() * 0.1;           // bottom 10% of FE section
      zArr[i]      = (Math.random() - 0.5);
      vxArr[i]     = (Math.random() - 0.5) * 0.006;
      vyArr[i]     = 0.002 + Math.random() * 0.006; // upward
      baseSize[i]  = 5.25 + Math.random() * 17.5;   // slightly smaller → lower density
      maxAgeArr[i] = 200 + Math.floor(Math.random() * 201);
      wobbleArr[i] = Math.random() * Math.PI * 2;
      ageArr[i]    = randomAge ? Math.floor(Math.random() * maxAgeArr[i]) : 0;
    }

    // Staggered init — mid-cycle on first frame
    for (let i = 0;        i < I_BOUND; i++) initRising(i, true);
    for (let i = I_BOUND;  i < I_FALL;  i++) initBoundary(i, true);
    for (let i = I_FALL;   i < I_FE;    i++) initFalling(i, true);
    for (let i = I_FE;     i < COUNT;   i++) initFE(i, true);

    // Streak thresholds — top-10% fastest get 2× size
    const rVy = Array.from(vyArr.subarray(0, COUNT_RISE)).sort((a, b) => b - a);
    const streakRise = rVy[Math.floor(COUNT_RISE * 0.1)];

    const fVy = Array.from(vyArr.subarray(I_FALL, I_FE)).sort((a, b) => a - b);
    const streakFall = fVy[Math.floor(COUNT_FALL * 0.1)]; // most-negative 10%

    const feVy = Array.from(vyArr.subarray(I_FE)).sort((a, b) => b - a);
    const streakFE = feVy[Math.floor(COUNT_FE * 0.1)];

    const positions = new Float32Array(COUNT * 3);
    const sizes     = new Float32Array(COUNT);

    let disposeAll: () => void = () => {};

    (async () => {
      const THREE = await import('three');
      if (torn) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      aspect = w / h;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      // false: leave canvas CSS alone — width/height via style prop
      renderer.setSize(w, h * 3, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const scene  = new THREE.Scene();
      // x ∈ [0, aspect], y ∈ [0, 3]
      const camera = new THREE.OrthographicCamera(0, aspect, 3, 0, 0.1, 100);
      camera.position.z = 10;

      const emberTexture = await new THREE.TextureLoader().loadAsync(
        (emberImg as { src: string }).src
      );
      if (torn) { emberTexture.dispose(); renderer.dispose(); return; }

      for (let i = 0; i < COUNT; i++) {
        positions[i * 3]     = xArr[i];
        positions[i * 3 + 1] = yArr[i];
        positions[i * 3 + 2] = zArr[i];
        sizes[i]             = baseSize[i];
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map:        { value: emberTexture },
          pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          tint:       { value: new THREE.Color(0xd4aaff) },
        },
        vertexShader: /* glsl */`
          attribute float aSize;
          uniform   float pixelRatio;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * pixelRatio;
            gl_Position  = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */`
          uniform sampler2D map;
          uniform vec3      tint;
          void main() {
            vec4 c = texture2D(map, gl_PointCoord);
            if (c.a < 0.01) discard;
            gl_FragColor = vec4(c.rgb * tint, c.a);
          }
        `,
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      scene.add(points);

      disposeAll = () => {
        geo.dispose();
        mat.dispose();
        emberTexture.dispose();
        renderer.dispose();
      };

      function animate() {
        if (torn) return;
        animId = requestAnimationFrame(animate);

        for (let i = 0; i < COUNT; i++) {
          yArr[i] += vyArr[i];
          xArr[i] += vxArr[i];
          xArr[i] += Math.sin(ageArr[i] * 0.05 + wobbleArr[i]) * 0.0008;
          ageArr[i]++;

          let size = baseSize[i];

          if (i < I_BOUND) {
            // ── Rising — hero ─────────────────────────────────────────────────
            if (vyArr[i] >= streakRise) size *= 2;
            // nHeroY: 0 at bottom of hero (y=2), 1 at top (y=3)
            const nHeroY = yArr[i] - 2.0;
            size *= (1.0 - smoothstep(0.25, 0.55, nHeroY));
            if (ageArr[i] >= maxAgeArr[i]) initRising(i, false);

          } else if (i < I_FALL) {
            // ── Boundary — hero/stats seam y ≈ 2.0 ───────────────────────────
            const dist = Math.abs(yArr[i] - 2.0);
            size *= (1.0 - smoothstep(0.0, 0.2, dist));
            if (ageArr[i] >= maxAgeArr[i]) initBoundary(i, false);

          } else if (i < I_FE) {
            // ── Falling — stats [1, 2] ────────────────────────────────────────
            if (vyArr[i] <= streakFall) size *= 2;
            // Fade in from top of stats (y=2), fade out at bottom (y=1)
            const fadeIn  = 1.0 - smoothstep(1.85, 2.0, yArr[i]);
            const fadeOut = smoothstep(1.0, 1.15, yArr[i]);
            size *= fadeIn * fadeOut * 0.3; // stats section density reduction
            if (ageArr[i] >= maxAgeArr[i]) initFalling(i, false);

          } else {
            // ── Rising — FE section [0, 1], sparse ───────────────────────────
            if (vyArr[i] >= streakFE) size *= 2;
            // nFEY: 0 at bottom (y=0), fades before mid-section (y=0.55)
            const nFEY = yArr[i];
            size *= (1.0 - smoothstep(0.25, 0.55, nFEY));
            if (ageArr[i] >= maxAgeArr[i]) initFE(i, false);
          }

          positions[i * 3]     = xArr[i];
          positions[i * 3 + 1] = yArr[i];
          positions[i * 3 + 2] = zArr[i];
          sizes[i]             = Math.max(0, size);
        }

        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate    = true;
        renderer.render(scene, camera);
      }

      animate();
    })().catch(console.error);

    return () => {
      torn = true;
      cancelAnimationFrame(animId);
      disposeAll();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         '100%',
        height:        '300vh',
        pointerEvents: 'none',
        zIndex:        2,
      }}
    />
  );
}
