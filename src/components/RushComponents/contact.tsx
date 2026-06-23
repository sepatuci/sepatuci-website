"use client";

import React, { useEffect, useRef } from 'react';
import { Bebas_Neue } from 'next/font/google';

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

const APPLY_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeM42jBQmowwPJBARD4k91oQr4Y1od3JlZ2HZDldDWhljAz7w/viewform?usp=header';

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const EmailIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const InstagramIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5"/>
    <circle cx="12" cy="12" r="5"/>
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const CONTACT_METHODS = [
  {
    Icon:        EmailIcon,
    title:       'Email',
    description: 'Have questions? Reach out to us',
    value:       'ucisep@gmail.com',
    href:        'mailto:ucisep@gmail.com',
  },
  {
    Icon:        InstagramIcon,
    title:       'Instagram',
    description: 'Follow us for updates and behind-the-scenes',
    value:       '@sepatuci',
    href:        'https://www.instagram.com/sepatuci/',
  },
  {
    Icon:        LinkedInIcon,
    title:       'LinkedIn',
    description: 'Connect with our professional network',
    value:       'Sigma Eta Pi at UCI',
    href:        'https://www.linkedin.com/company/sepatuci/mycompany/',
  },
];

const ContactSection: React.FC = () => {
  const cardsRef = useRef<HTMLDivElement>(null);
  const ctaRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observe = (el: HTMLElement | null, delay = 0) => {
      if (!el) return;
      const obs = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        el.querySelectorAll('[data-fade]').forEach((node, i) => {
          setTimeout(() => node.classList.add('visible'), i * 100 + delay);
        });
      }, { threshold: 0.1 });
      obs.observe(el);
      return () => obs.disconnect();
    };

    const c1 = observe(cardsRef.current);
    const c2 = observe(ctaRef.current);
    return () => { c1?.(); c2?.(); };
  }, []);

  return (
    <section style={{ padding: '80px 40px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 72 }}>
        <div style={{ fontSize: '0.85rem', color: '#7c3aed', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16 }}>
          Recruitment
        </div>
        <h1
          className={bebasNeue.className}
          style={{ fontSize: 'clamp(5rem, 8vw, 7rem)', color: '#ffffff', lineHeight: 1, marginBottom: 20, letterSpacing: '0.04em' }}
        >
          Join Our Next Rush
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
          Ready to start your entrepreneurial journey? Connect with us and stay updated on
          recruitment events.
        </p>
      </div>

      {/* Contact cards */}
      <div
        ref={cardsRef}
        style={{
          display:        'flex',
          flexWrap:       'wrap',
          justifyContent: 'center',
          gap:            24,
          maxWidth:       800,
          margin:         '0 auto 80px',
        }}
      >
        {CONTACT_METHODS.map(({ Icon, title, description, value, href }) => (
          <div
            key={title}
            data-fade
            className="fade-up dark-card"
            style={{ flex: '1 1 220px', maxWidth: 240, padding: 36, textAlign: 'center' }}
          >
            <div style={{ color: '#7c3aed', display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <Icon />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
              {title}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.5 }}>
              {description}
            </div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.95rem', color: '#7c3aed', textDecoration: 'none' }}
            >
              {value}
            </a>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        ref={ctaRef}
        style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}
      >
        <div data-fade className="fade-up">
          <h2
            className={bebasNeue.className}
            style={{ fontSize: '3.5rem', color: '#ffffff', lineHeight: 1, marginBottom: 16, letterSpacing: '0.04em' }}
          >
            Ready to Get Started?
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 32 }}>
            Applications for our next recruitment cycle will be opening soon. Follow us on social
            media to be the first to know.
          </p>
          <a href={APPLY_URL} target="_blank" rel="noopener noreferrer">
            <button
              style={{
                border:       '1px solid rgba(124, 58, 237, 0.6)',
                background:   'transparent',
                color:        '#ffffff',
                borderRadius: 8,
                padding:      '14px 40px',
                fontSize:     '1rem',
                cursor:       'pointer',
                transition:   'background 0.2s ease, border-color 0.2s ease',
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
              Get Notified
            </button>
          </a>
        </div>
      </div>

    </section>
  );
};

export default ContactSection;
