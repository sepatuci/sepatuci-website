"use client";
import React from "react";
import { InfiniteMovingCards } from "../ui/infinite-moving-cards";
import { FlipWords } from "../ui/flip-words";

import aifinals from "@/assets/community/aifinals.jpeg";
import alphaog from "@/assets/community/alphaog.jpeg";
import ball from "@/assets/community/ball.jpeg";
import banner from "@/assets/community/banner.jpeg";
import boys from "@/assets/community/boys.jpeg";
import check from "@/assets/community/check.jpeg";
import check2 from "@/assets/community/check2.jpeg";
import cookin from "@/assets/community/cookin.jpeg";
import crescentbros from "@/assets/community/crescentbros.jpeg";
import deltamerch from "@/assets/community/deltamerch.jpeg";
import empathics from "@/assets/community/empathics.jpeg";
import grouppic from "@/assets/community/grouppic.jpeg";
import hike from "@/assets/community/hike.jpeg";
import mhfinals from "@/assets/community/mhfinals.jpeg";
import prezpitch from "@/assets/community/prezpitch.jpeg";
import shake from "@/assets/community/shake.jpeg";
import table from "@/assets/community/table.jpeg";
import vnmoderators from "@/assets/community/vnmoderators.jpeg";
import web3mixer from "@/assets/community/web3mixer.jpeg";
import utahJoseJoeGabyKai from "@/assets/community/utahJoseJoeGabyKai.jpeg"

export default function Community() {
  // Convert StaticImageData to string by accessing the `src` property
  const images = [
    { image: aifinals.src, name: "aifinals", title: "aifinals" },
    { image: alphaog.src, name: "alphaog", title: "alphaog" },
    // { image: ball.src, name: "ball", title: "ball" },
    // { image: banner.src, name: "banner", title: "banner" },
    // { image: boys.src, name: "boys", title: "boys" },
    // { image: check.src, name: "check", title: "check" },
    // { image: check2.src, name: "check2", title: "check2" },
    // { image: cookin.src, name: "cookin", title: "cookin" },
    // { image: crescentbros.src, name: "crescentbros", title: "crescentbros" },
    // { image: deltamerch.src, name: "deltamerch", title: "deltamerch" },
    // { image: empathics.src, name: "empathics", title: "empathics" },
    // { image: grouppic.src, name: "grouppic", title: "grouppic" },
    // { image: hike.src, name: "hike", title: "hike" },
    // { image: mhfinals.src, name: "mhfinals", title: "mhfinals" },
    { image: utahJoseJoeGabyKai.src, name: "utahJoseJoeGabyKai", title: "utahJoseJoeGabyKai" },
    // { image: shake.src, name: "shake", title: "shake" },
    // { image: table.src, name: "table", title: "table" },
    { image: vnmoderators.src, name: "vnmoderators", title: "vnmoderators" },
    { image: web3mixer.src, name: "web3mixer", title: "web3mixer" },
  ];
  const words = ["Founders", "Innovators", "Builders"];

  return (
    
    <div className="h-[80vh] flex flex-col antialiased bg-white dark:bg-black dark:bg-grid-white/[0.05] items-center justify-center relative overflow-hidden">
      {/* <h1 className="text-center md:text-7xl sm:text-6xl text-5xl font-bold md:py-8 sm:py-6 py-6 text-white">
        Our Community
      </h1> */}
      <div className="text-4xl md:text-7xl font-normal text-neutral-600 dark:text-neutral-400">
        <FlipWords words={words} /> <br />
      </div>
      <InfiniteMovingCards items={images} direction="right" speed="slow" />
    </div>
  );
}

// StaticImageData objects (resulting from imported images) include properties like src, height, width, etc. The src property is a string that contains the image path or URL, which is what the InfiniteMovingCards component expects.
// By using image: aifinals.src, you pass the string URL to the component, satisfying its type requirements.