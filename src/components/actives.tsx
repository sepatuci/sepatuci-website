"use client";

import React, { Suspense, lazy } from 'react';
import teamMembers from './TeamMembers';
import { Linkedin } from 'lucide-react';

const Skeleton = () => {
  return (
    <div className="p-4 lg:w-1/5 md:w-1/2">
      <div className="h-full flex flex-col items-center text-center">
        <div className="flex-shrink-0 rounded-lg w-full h-56 bg-gray-300 mb-4"></div>
        <div className="w-full">
          <div className="bg-gray-400 h-4 w-24 mb-2 rounded"></div>
          <div className="bg-gray-400 h-4 w-16 mb-4 rounded"></div>
        </div>
      </div>
    </div>
  );
};

// Lazy load team member images to allow suspense to show the skeleton
const TeamImage = lazy(() => import('./TeamImage')); // Assuming you moved the image component to a new file TeamImage.tsx

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
          <Suspense fallback={<Skeleton />}>
            {teamMembers.map((member, index) => (
              <div className="p-4 lg:w-1/5 md:w-1/2" key={index}>
                <div className="h-full flex flex-col items-center text-center">
                  <Suspense fallback={<Skeleton />}>
                    <TeamImage src={member.src} alt={member.title} />
                  </Suspense>
                  <div className="w-full">
                    <h2 className="title-font font-medium text-lg text-white">{member.title}</h2>
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
          </Suspense>
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
