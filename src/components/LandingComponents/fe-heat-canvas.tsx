'use client';

import { useEffect, useRef } from 'react';

// ── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uBaseColor;
  varying vec2  vUv;

  // 2D value noise — all math inline, no external textures
  float hash(vec2 p) {
    vec2 k = vec2(0.3183099, 0.3678794);
    p = p * k + k.yx;
    return fract(16.0 * k.x * fract(p.x * p.y * (p.x + p.y)));
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);           // smoothstep
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Base noise (low frequency, very slow drift)
    float n1 = noise(vUv * 2.5 + uTime * 0.08);
    // Second octave (double frequency, half amplitude)
    float n2 = noise(vUv * 5.0 + uTime * 0.12) * 0.5;
    float n  = (n1 + n2) / 1.5;            // normalized to [0, 1]

    // Distort UV for heat shimmer displacement
    vec2 distortedUv = vUv + vec2(n * 0.012, n * 0.008) * uIntensity;

    // Sample color noise at distorted coords
    float colorN = noise(distortedUv * 2.5 + uTime * 0.08);

    // Subtle pulse between dark base and slightly warmer amber — effect is FELT, not seen
    vec3 warmColor  = vec3(0.24, 0.094, 0.0); // #3d1800
    vec3 finalColor = mix(uBaseColor, warmColor, colorN * 0.4);

    // Alpha = intensity so canvas fades in on hover; at 0.0 the CSS gradient shows through
    gl_FragColor = vec4(finalColor, uIntensity);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  baseColor: readonly [number, number, number];
}

export default function FEHeatCanvas({ baseColor }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Respect prefers-reduced-motion — fall back to static CSS gradient
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas  = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    let animId           = 0;
    let torn             = false;
    let targetIntensity  = 0;
    let currentIntensity = 0;
    let uTime            = Math.random() * 100; // unique start so cards are out of phase
    let disposeWebGL: (() => void) | null = null;

    // Hover is detected on the CARD element (direct parent of the wrapper)
    const card = wrapper.parentElement;
    const onEnter = () => { targetIntensity = 1; };
    const onLeave = () => { targetIntensity = 0; };
    card?.addEventListener('mouseenter', onEnter);
    card?.addEventListener('mouseleave', onLeave);

    (async () => {
      const THREE = await import('three');
      if (torn) return;

      // Each card gets its own independent renderer
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha:           true,
        antialias:       false,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const scene  = new THREE.Scene();
      // Orthographic camera that exactly fills NDC space — PlaneGeometry(2,2) covers it
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const geo = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader:   VERT,
        fragmentShader: FRAG,
        transparent:    true,
        depthWrite:     false,
        uniforms: {
          uTime:      { value: uTime },
          uIntensity: { value: 0 },
          uBaseColor: { value: new THREE.Vector3(...baseColor) },
        },
      });
      scene.add(new THREE.Mesh(geo, mat));

      // Size renderer to the card's actual pixel size
      const syncSize = () => {
        const { clientWidth: w, clientHeight: h } = wrapper;
        if (w > 0 && h > 0) {
          // false = don't override canvas CSS (we use 100%/100%)
          renderer.setSize(w, h, false);
        }
      };
      syncSize();

      const ro = new ResizeObserver(syncSize);
      ro.observe(wrapper);

      function animate() {
        if (torn) return;
        animId = requestAnimationFrame(animate);

        // Smooth lerp: 0.05 in (≈0.8s to 99%), 0.035 out (≈1.2s to 1%)
        const lerpRate = currentIntensity < targetIntensity ? 0.05 : 0.035;
        currentIntensity += (targetIntensity - currentIntensity) * lerpRate;
        if (Math.abs(targetIntensity - currentIntensity) < 0.001) {
          currentIntensity = targetIntensity;
        }

        uTime += 0.016; // ~60fps time step in seconds
        mat.uniforms.uTime.value      = uTime;
        mat.uniforms.uIntensity.value = currentIntensity;

        renderer.render(scene, camera);
      }

      animate();

      disposeWebGL = () => {
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        renderer.dispose();
      };
    })().catch(console.error);

    return () => {
      torn = true;
      cancelAnimationFrame(animId);
      card?.removeEventListener('mouseenter', onEnter);
      card?.removeEventListener('mouseleave', onLeave);
      disposeWebGL?.();
    };
  // baseColor is a stable module-level constant tuple — no re-run needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         '100%',
        height:        '100%',
        zIndex:        0,
        borderRadius:  16,
        pointerEvents: 'none',
        overflow:      'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display:       'block',
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
