'use client';

import { useEffect, useRef } from 'react';
import { Bebas_Neue } from 'next/font/google';
import { motion, type Variants } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useSplashPhase } from '@/lib/splash/client/use-splash-phase';
import { heroReveal } from '@/lib/splash/timeline';
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
    bg:        'linear-gradient(135deg, #0f0528 0%, #2d1a6e 100%)',
    baseColor: [0.08, 0.04, 0.20] as const,
  },
  {
    num:       '02',
    title:     'Minimum Viable Product',
    desc:      'Build and ship your first MVP to real users',
    bg:        'linear-gradient(135deg, #080318 0%, #150d3d 100%)',
    baseColor: [0.05, 0.02, 0.15] as const,
  },
  {
    num:       '03',
    title:     'Pitch Training',
    desc:      'Master your pitch deck and present to real investors',
    bg:        'linear-gradient(135deg, #0a0320 0%, #251060 100%)',
    baseColor: [0.08, 0.03, 0.18] as const,
  },
  {
    num:       '04',
    title:     'Founder Networking',
    desc:      'Connect with VCs, mentors, and UCI alumni founders',
    bg:        'linear-gradient(135deg, #060218 0%, #150d3d 100%)',
    baseColor: [0.04, 0.02, 0.16] as const,
  },
];

// Shared photo styles. The box is fixed by its aspect ratio, so the photos
// never shift the page while they load, and they shrink to fit a phone.
const PHOTO_STYLE: React.CSSProperties = {
  width:        '100%',
  maxWidth:     420,
  height:       'auto',
  aspectRatio:  '3 / 2',
  objectFit:    'cover',
  borderRadius: 12,
  opacity:      0,
  transform:    'translateY(20px)',
  display:      'block',
  filter:       'brightness(0.85) contrast(1.05)',
  border:       '1px solid rgba(124, 58, 237, 0.2)',
  boxShadow:    '0 0 40px rgba(0, 0, 0, 0.8)',
};

// The hero logo only fades: the splash hands its own logo over onto this
// one's box, so the box must not move while that happens.
const LOGO_REVEAL = (delay: number): Variants => ({
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.4, delay, ease: 'easeOut' } },
});

