"use client";
import React from "react";
import { StickyScroll } from "../ui/sticky-scroll-reveal";
import Image from "next/image";

import sittingOnRock from "@/assets/community/utahSittingOnRock.jpeg";

const content = [
  {
    title: "Innovators",
    description:
      "We build startups every quarter through our Founder's Education program to solve problems in our communities. Innovation is at the core of our mission as we work towards launching UCI's next unicorn.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={require("../../assets/community/grouppic.JPG")}
          width={800} // Increase width
          height={600} // Increase height
          className="object-cover rounded-lg" // Optional: Adjust or remove
          alt="linear board demo"
        />
      </div>
    ),
  },
  {
    title: "Creators",
    description:
      "Our startups have raised over 1M+ in VC funding, accelerator programs, competitions. We want to build startups with a real impact together and we aren't afraid to show it.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={require("../../assets/community/aifinals.JPG")}
          width={800} // Increase width
          height={600} // Increase height
          className="object-cover rounded-lg" // Optional: Adjust or remove
          alt="linear board demo"
        />
      </div>
    ),
  },
  {
    title: "Community",
    description:
      "At the core of our organization, we are a big family. We build startups together, we go on adventures together, and we push each other to new heights. At Sigma Eta Pi, it's the people that make it special.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={sittingOnRock}
          width={800} // Increase width
          height={600} // Increase height
          className="object-cover rounded-lg" // Optional: Adjust or remove
          alt="linear board demo"
        />
      </div>
    ),
  },
];

export function StickyScrollRevealDemo() {
  return (
    <div className="p-10">
      <StickyScroll content={content} />
    </div>
  );
}
