// "use client" at the top allows React hooks in the component
"use client";

import React, { Suspense, useState } from 'react';
import Image from 'next/image';  // Correct Next.js Image component import
import teamMembers from "./Members";
import { Linkedin } from "lucide-react";

const Skeleton = () => {
  return (
    <div className="p-4 lg:w-1/5 md:w-1/2 flex justify-center items-center h-screen ml-16"> {/* Add ml-4 to shift right by 4px */}
      <div className="h-full flex flex-col items-center text-center">
        {/* Image Skeleton */}
        <div className="flex-shrink-0 w-56 h-56 bg-gray-300 rounded-lg mb-4 animate-pulse"></div>
        {/* Text Skeleton */}
        <div className="w-full">
          {/* Title Skeleton */}
          <div className="bg-gray-400 h-6 w-32 mb-2 rounded animate-pulse"></div>
          {/* Description Skeleton */}
          <div className="bg-gray-400 h-4 w-24 mb-4 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};





// Custom ImageLoader component to load image with fade-in effect onLoad
interface ImageLoaderProps {
  src: string;
  alt: string;
}

const ImageLoader: React.FC<ImageLoaderProps> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative w-full h-56">
      {/* Placeholder (Skeleton or low-quality placeholder) */}
      {!isLoaded && <Skeleton />}
      <Image
        src={src}
        alt={alt}
        fill  // Proper usage of Next.js fill prop
        className={`rounded-lg transition-opacity duration-1000 ease-in-out ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoadingComplete={() => setIsLoaded(true)}  // Correct Next.js Image event
        style={{ objectFit: 'cover' }}  // CSS for objectFit
      />
    </div>
  );
};

const TeamSection: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="text-5xl font-bold title-font text-white mb-4">
            One Family
          </h1>
        </div>
        <div className="flex flex-wrap -m-4">
          {teamMembers.map((member, index) => (
            <div className="p-4 lg:w-1/5 md:w-1/2" key={index}>
              <div className="h-full flex flex-col items-center text-center">
                <Suspense fallback={<Skeleton />}>
                  <ImageLoader src={member.src} alt={member.title} />
                </Suspense>
                <div className="w-full">
                  <h2 className="title-font font-small text-lg text-white">{member.title}</h2>
                  <h3 className="text-gray-400 mb-3">{member.description}</h3>
                  <span className="inline-flex">
                    <a href={member.ctaLink} className="text-gray-500" target="_blank" rel="noopener noreferrer">
                      <Linkedin className="w-5 h-5" />
                    </a>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
