"use client";
import React from "react";
import { StickyScroll } from "../ui/sticky-scroll-reveal";
import Image from "next/image";

import sittingOnRock from "@/assets/community/utahSittingOnRock.jpeg";

const content = [
  {
    title: "Real time changes",
    description:
      "See changes as they happen. With our platform, you can track every modification in real time. No more confusion about the latest version of your project. Say goodbye to the chaos of version control and embrace the simplicity of real-time updates.",
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
    title: "Real time changes",
    description:
      "See changes as they happen. With our platform, you can track every modification in real time. No more confusion about the latest version of your project. Say goodbye to the chaos of version control and embrace the simplicity of real-time updates.",
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
    title: "Real time changes",
    description:
      "See changes as they happen. With our platform, you can track every modification in real time. No more confusion about the latest version of your project. Say goodbye to the chaos of version control and embrace the simplicity of real-time updates.",
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
