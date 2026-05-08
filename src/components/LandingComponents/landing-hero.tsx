'use client';

import { useEffect, useRef } from 'react';
import { Bebas_Neue } from 'next/font/google';
import { motion } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import phoenixImg from '@/assets/logos/sep_logos/sep_white.png';
import communityPhoto1 from '@/assets/community/check2.jpeg';
import communityPhoto2 from '@/assets/community/check.jpeg';
// Startup logos for FE section
import logoBonsai      from '@/assets/logos/bonsai logo icon.png';
import logoBookit      from '@/assets/logos/bookit.png';
import logoCartello    from '@/assets/logos/cartello logo name.png';
import logoClearly     from '@/assets/logos/clearly logo color.png';
import logoDiba        from '@/assets/logos/diBa logo white.png';
import logoDisko       from '@/assets/logos/disko logo.png';
import logoIdefy       from '@/assets/logos/idefy logo color.png';
import logoLendopoly   from '@/assets/logos/lendopoly logo with name.png';
import logoLighthouse  from '@/assets/logos/lighthouse logo yellow.png';
import logoPuerta      from '@/assets/logos/puerta abierta logo.png';
import logoRecreate    from '@/assets/logos/recreate energy logo .png';
import logoSoundsense  from '@/assets/logos/soundsense logo color.png';
import logoSurplus     from '@/assets/logos/surplus logo.png';
import logoThrust      from '@/assets/logos/thrust aeronautics logo color.png';
import logoVango       from '@/assets/logos/vango.png';
import logoWastewise   from '@/assets/logos/wastewise logo.png';

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

const LandingEmberCanvas = dynamic(() => import('./landing-ember-canvas'), { ssr: false });
const FEHeatCanvas       = dynamic(() => import('./fe-heat-canvas'),       { ssr: false });

const STARTUP_LOGOS = [
  { src: (logoBonsai     as { src: string }).src, name: 'Bonsai' },
  { src: (logoBookit     as { src: string }).src, name: 'Bookit' },
  { src: (logoCartello   as { src: string }).src, name: 'Cartello' },
  { src: (logoClearly    as { src: string }).src, name: 'Clearly' },
  { src: (logoDiba       as { src: string }).src, name: 'Diba' },
  { src: (logoDisko      as { src: string }).src, name: 'Disko' },
  { src: (logoIdefy      as { src: string }).src, name: 'Idefy' },
  { src: (logoLendopoly  as { src: string }).src, name: 'Lendopoly' },
  { src: (logoLighthouse as { src: string }).src, name: 'Lighthouse' },
  { src: (logoPuerta     as { src: string }).src, name: 'Puerta' },
  { src: (logoRecreate   as { src: string }).src, name: 'Recreate' },
  { src: (logoSoundsense as { src: string }).src, name: 'Soundsense' },
  { src: (logoSurplus    as { src: string }).src, name: 'Surplus' },
  { src: (logoThrust     as { src: string }).src, name: 'Thrust' },
  { src: (logoVango      as { src: string }).src, name: 'Vango' },
  { src: (logoWastewise  as { src: string }).src, name: 'Wastewise' },
];

const FE_CARDS = [
  {
    num:       '01',
    title:     'Problem Discovery',
    desc:      'Learn to identify real problems worth solving in your community',
    bg:        'linear-gradient(135deg, #1a0800 0%, #2d1200 100%)',
    baseColor: [0.10, 0.03, 0.00] as const,
  },
  {
    num:       '02',
    title:     'Minimum Viable Product',
    desc:      'Build and ship your first MVP to real users',
    bg:        'linear-gradient(135deg, #0d0800 0%, #1a0f00 100%)',
    baseColor: [0.05, 0.03, 0.00] as const,
  },
  {
    num:       '03',
    title:     'Pitch Training',
    desc:      'Master your pitch deck and present to real investors',
    bg:        'linear-gradient(135deg, #1a0500 0%, #2a0e00 100%)',
    baseColor: [0.10, 0.02, 0.00] as const,
  },
  {
    num:       '04',
    title:     'Founder Networking',
    desc:      'Connect with VCs, mentors, and UCI alumni founders',
    bg:        'linear-gradient(135deg, #0a0a00 0%, #1a1200 100%)',
    baseColor: [0.04, 0.04, 0.00] as const,
  },
];