/** The shared reveal with its own delay, so the lines arrive one after another. */
function delayed(variants: Variants, delay: number): Variants {
  const show = variants.show;
  if (typeof show !== 'object' || show === null) return variants;
  const transition = typeof show.transition === 'object' && show.transition !== null ? show.transition : {};
  return { ...variants, show: { ...show, transition: { ...transition, delay } } };
}

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
  // The opening splash hands over to this page: nothing here moves until it
  // says so, and on a plain navigation it says so at once.
  const { phase, reducedMotion } = useSplashPhase();
  const reveal   = heroReveal(reducedMotion);
  const revealed = phase !== 'pending' ? 'show' : 'hidden';

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

  // Stats count-up (fires once on scroll)
  useStatCountup(statsRef, [
    { ref: countStartupsRef, end: 30 },
    { ref: countFundingRef,  end: 7  },
    { ref: countMajorsRef,   end: 20 },
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
        photo1Ref.current.style.opacity    = '0.85';
        photo1Ref.current.style.transform  = 'translateY(0)';
      }
      setTimeout(() => {
        if (photo2Ref.current) {
          photo2Ref.current.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          photo2Ref.current.style.opacity    = '0.85';
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
          style={{
            position:   'relative',
            height:     '100vh',
            flexShrink: 0,
            margin:     0,
            padding:    0,
            zIndex:     1,
            background: 'radial-gradient(ellipse at bottom, #1e0a4a 0%, #0f0528 45%, #000000 100%)',
          }}
        >
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
              variants={LOGO_REVEAL(reducedMotion ? 0 : 0.1)}
              data-hero-reveal
              initial="hidden"
              animate={revealed}
            >
              <Image
                src={phoenixImg}
                alt="Sigma Eta Pi at UCI"
                width={210}
                height={210}
                priority
                data-hero-logo
                style={{ width: 210, height: 210, display: 'block', marginBottom: '24px' }}
              />
            </motion.div>

            <motion.h1
              variants={delayed(reveal, reducedMotion ? 0 : 0.1)}
              data-hero-reveal
              initial="hidden"
              animate={revealed}
              className={bebasNeue.className}
              style={{ fontSize: 'clamp(3.25rem, 6.5vw, 7rem)', lineHeight: 1.0, letterSpacing: '0.05em', marginBottom: '16px' }}
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
                UCI&apos;s Home for{' '}
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent/80 to-accent/60">
                Builders
              </span>
            </motion.h1>

            <motion.p
              variants={delayed(reveal, reducedMotion ? 0 : 0.25)}
              data-hero-reveal
              initial="hidden"
              animate={revealed}
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
            background:     'radial-gradient(ellipse at top, #1e0a4a 0%, #0f0528 45%, #000000 100%)',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          {/* Stats row: wraps on a phone instead of running off the edge */}
          <div
            style={{
              display:        'flex',
              flexDirection:  'row',
              flexWrap:       'wrap',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            'clamp(2rem, 6vw, 8rem)',
              rowGap:         '2.5rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(3.5rem, 6vw, 7rem)', fontWeight: 700, color: '#7c3aed', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(124, 58, 237, 0.6)' }}>
                <span ref={countStartupsRef}>0</span><span>+</span>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Startups Launched
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(3.5rem, 6vw, 7rem)', fontWeight: 700, color: '#7c3aed', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(124, 58, 237, 0.6)' }}>
                <span>$</span><span ref={countFundingRef}>0</span><span>M+</span>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Funding Raised
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 'clamp(3.5rem, 6vw, 7rem)', fontWeight: 700, color: '#7c3aed', lineHeight: 1, marginBottom: '0.75rem', textShadow: '0 0 40px rgba(124, 58, 237, 0.6)' }}>
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
              flexWrap:       'wrap',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '32px',
              marginTop:      '64px',
              width:          '100%',
            }}
          >
            <Image
              ref={photo1Ref}
              src={communityPhoto1}
              alt="SEP community"
              width={420}
              height={280}
              sizes="(max-width: 640px) 100vw, 420px"
              style={PHOTO_STYLE}
            />
            <Image
              ref={photo2Ref}
              src={communityPhoto2}
              alt="SEP community"
              width={420}
              height={280}
              sizes="(max-width: 640px) 100vw, 420px"
              style={PHOTO_STYLE}
            />
          </div>
        </section>

        {/* ── Quote section ─────────────────────────────────────────── */}
        <section
          style={{
            position:       'relative',
            minHeight:      '100vh',
            flexShrink:     0,
            margin:         0,
            padding:        '100px 40px',
            boxSizing:      'border-box',
            zIndex:         1,
            background:     'radial-gradient(ellipse at bottom, #1e0a4a 0%, #0f0528 45%, #000000 100%)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
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

          <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative', zIndex: 1, textAlign: 'center' }}>
            {/* Quotation mark */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="rgba(124, 58, 237, 0.4)"
              viewBox="0 0 975.036 975.036"
              style={{ width: 48, height: 48, marginBottom: 48, display: 'inline-block' }}
            >
              <path d="M925.036 57.197h-304c-27.6 0-50 22.4-50 50v304c0 27.601 22.4 50 50 50h145.5c-1.9 79.601-20.4 143.3-55.4 191.2-27.6 37.8-69.399 69.1-125.3 93.8-25.7 11.3-36.8 41.7-24.8 67.101l36 76c11.6 24.399 40.3 35.1 65.1 24.399 66.2-28.6 122.101-64.8 167.7-108.8 55.601-53.7 93.7-114.3 114.3-181.9 20.601-67.6 30.9-159.8 30.9-276.8v-239c0-27.599-22.401-50-50-50zM106.036 913.497c65.4-28.5 121-64.699 166.9-108.6 56.1-53.7 94.4-114.1 115-181.2 20.6-67.1 30.899-159.6 30.899-277.5v-239c0-27.6-22.399-50-50-50h-304c-27.6 0-50 22.4-50 50v304c0 27.601 22.4 50 50 50h145.5c-1.9 79.601-20.4 143.3-55.4 191.2-27.6 37.8-69.4 69.1-125.3 93.8-25.7 11.3-36.8 41.7-24.8 67.101l35.9 75.8c11.601 24.399 40.501 35.2 65.301 24.399z" />
            </svg>

            <p style={{
              fontSize:   'clamp(1.1rem, 2.2vw, 1.45rem)',
              color:      'rgba(255,255,255,0.82)',
              lineHeight: 1.85,
              fontWeight: 300,
              marginBottom: 48,
            }}>
              Every startup at inception was a solution to a problem. But what comes after that?
              <br /><br />
              We started Sigma Eta Pi with a singular goal of uniting the entrepreneurial spirit of UCI under one roof.
              We believed that innovation was a product of deep collaboration and a tight-knit community.
              We didn&apos;t want to just nurture individual creativity — we wanted to unite thinkers, doers,
              and creators to push each other beyond their own boundaries. And in that process, create something
              that left a lasting impact, not only on themselves, but on the world around them.
              <br /><br />
              Sigma Eta Pi is the place that people come to when they want to build with the brightest and most
              innovative minds at UCI. Our mission, as it has always been, is to empower students to pursue their
              entrepreneurial dreams. Maybe you&apos;re the next one…
            </p>

            <div style={{
              width:       40,
              height:      2,
              background:  'rgba(124, 58, 237, 0.6)',
              margin:      '0 auto 24px',
              borderRadius: 2,
            }} />

            <div
              className={bebasNeue.className}
              style={{ fontSize: '2rem', color: '#ffffff', letterSpacing: '0.1em', marginBottom: 6 }}
            >
              Ayaan Dhir
            </div>
            <div style={{ fontSize: '0.9rem', color: 'rgba(124, 58, 237, 0.8)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Alpha Class · Co-Founder
            </div>
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
            background:     'radial-gradient(ellipse at top, #1e0a4a 0%, #0f0528 45%, #000000 100%)',
          }}
        >

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
                  color:         '#7c3aed',
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
                        color:         'rgba(124, 58, 237, 0.2)',
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
                color:         '#7c3aed',
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
                    border:      '1px solid rgba(124, 58, 237, 0.6)',
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
                    b.style.background   = 'rgba(124, 58, 237, 0.15)';
                    b.style.borderColor  = '#7c3aed';
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background   = 'transparent';
                    b.style.borderColor  = 'rgba(124, 58, 237, 0.6)';
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
