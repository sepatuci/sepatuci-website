"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import teamMembers from './Members'; // Import the members data
import { Linkedin } from 'lucide-react';

interface ImageLoaderProps {
  src: string;
  alt: string;
}

const ImageLoader: React.FC<ImageLoaderProps> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative w-full h-56">
      <Image
        src={src}
        alt={alt}
        fill
        className={`rounded-lg transition-opacity duration-1000 ease-in-out ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoadingComplete={() => setIsLoaded(true)}
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
};

const TeamSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Active' | 'Alumni'>('Active'); // Type the state

  // Define the tabs object
  const tabs = {
    Active: teamMembers.filter((member) => member.category === 'Active'),
    Alumni: teamMembers.filter((member) => member.category === 'Alumni'),
  };

  return (
    <section className="text-white body-font bg-black">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="text-5xl font-bold title-font text-white mb-4">
            One Family
          </h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          {Object.keys(tabs).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'Active' | 'Alumni')} // Cast to correct type
              className={`px-6 py-2 rounded-md mx-2 text-white ${
                activeTab === tab ? 'bg-gray-800' : 'bg-gray-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex flex-wrap -m-4">
          {tabs[activeTab].map((member, index) => (
            <div className="p-4 lg:w-1/5 md:w-1/2" key={index}>
              <div className="h-full flex flex-col items-center text-center">
                <ImageLoader src={member.src} alt={member.title} />
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
