import React from 'react';

const TeamImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  return <img alt={alt} className="flex-shrink-0 rounded-lg w-full h-56 object-cover object-center mb-4" src={src} />;
};

export default TeamImage;
