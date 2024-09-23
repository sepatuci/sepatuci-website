import React from 'react';

import Postcard from '@/assets/rush-fall-2024/updated-schedule.png';

const SectionComponent: React.FC = () => {
  return (
    <section className="text-gray-600 body-font">
        <div className="lg:w-2/3 mx-auto">
          <div className="flex flex-wrap w-full bg-black-100 py-32 px-10 relative mb-4">
            <img
              alt="gallery"
              className="w-full h-auto object-contain block relative"
              src={Postcard.src}
            />
          </div>
        </div>
    </section>
  );
};

export default SectionComponent;
