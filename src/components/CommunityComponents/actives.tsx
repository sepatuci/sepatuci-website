"use client";

import React, { Suspense, lazy, useState, useEffect } from 'react';
import teamMembers from "./TeamMembers";
import { Linkedin } from "lucide-react";

const Skeleton = () => {
  return (
    <div className="p-4 lg:w-1/5 md:w-1/2">
      <div className="h-full flex flex-col items-center text-center">
        <div className="flex-shrink-0 w-full h-56 bg-gray-300 rounded-lg mb-4 animate-pulse"></div> {/* Modified Skeleton */}
        <div className="w-full">
          <div className="bg-gray-400 h-4 w-24 mb-2 rounded animate-pulse"></div>
          <div className="bg-gray-400 h-4 w-16 mb-4 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

// Custom ImageLoader component to delay image rendering for 2 seconds and apply smooth fade-in
interface ImageLoaderProps {
  src: string;
  alt: string;
}

const ImageLoader: React.FC<ImageLoaderProps> = ({ src, alt }) => {
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowImage(true);
    }, 2000); // 2 second delay

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className={`relative w-full h-56 ${showImage ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}>
      {showImage ? (
        <img src={src} alt={alt} className="rounded-lg w-full h-full object-cover" />
      ) : (
        <Skeleton />
      )}
    </div>
  );
};

const TeamSection: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="text-2xl font-medium title-font mb-4 text-white">OUR TEAM</h1>
          <p className="lg:w-2/3 mx-auto leading-relaxed text-base text-white">
            Meet our amazing team members.
          </p>
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