// Shared photo styles
const PHOTO_STYLE: React.CSSProperties = {
  width:          420,
  height:         280,
  objectFit:      'cover',
  borderRadius:   12,
  opacity:        0,
  transform:      'translateY(20px)',
  display:        'block',
  mixBlendMode:   'luminosity',
  filter:         'brightness(0.7) contrast(1.1) sepia(0.3)',
  border:         '1px solid rgba(196, 92, 26, 0.2)',
  boxShadow:      '0 0 40px rgba(0, 0, 0, 0.8)',
};

// Count-up fires once per component lifetime when stats section enters viewport
function useStatCountup(
  statsRef: React.RefObject<HTMLElement | null>,
  targets: Array<{ ref: React.RefObject<HTMLSpanElement | null>; end: number }>
) {
  const hasAnimated = useRef(false);
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || hasAnimated.current) return;
      hasAnimated.current = true;
      const DURATION = 1200;
      const t0 = performance.now();
      const tick = (now: number) => {
        const raw   = Math.min((now - t0) / DURATION, 1);
        const eased = 1 - Math.pow(1 - raw, 3);
        targets.forEach(({ ref, end }) => {
          if (ref.current) ref.current.textContent = String(Math.round(eased * end));
        });
        if (raw < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function LandingHero() {
  const heroRef        = useRef<HTMLElement>(null);
  const heatOverlayRef = useRef<HTMLDivElement>(null);
  const statsRef       = useRef<HTMLElement>(null);
  const photoRowRef    = useRef<HTMLDivElement>(null);
  const photo1Ref      = useRef<HTMLImageElement>(null);
  const photo2Ref      = useRef<HTMLImageElement>(null);
  // FE section refs
  const feHeaderRef    = useRef<HTMLDivElement>(null);
  const feCardsRef     = useRef<HTMLDivElement>(null);
  const feCard0Ref     = useRef<HTMLDivElement>(null);
  const feCard1Ref     = useRef<HTMLDivElement>(null);
  const feCard2Ref     = useRef<HTMLDivElement>(null);
  const feCard3Ref     = useRef<HTMLDivElement>(null);
  const feLogoStripRef = useRef<HTMLDivElement>(null);

  const countStartupsRef = useRef<HTMLSpanElement>(null);
  const countFundingRef  = useRef<HTMLSpanElement>(null);
  const countMajorsRef   = useRef<HTMLSpanElement>(null);

  // Crossfade from splash
  useEffect(() => {
    const splashIsShowing = !sessionStorage.getItem('splashSeen');
    if (!splashIsShowing) return;
    if (heroRef.current) heroRef.current.style.opacity = '0';
    const handleCrossfade = async () => {
      const { gsap } = await import('gsap');
      if (heroRef.current) gsap.to(heroRef.current, { opacity: 1, duration: 0.5, ease: 'power2.out' });
      if (heatOverlayRef.current) {
        gsap.fromTo(heatOverlayRef.current,
          { opacity: 0.8 },
          { opacity: 0, duration: 0.8, ease: 'power2.out' }
        );
      }
    };
    window.addEventListener('splash-crossfade-start', handleCrossfade);
    return () => window.removeEventListener('splash-crossfade-start', handleCrossfade);
  }, []);

  // Stats count-up (fires once on scroll)
  useStatCountup(statsRef, [
    { ref: countStartupsRef, end: 20 },
    { ref: countFundingRef,  end: 1  },
    { ref: countMajorsRef,   end: 15 },
  ]);

  // Photo fade-in on scroll — staggered, fires once
  useEffect(() => {
    const el = photoRowRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      if (photo1Ref.current) {
        photo1Ref.current.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        photo1Ref.current.style.opacity    = '0.75';
        photo1Ref.current.style.transform  = 'translateY(0)';
      }
      setTimeout(() => {
        if (photo2Ref.current) {
          photo2Ref.current.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          photo2Ref.current.style.opacity    = '0.75';
          photo2Ref.current.style.transform  = 'translateY(0)';
        }
      }, 200);
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // FE header fade-in
  useEffect(() => {
    const el = feHeaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      el.classList.add('is-visible');
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // FE cards staggered fade-in
  useEffect(() => {
    const el = feCardsRef.current;
    if (!el) return;
    const cardRefs = [feCard0Ref, feCard1Ref, feCard2Ref, feCard3Ref];
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      cardRefs.forEach((ref, i) => {
        setTimeout(() => ref.current?.classList.add('is-visible'), i * 150);
      });
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FE logo strip fade-in
  useEffect(() => {
    const el = feLogoStripRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      el.classList.add('is-visible');
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* ── Wrapper: canvas spans all three sections ─────────────────── */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Single canvas, 300vh tall, behind all sections */}
        <LandingEmberCanvas />

        {/* ── Hero section (100vh) ─────────────────────────────────── */}
        <section
          ref={heroRef}
          style={{
            position:   'relative',
            height:     '100vh',
            flexShrink: 0,
            margin:     0,
            padding:    0,
            zIndex:     1,
            background: 'radial-gradient(ellipse at bottom, #3a1200 0%, #1a0800 45%, #000000 100%)',
          }}
        >
          <div
            ref={heatOverlayRef}
            style={{
              position:        'absolute',
              inset:           0,
              backgroundColor: '#c45c1a',
              opacity:         0,
              pointerEvents:   'none',
              zIndex:          5,
            }}
          />

          <div
            style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              textAlign:      'center',
              zIndex:         10,
              padding:        '0 2rem',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={(phoenixImg as { src: string }).src}
                alt="Sigma Eta Pi at UCI"
                style={{ width: 210, height: 'auto', display: 'block', marginBottom: '24px' }}
              />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.22 }}
              className={bebasNeue.className}
              style={{ fontSize: 'clamp(6rem, 6.5vw, 7rem)', lineHeight: 1.0, letterSpacing: '0.05em', marginBottom: '16px' }}
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
                UCI&apos;s Home for{' '}
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent/80 to-accent/60">
                Builders
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.34 }}
              style={{
                fontSize:   '1.15rem',
                color:      'rgba(255,255,255,0.6)',
                maxWidth:   '560px',
                lineHeight: 1.7,
                textAlign:  'center',
              }}
            >
              Build your first product. Scale your next idea. SEP gives you the people and
              momentum to make it real.
            </motion.p>
          </div>
        </section>

        {/* ── Stats section (min-height 100vh, expands for photos) ──── */}
        <section
          ref={statsRef}
          style={{
            position:       'relative',
            minHeight:      '100vh',
            flexShrink:     0,
            margin:         0,
            padding:        '80px 2rem',
            boxSizing:      'border-box',
            zIndex:         1,
            background:     'radial-gradient(ellipse at top, #3a1200 0%, #1a0800 45%, #000000 100%)',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          {/* Stats row */}
          <div
            style={{
              display:        'flex',
              flexDirection:  'row',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            'clamp(3rem, 8vw, 8rem)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(5rem, 6vw, 7rem)', fontWeight: 700, color: '#c45c1a', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(196, 92, 26, 0.6)' }}>
                <span ref={countStartupsRef}>0</span><span>+</span>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Startups Launched
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(5rem, 6vw, 7rem)', fontWeight: 700, color: '#c45c1a', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(196, 92, 26, 0.6)' }}>
                <span>$</span><span ref={countFundingRef}>0</span><span>M+</span>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Funding Raised
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(5rem, 6vw, 7rem)', fontWeight: 700, color: '#c45c1a', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(196, 92, 26, 0.6)' }}>
                <span ref={countMajorsRef}>0</span><span>+</span>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Majors
              </div>
            </div>
          </div>

          {/* Community photos row */}
          <div
            ref={photoRowRef}
            style={{
              display:        'flex',
              flexDirection:  'row',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '32px',
              marginTop:      '64px',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={photo1Ref} src={(communityPhoto1 as { src: string }).src} alt="SEP community" style={PHOTO_STYLE} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={photo2Ref} src={(communityPhoto2 as { src: string }).src} alt="SEP community" style={PHOTO_STYLE} />
          </div>
        </section>

        {/* ── Founder's Education section ───────────────────────────── */}
        <section
          style={{
            position:       'relative',
            minHeight:      '100vh',
            flexShrink:     0,
            margin:         0,
            padding:        '100px 40px 80px',
            boxSizing:      'border-box',
            zIndex:         1,
            background:     'radial-gradient(ellipse at bottom, #3a1200 0%, #1a0800 45%, #000000 100%)',
          }}
        >
          {/* Black fade from stats section above */}
          <div style={{
            position:      'absolute',
            top:           0,
            left:          0,
            right:         0,
            height:        '20%',
            background:    'linear-gradient(to bottom, #000000 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex:        0,
          }} />

          <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>

            {/* Section header */}
            <div
              ref={feHeaderRef}
              className="fe-animate"
              style={{ textAlign: 'center', marginBottom: 72 }}
            >
              <h2
                className={bebasNeue.className}
                style={{
                  fontSize:      'clamp(5rem, 8vw, 8rem)',
                  color:         '#c45c1a',
                  lineHeight:    1,
                  marginBottom:  24,
                  letterSpacing: '0.04em',
                }}
              >
                Founder&apos;s Education
              </h2>
              <p style={{
                fontSize:   '1.1rem',
                color:      'rgba(255,255,255,0.6)',
                maxWidth:   600,
                margin:     '0 auto',
                lineHeight: 1.7,
              }}>
                An 8-week program where you learn to think and build like an entrepreneur.
                FE gives you the framework to go from idea to launch.
              </p>
            </div>

            {/* Curriculum cards — 2×2 grid */}
            <div
              ref={feCardsRef}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 80 }}
            >
              {FE_CARDS.map((card, i) => {
                const cardRef = [feCard0Ref, feCard1Ref, feCard2Ref, feCard3Ref][i];
                return (
                  <div
                    key={card.num}
                    ref={cardRef}
                    className="fe-card-v2"
                    style={{ background: card.bg }}
                  >
                    {/* Heat distortion canvas — z=0, behind all card content */}
                    <FEHeatCanvas baseColor={card.baseColor} />

                    {/* Ghosted decorative number — z=1, above canvas */}
                    <div
                      className={bebasNeue.className}
                      style={{
                        position:      'absolute',
                        top:           12,
                        left:          20,
                        zIndex:        1,
                        fontSize:      '5rem',
                        color:         'rgba(196, 92, 26, 0.2)',
                        lineHeight:    1,
                        userSelect:    'none',
                        pointerEvents: 'none',
                      }}
                    >
                      {card.num}
                    </div>
                    {/* Content — z=1, above canvas */}
                    <div style={{ position: 'relative', zIndex: 1, marginTop: '3rem' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                        {card.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Startups logo slider */}
            <div ref={feLogoStripRef} className="fe-logo-strip" style={{ marginBottom: 64 }}>
              <div style={{
                textAlign:     'center',
                marginBottom:  32,
                fontSize:      '0.85rem',
                color:         '#c45c1a',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
              }}>
                Startups We&apos;ve Built
              </div>
              <div style={{
                overflow:        'hidden',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                maskImage:       'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
              }}>
                <div style={{
                  display:    'flex',
                  gap:        '48px',
                  alignItems: 'center',
                  width:      'max-content',
                  animation:  'logo-scroll 50s linear infinite',
                }}>
                  {[...STARTUP_LOGOS, ...STARTUP_LOGOS].map((logo, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={logo.src}
                      alt={logo.name}
                      className="fe-logo"
                      style={{ height: 48, width: 'auto', opacity: 0.7, filter: 'brightness(0) invert(1)' }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center' }}>
              <Link href="/founderseducation">
                <button
                  style={{
                    border:      '1px solid rgba(196, 92, 26, 0.6)',
                    background:  'transparent',
                    color:       '#ffffff',
                    borderRadius: 8,
                    padding:     '14px 32px',
                    fontSize:    '1rem',
                    cursor:      'pointer',
                    transition:  'background 0.2s ease, border-color 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background   = 'rgba(196, 92, 26, 0.15)';
                    b.style.borderColor  = '#c45c1a';
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background   = 'transparent';
                    b.style.borderColor  = 'rgba(196, 92, 26, 0.6)';
                  }}
                >
                  Learn More About FE →
                </button>
              </Link>
            </div>

          </div>
        </section>

      </div>{/* end wrapper */}
    </>
  );
}
