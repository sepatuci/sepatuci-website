"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import teamMembers from './Members';
import { Linkedin, Crown, Users, GraduationCap } from 'lucide-react';

interface ImageLoaderProps {
  src: string;
  alt: string;
}

const BLUR_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUG/8QAIhAAAgEDBAMBAAAAAAAAAAAAAQIDAAQRBRIhMQYTQVH/xAAVAQEBAAAAAAAAAAAAAAAAAAADBP/EABkRAAIDAQAAAAAAAAAAAAAAAAECAAMRIf/aAAwDAQACEQMRAD8A";

const ImageLoader: React.FC<ImageLoaderProps> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-muted/20">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className={`object-cover transition-all duration-700 ease-out ${
          isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
        }`}
        onLoad={() => setIsLoaded(true)}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

const TeamSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Executive Board' | 'Actives' | 'Classes'>('Executive Board');

  const tabs = {
    'Executive Board': {
      members: teamMembers.filter((member) => member.category.includes('Executive Board')),
      icon: Crown,
      description: 'Leadership team driving our vision forward'
    },
    Actives: {
      members: teamMembers.filter((member) => member.category.includes('Actives')),
      icon: Users,
      description: 'Current active members building the future'
    },
    Classes: {
      members: teamMembers.filter((member) => member.category.includes('Classes')),
      icon: GraduationCap,
      description: 'Alumni who paved the way for excellence'
    }
  };

  // Group members by class for the Classes tab
  const groupMembersByClass = () => {
    const classOrder = ['Founder Class', 'Alpha Class', 'Beta Class', 'Gamma Class', 'Delta Class', 'Epsilon Class', 'Zeta Class', 'Eta Class', 'Theta Class', 'Iota Class'];
    const grouped: { [key: string]: typeof teamMembers } = {};

    tabs.Classes.members.forEach((member) => {
      if (!grouped[member.description]) {
        grouped[member.description] = [];
      }
      grouped[member.description].push(member);
    });

    // Return classes in order
    return classOrder
      .filter(className => grouped[className])
      .map(className => ({
        className,
        members: grouped[className]
      }));
  };

  return (
    <section className="bg-background section-margin">
      <div className="content-max-width section-padding">
        {/* Header */}
        <div className="text-center mb-16 lg:mb-20">
          <h1 className="heading-1 mb-6">
            One Family
          </h1>
          <p className="body-large max-w-2xl mx-auto">
            Meet the exceptional individuals who make up our entrepreneurial community
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-12 lg:mb-16">
          <div className="flex bg-muted/30 rounded-2xl p-2 backdrop-blur-sm border border-border/50">
            {Object.entries(tabs).map(([tab, { icon: Icon, description }]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as keyof typeof tabs)}
                className={`group relative flex items-center gap-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 ${
                  activeTab === tab 
                    ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className={`w-5 h-5 transition-all duration-300 ${
                  activeTab === tab ? 'scale-110' : 'group-hover:scale-105'
                }`} />
                <span className="hidden sm:inline">{tab}</span>
                
                {/* Tooltip for mobile */}
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-card border border-border rounded-lg px-3 py-2 text-sm text-card-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none sm:hidden">
                  {tab}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Description */}
        <div className="text-center mb-12">
          <p className="body-base text-muted-foreground max-w-xl mx-auto">
            {tabs[activeTab].description}
          </p>
        </div>

        {/* Members Grid */}
        {activeTab === 'Classes' ? (
          // Grouped by class for Classes tab
          <div className="space-y-16">
            {groupMembersByClass().map((classGroup, groupIndex) => (
              <div key={classGroup.className}>
                {/* Class Header */}
                <div className="mb-8">
                  <h2 className="text-xl sm:text-2xl font-light tracking-wide text-foreground/80">
                    {classGroup.className}
                  </h2>
                </div>

                {/* Class Members Grid */}
                <div className="grid-premium grid-people">
                  {classGroup.members.map((member, index) => (
                    <div
                      key={`${member.title}-${index}`}
                      className="group"
                    >
                      <div className="card-premium card-hover h-full flex flex-col">
                        <div className="mb-2 sm:mb-4 lg:mb-6">
                          {member.src ? (
                            <ImageLoader src={member.src} alt={member.title} />
                          ) : (
                            <div className="relative w-full aspect-square bg-muted/20 rounded-2xl flex items-center justify-center">
                              <Users className="w-12 h-12 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col justify-between space-y-2 sm:space-y-4">
                          <div className="flex-1">
                            <h3 className="font-medium text-xs sm:text-sm lg:text-lg text-foreground line-clamp-2">
                              {member.title}
                            </h3>
                            <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">
                              {member.description}
                            </p>
                          </div>

                          <div className="flex justify-center pt-1 sm:pt-2">
                            {member.ctaLink && (
                              <a
                                href={member.ctaLink}
                                className="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-full bg-muted/50 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group/link"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`View ${member.title}'s LinkedIn profile`}
                              >
                                <Linkedin className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 transition-transform duration-200 group-hover/link:scale-110" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Regular grid for Executive Board and Actives
          <div className="grid-premium grid-people">
            {tabs[activeTab].members.map((member, index) => (
              <div
                key={`${member.title}-${index}`}
                className="group"
              >
                <div className="card-premium card-hover h-full flex flex-col">
                  <div className="mb-2 sm:mb-4 lg:mb-6">
                    {member.src ? (
                      <ImageLoader src={member.src} alt={member.title} />
                    ) : (
                      <div className="relative w-full aspect-square bg-muted/20 rounded-2xl flex items-center justify-center">
                        <Users className="w-12 h-12 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between space-y-2 sm:space-y-4">
                    <div className="flex-1">
                      <h3 className="font-medium text-xs sm:text-sm lg:text-lg text-foreground line-clamp-2">
                        {member.title}
                      </h3>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">
                        {member.description}
                      </p>
                    </div>

                    <div className="flex justify-center pt-1 sm:pt-2">
                      {member.ctaLink && (
                        <a
                          href={member.ctaLink}
                          className="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-full bg-muted/50 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group/link"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${member.title}'s LinkedIn profile`}
                        >
                          <Linkedin className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 transition-transform duration-200 group-hover/link:scale-110" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {tabs[activeTab].members.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
            <p className="body-base text-muted-foreground">
              No members found in this category.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default TeamSection;
