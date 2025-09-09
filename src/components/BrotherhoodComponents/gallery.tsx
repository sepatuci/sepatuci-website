import React from "react";
import Image from "next/image";
// import banner from "../../assets/community/banner.JPG"
// import check from "../../assets/community/check.JPG"
import check2 from "../../assets/community/check2.jpeg";
// import table from "../../assets/community/table.JPG";
import mhfinals from "../../assets/community/mhfinals.jpeg";
// import crescentbros from "../../assets/community/crescentbros.JPG";
import hike from "../../assets/community/hike.jpeg"
import restaurant from "../../assets/community/atRestraunt.jpeg"
import alphaog from "../../assets/community/1alphaogEdited.jpeg"



const GallerySection: React.FC = () => {
  return (
    <section className="text-gray-600 body-font">
      <div className="container px-5 py-24 mx-auto flex flex-wrap">
        <div className="flex flex-wrap md:-m-2 -m-1">
          <div className="flex flex-wrap w-1/2">
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={alphaog.src}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={require("../../assets/community/table.jpeg")}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-full">
              <Image
                alt="gallery"
                className="w-full h-full object-cover object-center block"
                src={alphaog.src}
                width={600}
                height={300}
              />
            </div>
          </div>
          <div className="flex flex-wrap w-1/2">
            <div className="md:p-2 p-1 w-full">
              <Image
                alt="gallery"
                className="w-full h-full object-cover object-center block"
                src={mhfinals.src}
                width={600}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={restaurant.src}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={check2.src}
                width={300}
                height={300}
              />
            </div>
          </div>
          <div className="flex flex-wrap w-1/2">
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={alphaog.src}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={require("../../assets/community/table.jpeg")}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-full">
              <Image
                alt="gallery"
                className="w-full h-full object-cover object-center block"
                src={require("../../assets/community/check.jpeg")}
                width={600}
                height={300}
              />
            </div>
          </div>
          <div className="flex flex-wrap w-1/2">
            <div className="md:p-2 p-1 w-full">
              <Image
                alt="gallery"
                className="w-full h-full object-cover object-center block"
                src={hike.src}
                width={600}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={require("../../assets/community/crescentbros.jpeg")}
                width={300}
                height={300}
              />
            </div>
            <div className="md:p-2 p-1 w-1/2">
              <Image
                alt="gallery"
                className="w-full object-cover h-full object-center block"
                src={check2.src}
                width={300}
                height={300}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GallerySection;
