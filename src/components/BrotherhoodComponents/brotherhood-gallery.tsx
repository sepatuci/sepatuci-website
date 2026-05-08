"use client";

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Bebas_Neue } from 'next/font/google';

import banner       from "../../assets/community/banner.jpeg";
import check2       from "../../assets/community/check2.jpeg";
import mhfinals     from "../../assets/community/mhfinals.jpeg";
import crescentbros from "../../assets/community/crescentbros.jpeg";
import hike         from "../../assets/community/hike.jpeg";
import restaurant   from "../../assets/community/atRestraunt.jpeg";

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

const PHOTOS = [
  { src: hike.src,         alt: 'Brotherhood hike',             caption: 'Adventure Together' },
  { src: check2.src,       alt: 'Community moments',            caption: 'Community Moments' },
  { src: mhfinals.src,     alt: 'Celebrating finals together',  caption: 'Celebrating Success' },
  { src: restaurant.src,   alt: 'Breaking bread together',      caption: 'Breaking Bread' },
  { src: banner.src,       alt: 'SEP united',                   caption: 'United We Stand' },
  { src: crescentbros.src, alt: 'Brotherhood bonds',            caption: 'Brotherhood Bonds' },
];

// Vary heights to create the masonry feel
const HEIGHTS = ['280px', '340px', '300px', '320px', '260px', '360px'];

const GallerySection: React.FC = () => {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      container.querySelectorAll('[data-bh-item]').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 100);
      });
    }, { threshold: 0.1 });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <section style={{ padding: '80px 40px' }}>
      {/* Page header */}
      <div style={{ textAlign: 'center', marginBottom: 80 }}>
        <div style={{ fontSize: '0.85rem', color: '#c45c1a', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16 }}>
          Brotherhood
        </div>
        <h1
          className={bebasNeue.className}
          style={{ fontSize: 'clamp(5rem, 8vw, 7rem)', color: '#ffffff', lineHeight: 1, marginBottom: 20, letterSpacing: '0.04em' }}
        >
          SEP Throughout the Years
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
          Celebrating the bonds that unite our entrepreneurial family
        </p>
      </div>

      {/* Gallery label */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: '0.85rem', color: '#c45c1a', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          Moments That Matter
        </div>
      </div>

      {/* Masonry grid — CSS columns */}
      <div
        ref={gridRef}
        style={{
          columns:   3,
          gap:       '16px',
          maxWidth:  1100,
          margin:    '0 auto',
        }}
      >
        {PHOTOS.map((photo, i) => (
          <div
            key={photo.caption}
            data-bh-item
            className="fade-up bh-photo"
            style={{
              breakInside:  'avoid',
              marginBottom: 16,
              borderRadius: 12,
              overflow:     'hidden',
              display:      'block',
            }}
          >
            <div style={{ position: 'relative', width: '100%', height: HEIGHTS[i], overflow: 'hidden' }}>
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div style={{
              padding:    '10px 12px',
              fontSize:   '0.8rem',
              color:      'rgba(255,255,255,0.45)',
              fontStyle:  'italic',
              textAlign:  'center',
              background: 'rgba(0,0,0,0.6)',
            }}>
              {photo.caption}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default GallerySection;
