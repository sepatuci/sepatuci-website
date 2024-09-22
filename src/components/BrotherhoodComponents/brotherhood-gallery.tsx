import React from 'react';

import banner from "../../assets/community/banner.jpeg";
import check2 from "../../assets/community/check2.jpeg";
import mhfinals from "../../assets/community/mhfinals.jpeg";
import crescentbros from "../../assets/community/crescentbros.jpeg";
import hike from "../../assets/community/hike.jpeg";
import restaurant from "../../assets/community/atRestraunt.jpeg";
import alphaog from "../../assets/community/1alphaogEdited.jpeg";

const GallerySection: React.FC = () => {
  const items = [
    {
      id: 1,
      imageUrl: hike.src,
    },
    {
      id: 2,
      imageUrl: check2.src,
    },
    {
      id: 3,
      imageUrl: mhfinals.src,
    },
    {
      id: 4,
      imageUrl: restaurant.src,
    },
    {
      id: 5,
      imageUrl: banner.src,
    },
    {
      id: 6,
      imageUrl: crescentbros.src,
    },
  ];

  return (
    <section className="text-gray-600 body-font">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-wrap -m-4">
          {items.map((item) => (
            <div key={item.id} className="lg:w-1/3 sm:w-1/2 p-4">
              <div className="relative" style={{ paddingBottom: '66.67%' }}>
                <img
                  alt="gallery"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                  src={item.imageUrl}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
