import ZetaDemoDay from "@/assets/ZetaDemoDay.jpg";
import jessicatam from "@/assets/members/epsilon/jessicatam.jpg";

import React from "react";

const TestimonialSection: React.FC = () => {
  return (
    <section className="text-gray-600 body-font">
      <div className="container px-5 py-24 mx-auto flex flex-wrap">
        <div className="flex flex-wrap w-full">
          <div className="lg:w-2/5 md:w-1/2 md:pr-10 md:py-6">
            {[
              {
                description: "SEP led me to some of my closest friends here at UCI. This is THE place to be to find driven and hardworking people to surround yourself with.",
                iconPath: "M22 12h-4l-3 9L9 3l-3 9H2",
              },
              {
                description: "Vice migas literally kitsch +1 pok pok. Truffaut hot chicken slow-carb health goth, vape typewriter.",
                imagePath: "", // Leave empty if you want to use an icon here.
                iconPath: "M22 12h-4l-3 9L9 3l-3 9H2",
              },
              {
                description: "Coloring book narwhal glossier master cleanse umami. Salvia +1 master cleanse blog taiyaki.",
                imagePath: "",
                iconPath: "M12 22V8M5 12H2a10 10 0 0020 0h-3",
              },
              {
                description: "VHS cornhole pop-up, try-hard 8-bit iceland helvetica. Kinfolk bespoke try-hard cliche palo santo offal.",
                imagePath: "",
                iconPath: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2",
              },
              {
                description: "Pitchfork ugh tattooed scenester echo park gastropub whatever cold-pressed retro.",
                imagePath: "",
                iconPath: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3",
              },
            ].map((item, index) => (
              <div className={`flex relative ${index < 4 ? "pb-12" : ""}`} key={index}>
                <div className="h-full w-10 absolute inset-0 flex items-center justify-center">
                  {index < 4 && <div className="h-full w-1 bg-gray-200 pointer-events-none"></div>}
                </div>
                <div className="flex-shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center relative z-10">
                  {item.imagePath ? (
                    <img
                      src={item.imagePath}
                      alt={`testimonial-image-${index}`}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <svg
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                    >
                      <path d={item.iconPath}></path>
                    </svg>
                  )}
                </div>
                <div className="flex-grow pl-4">
                  <p className="leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
          <img
            className="lg:w-3/5 md:w-1/2 object-cover object-center rounded-lg md:mt-0 mt-12"
            src={ZetaDemoDay.src}
            alt="step"
          />
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
