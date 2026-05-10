"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Bebas_Neue } from 'next/font/google';
import teamMembers from './Members';

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

// ── LinkedIn SVG icon ─────────────────────────────────────────────────────────
const LinkedInIcon = () => (
  <svg
    width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

// ── Member card ───────────────────────────────────────────────────────────────
interface Member {
  title: string;
  description: string;
  src?: string;
  ctaLink?: string;
  category: string;
}

const MemberCard: React.FC<{ member: Member }> = ({ member }) => (
  <div
    data-people-card
    className="people-card"
    style={{
      backgroundColor: 'rgba(255,255,255,0.03)',
      border:          '1px solid rgba(124, 58, 237, 0.15)',
      borderRadius:    16,
      overflow:        'hidden',
    }}
  >
    {/* Photo */}
    <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', overflow: 'hidden' }}>
      {member.src ? (
        <Image
          src={member.src}
          alt={member.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
          className="people-card-photo"
          style={{ objectFit: 'cover', objectPosition: 'top', filter: 'brightness(0.9) contrast(1.05)' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </div>
      )}
    </div>

    {/* Info */}
    <div style={{ padding: '16px 20px 4px' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>
        {member.title}
      </div>
    </div>
    <div style={{ padding: '0 20px 12px', fontSize: '0.85rem', color: '#7c3aed' }}>
      {member.description}
    </div>

    {/* LinkedIn — omitted when ctaLink is absent */}
    {member.ctaLink ? (
      <div style={{ padding: '0 20px 20px' }}>
        <a
          href={member.ctaLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${member.title} on LinkedIn`}
          style={{
            display:    'inline-block',
            color:      'rgba(255,255,255,0.4)',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#7c3aed')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          <LinkedInIcon />
        </a>
      </div>
    ) : (
      <div style={{ height: 40 }} /> /* spacer so cards have consistent height */
    )}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const TeamSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Executive Board' | 'Actives' | 'Classes'>('Executive Board');
  const gridRef = useRef<HTMLDivElement>(null);

  const tabs = {
    'Executive Board': {
      members:     teamMembers.filter(m => m.category.includes('Executive Board')),
      description: 'Leadership team driving our vision forward',
    },
    Actives: {
      members:     teamMembers.filter(m => m.category.includes('Actives')),
      description: 'Current active members building the future',
    },
    Classes: {
      members:     teamMembers.filter(m => m.category.includes('Classes')),
      description: 'Alumni who paved the way for excellence',
    },
  };

  const classOrder = [
    'Founder Class','Alpha Class','Beta Class','Gamma Class',
    'Delta Class','Epsilon Class','Zeta Class','Eta Class','Theta Class','Iota Class',
  ];

  const groupedClasses = () => {
    const grouped: Record<string, typeof teamMembers> = {};
    tabs.Classes.members.forEach(m => {
      if (!grouped[m.description]) grouped[m.description] = [];
      grouped[m.description].push(m);
    });
    return classOrder
      .filter(c => grouped[c])
      .map(c => ({ className: c, members: grouped[c] }));
  };

  // Staggered fade-in on scroll — re-runs on tab change so new cards animate in
  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const cards = Array.from(container.querySelectorAll('[data-people-card]'));
      cards.forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 80);
      });
    }, { threshold: 0 });

    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTab]);

  const GRID_STYLE: React.CSSProperties = {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap:                 24,
  };

  return (
    <section style={{ padding: '64px 40px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            fontSize:      '0.85rem',
            color:         '#7c3aed',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            marginBottom:  16,
          }}>
            Our Community
          </div>
          <h1
            className={bebasNeue.className}
            style={{
              fontSize:      'clamp(5rem, 8vw, 8rem)',
              color:         '#ffffff',
              lineHeight:    1,
              marginBottom:  20,
              letterSpacing: '0.04em',
            }}
          >
            One Family
          </h1>
          <p style={{
            fontSize:   '1.1rem',
            color:      'rgba(255,255,255,0.6)',
            maxWidth:   600,
            margin:     '0 auto',
            lineHeight: 1.7,
          }}>
            Meet the exceptional individuals who make up our entrepreneurial community
          </p>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
          {(['Executive Board', 'Actives', 'Classes'] as const).map(tab => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding:         '10px 28px',
                  borderRadius:    8,
                  border:          active ? '1px solid #7c3aed' : '1px solid rgba(124, 58, 237, 0.3)',
                  background:      active ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                  color:           active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  fontSize:        '0.9rem',
                  cursor:          'pointer',
                  transition:      'all 0.2s ease',
                  whiteSpace:      'nowrap',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124, 58, 237, 0.6)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124, 58, 237, 0.3)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                  }
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Section label ───────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={{
            fontSize:    '0.9rem',
            color:       'rgba(255,255,255,0.45)',
            fontStyle:   'italic',
          }}>
            {tabs[activeTab].description}
          </p>
        </div>

        {/* ── Cards ───────────────────────────────────────────────────── */}
        <div ref={gridRef}>
          {activeTab === 'Classes' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
              {groupedClasses().map(group => (
                <div key={group.className}>
                  <h2 style={{
                    fontSize:      '1.1rem',
                    fontWeight:    300,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color:         'rgba(255,255,255,0.4)',
                    marginBottom:  24,
                  }}>
                    {group.className}
                  </h2>
                  <div style={GRID_STYLE}>
                    {group.members.map((member, i) => (
                      <MemberCard key={`${member.title}-${i}`} member={member} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={GRID_STYLE}>
              {tabs[activeTab].members.map((member, i) => (
                <MemberCard key={`${member.title}-${i}`} member={member} />
              ))}
            </div>
          )}
        </div>

        {/* Empty state */}
        {tabs[activeTab].members.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1rem' }}>
              No members found in this category.
            </p>
          </div>
        )}

      </div>
    </section>
  );
};

export default TeamSection;
