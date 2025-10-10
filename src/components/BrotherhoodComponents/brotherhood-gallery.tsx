"use client";

import React, { useState } from 'react';
import Image from 'next/image';

import banner from "../../assets/community/banner.jpeg";
import check2 from "../../assets/community/check2.jpeg";
import mhfinals from "../../assets/community/mhfinals.jpeg";
import crescentbros from "../../assets/community/crescentbros.jpeg";
import hike from "../../assets/community/hike.jpeg";
import restaurant from "../../assets/community/atRestraunt.jpeg";
import alphaog from "../../assets/community/1alphaogEdited.jpeg";

interface ImageLoaderProps {
  src: string;
  alt: string;
  title?: string;
}

const ImageLoader: React.FC<ImageLoaderProps> = ({ src, alt, title }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted/20 group">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className={`object-cover transition-all duration-700 ease-out group-hover:scale-105 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setIsLoaded(true)}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      {title && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
          <p className="text-white p-4 font-medium">{title}</p>
        </div>
      )}
    </div>
  );
};

const GallerySection: React.FC = () => {
  const items = [
    {
      id: 1,
      imageUrl: hike.src,
      title: "Adventure Together",
    },
    {
      id: 2,
      imageUrl: check2.src,
      title: "Community Moments",
    },
    {
      id: 3,
      imageUrl: mhfinals.src,
      title: "Celebrating Success",
    },
    {
      id: 4,
      imageUrl: restaurant.src,
      title: "Breaking Bread",
    },
    {
      id: 5,
      imageUrl: banner.src,
      title: "United We Stand",
    },
    {
      id: 6,
      imageUrl: crescentbros.src,
      title: "Brotherhood Bonds",
    },
  ];

  return (
    <section className="section-margin">
      <div className="content-max-width section-padding">
        <div className="text-center mb-16 lg:mb-20">
          <h2 className="heading-2 mb-6">
            Moments That Matter
          </h2>
          <p className="body-large max-w-2xl mx-auto">
            From adventures to achievements, these moments capture the spirit of our entrepreneurial brotherhood
          </p>
        </div>
        
        <div className="grid-premium grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="group">
              <ImageLoader 
                src={item.imageUrl}
                alt={item.title || "Brotherhood moment"}
                title={item.title}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
