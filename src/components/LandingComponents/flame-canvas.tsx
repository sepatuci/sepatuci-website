'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import phoenixPng from '@/assets/logos/sep_logos/sep_white.png';

// ── World-space constants ─────────────────────────────────────────────────────
// Camera z=5, FOV=60 → visible height ≈ 5.77 units, width ≈ 10.26 at 16:9
//
// Trunk base  : (4.0, -3.8) — off-screen, bottom-right
// Perch origin: (3.55, -0.6) — ~55% up the trunk
// Perch dir   : (-0.99, 0.14) normalised ≈ (-0.9901, 0.1401)
// Perch length: 2.5 units
// Perch end   : (1.075, -0.25) — where phoenix feet touch the branch
// Phoenix ctr : (1.075, 0.85) — mesh center (end + PHOENIX_SIZE/2)

const PHOENIX_SIZE = 2.2;
const PERCH_BRANCH_END_X = 3.55 + (-0.9901) * 2.5; // ≈ 1.075
const PERCH_BRANCH_END_Y = -0.6  + ( 0.1401) * 2.5; // ≈ -0.25
const PERCH_X = PERCH_BRANCH_END_X;
const PERCH_Y = PERCH_BRANCH_END_Y + PHOENIX_SIZE / 2; // ≈ 0.85

const PARTICLE_COUNT = 400;

const PARTICLE_COLORS_HEX = [0x8b3a0f, 0x6b2d0a, 0xa0470f, 0x3d1a08];

// ── Soft-dot shaders ──────────────────────────────────────────────────────────

const PARTICLE_VERT = `
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = 3.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PARTICLE_FRAG = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - 0.5) * 2.0;
    if (dist > 1.0) discard;
    float alpha = pow(1.0 - dist, 1.8) * 0.72;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onPerch?: () => void;
  flameIgniteRef?: MutableRefObject<(() => void) | null>;
}

export default function FlameCanvas({ onPerch, flameIgniteRef }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onPerchRef = useRef(onPerch);
  onPerchRef.current = onPerch;

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    let disposed = false;
    let cleanup: () => void = () => {};

    (async () => {
      const THREE = await import('three');
      const { gsap } = await import('gsap');
      const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
      const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
      const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
      const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
      const { createNoise2D } = await import('simplex-noise');

      if (disposed || !mountRef.current) return;

      const w = container.clientWidth;
      const h = container.clientHeight;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return;
      }
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
      camera.position.z = 5;

      // Bloom only affects layer 0 (tree + particles); phoenix is on layer 1
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.1, 0.5, 0.18);
      composer.addPass(bloomPass);

      // Very dim warm ambient — just enough to read the tree against the bg
      scene.add(new THREE.AmbientLight(0x3a1a08, 0.4));

      // ── Tree ─────────────────────────────────────────────────────
      // Seeded LCG for deterministic branch shape
      let _seed = 42;
      const rng = () => {
        _seed = (Math.imul(_seed, 1664525) + 1013904223) | 0;
        return (_seed >>> 0) / 4294967296;
      };

      const geos: THREE.BufferGeometry[] = [];
      const tips: THREE.Vector3[] = [];

      const mkTube = (pts: THREE.Vector3[], r: number, segs: number) => {
        const curve = new THREE.CatmullRomCurve3(pts);
        geos.push(new THREE.TubeGeometry(curve, segs, r, 5, false));
      };

      const branch = (
        sx: number, sy: number,
        dx: number, dy: number,
        len: number, r: number, depth: number
      ) => {
        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / mag, ny = dy / mag;
        // Midpoint with organic perturbation
        const mx = sx + nx * len * 0.45 + (rng() - 0.5) * len * 0.20;
        const my = sy + ny * len * 0.45 + (rng() - 0.5) * len * 0.10;
        const ex = sx + nx * len;
        const ey = sy + ny * len;
        mkTube(
          [new THREE.Vector3(sx, sy, 0), new THREE.Vector3(mx, my, 0.01 * rng()), new THREE.Vector3(ex, ey, 0)],
          Math.max(0.003, r),
          Math.max(4, Math.floor(len * 7)),
        );
        if (depth <= 0) { tips.push(new THREE.Vector3(ex, ey, 0)); return; }
        const splits = rng() > 0.35 ? 3 : 2;
        const spread = 0.38 + (4 - depth) * 0.09;
        for (let i = 0; i < splits; i++) {
          const t = splits > 1 ? i / (splits - 1) : 0.5;
          const a = (t - 0.5) * spread + (rng() - 0.5) * 0.18;
          const c = Math.cos(a), s = Math.sin(a);
          branch(ex, ey, nx * c - ny * s, nx * s + ny * c, len * (0.60 + rng() * 0.12), r * 0.60, depth - 1);
        }
      };

      // Lower trunk  (4.0, -3.8) → (3.55, -0.6)
      mkTube([
        new THREE.Vector3(4.0, -3.8, 0),
        new THREE.Vector3(3.80, -2.2, 0.01),
        new THREE.Vector3(3.55, -0.6, 0),
      ], 0.018, 12);

      // *** PERCH BRANCH ***  (3.55, -0.6) → (1.075, -0.25)
      // depth=1 so it gets a couple of small tip twigs
      branch(3.55, -0.6, -0.9901, 0.1401, 2.5, 0.012, 1);

      // Upper trunk  (3.55, -0.6) → (3.1, 2.0)
      mkTube([
        new THREE.Vector3(3.55, -0.6, 0),
        new THREE.Vector3(3.35,  0.7, 0.01),
        new THREE.Vector3(3.1,   2.0, 0),
      ], 0.014, 10);

      // Canopy from trunk top — 4 recursive groups, one sweeps far left
      branch(3.1, 2.0, -0.25, 1.0, 1.40, 0.011, 4);  // up-left, deep
      branch(3.1, 2.0,  0.20, 1.0, 1.20, 0.010, 3);  // up-right
      branch(3.1, 2.0, -0.70, 0.75, 1.55, 0.009, 3); // sweeps far left
      branch(3.1, 2.0,  0.55, 0.85, 0.90, 0.008, 2); // far right-up

      // Extra mid-junction branch going left for reach
      branch(3.55, -0.6, -0.50, 1.0, 1.10, 0.009, 3);

      const treeMat = new THREE.MeshBasicMaterial({ color: 0x150c08 });
      const treeMesh = new THREE.Mesh(mergeGeometries(geos), treeMat);
      treeMesh.layers.set(0);
      scene.add(treeMesh);

      // ── Soft-dot particles (clustered near branch tips) ───────────
      const pPositions = new Float32Array(PARTICLE_COUNT * 3);
      const pColors    = new Float32Array(PARTICLE_COUNT * 3);
      const pHomeX     = new Float32Array(PARTICLE_COUNT);
      const pHomeY     = new Float32Array(PARTICLE_COUNT);
      const pSeedX     = new Float32Array(PARTICLE_COUNT);
      const pSeedY     = new Float32Array(PARTICLE_COUNT);

      const palette = PARTICLE_COLORS_HEX.map(h => new THREE.Color(h));

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const tip = tips[Math.floor(Math.random() * tips.length)];
        const r   = Math.random() * 0.55;
        const a   = Math.random() * Math.PI * 2;
        const hx  = tip.x + Math.cos(a) * r;
        const hy  = tip.y + Math.sin(a) * r;
        pHomeX[i] = hx; pHomeY[i] = hy;
        pPositions[i * 3] = hx; pPositions[i * 3 + 1] = hy; pPositions[i * 3 + 2] = 0.05;
        const col = palette[Math.floor(Math.random() * palette.length)];
        pColors[i * 3] = col.r; pColors[i * 3 + 1] = col.g; pColors[i * 3 + 2] = col.b;
        pSeedX[i] = Math.random() * 100;
        pSeedY[i] = Math.random() * 100 + 200;
      }

      const pGeo = new THREE.BufferGeometry();
      const pPosAttr = new THREE.BufferAttribute(pPositions, 3);
      pPosAttr.setUsage(THREE.DynamicDrawUsage);
      pGeo.setAttribute('position', pPosAttr);
      pGeo.setAttribute('aColor', new THREE.BufferAttribute(pColors, 3));

      const pPoints = new THREE.Points(
        pGeo,
        new THREE.ShaderMaterial({
          vertexShader: PARTICLE_VERT,
          fragmentShader: PARTICLE_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pPoints.layers.set(0);
      scene.add(pPoints);

      // ── Phoenix sprite (layer 1 → excluded from bloom) ────────────
      const loader = new THREE.TextureLoader();
      const phoenixTex = await loader.loadAsync((phoenixPng as { src: string }).src);
      phoenixTex.colorSpace = THREE.SRGBColorSpace;

      const phoenixGeo = new THREE.PlaneGeometry(PHOENIX_SIZE, PHOENIX_SIZE);
      const phoenixMat = new THREE.MeshBasicMaterial({
        map: phoenixTex,
        transparent: true,
        alphaTest: 0.1,
        opacity: 0,
      });
      const phoenixMesh = new THREE.Mesh(phoenixGeo, phoenixMat);
      phoenixMesh.layers.set(1); // NOT included in bloom
      phoenixMesh.position.set(-4.0, -7, 0.08);
      phoenixMesh.rotation.z = 0.2;
      scene.add(phoenixMesh);

      console.log('[FlameCanvas] Perch world coords:', { x: PERCH_X, y: PERCH_Y, z: 0.08 });

      // ── Flight Bezier: bottom-left → arc peak → perch ─────────────
      const P0 = { x: -4.0, y: -7.0 };
      const P1 = { x:  0.0, y:  3.5 };
      const P2 = { x: PERCH_X, y: PERCH_Y };

      const bPos = (t: number) => {
        const mt = 1 - t;
        return {
          x: mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x,
          y: mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y,
        };
      };
      const bTan = (t: number) => ({
        x: 2 * (1 - t) * (P1.x - P0.x) + 2 * t * (P2.x - P1.x),
        y: 2 * (1 - t) * (P1.y - P0.y) + 2 * t * (P2.y - P1.y),
      });

      if (flameIgniteRef) flameIgniteRef.current = () => {};

      // ── Rise tween ────────────────────────────────────────────────
      const prog = { t: 0 };
      gsap.to(prog, {
        t: 1,
        duration: 2.4,
        delay: 0.5,
        ease: 'power2.inOut',
        onStart: () => { gsap.to(phoenixMat, { opacity: 0.60, duration: 0.55 }); },
        onUpdate: () => {
          const pos = bPos(prog.t);
          const tan = bTan(prog.t);
          phoenixMesh.position.x = pos.x;
          phoenixMesh.position.y = pos.y;
          const spd = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
          phoenixMesh.rotation.z = (-tan.x / spd) * 0.22;
        },
        onComplete: () => {
          if (disposed) return;
          gsap.to(phoenixMesh.rotation, { z: 0, duration: 0.3, ease: 'power2.out' });
          // Very subtle bob — sitting on a branch
          gsap.to(phoenixMesh.position, {
            y: PERCH_Y + 0.02,
            duration: 2.4,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
          gsap.to(phoenixMesh.scale, {
            x: 1.010,
            duration: 1.3,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
          onPerchRef.current?.();
        },
      });

      // ── Animation loop ────────────────────────────────────────────
      const noise2D = createNoise2D();
      let animId = 0;
      let lastTime = performance.now();

      const animate = () => {
        if (disposed) return;
        animId = requestAnimationFrame(animate);
        const now = performance.now();
        lastTime = now;
        const time = now / 1000;

        // Update particle positions (gentle drift around home)
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          pPositions[i * 3]     = pHomeX[i] + noise2D(pSeedX[i], time * 0.22) * 0.28;
          pPositions[i * 3 + 1] = pHomeY[i] + noise2D(pSeedY[i], time * 0.17) * 0.22
                                             + Math.sin(time * 0.35 + pSeedX[i]) * 0.07;
        }
        pPosAttr.needsUpdate = true;

        // Pass 1: render tree + particles with bloom (camera sees layer 0 only)
        camera.layers.set(0);
        composer.render();

        // Pass 2: render phoenix on top, no bloom (camera sees layer 1 only)
        renderer.clearDepth();
        renderer.autoClearColor = false;
        camera.layers.set(1);
        renderer.render(scene, camera);
        renderer.autoClearColor = true;
        camera.layers.enableAll();
      };

      animate();

      const onResize = () => {
        if (!mountRef.current) return;
        const nw = mountRef.current.clientWidth;
        const nh = mountRef.current.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
        composer.setSize(nw, nh);
      };
      window.addEventListener('resize', onResize);

      cleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        gsap.killTweensOf(prog);
        gsap.killTweensOf(phoenixMesh.position);
        gsap.killTweensOf(phoenixMesh.rotation);
        gsap.killTweensOf(phoenixMesh.scale);
        gsap.killTweensOf(phoenixMat);
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    })().catch(console.error);

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="hidden lg:block absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}
