"use client";
import React from "react";
import { InfiniteMovingCards } from "../components/ui/infinite-moving-cards";

import aifinals from "../assets/community/compressed/aifinals Large.jpeg";
import alphaog from "../assets/community/compressed/alphaog Large.jpeg";
import ball from "../assets/community/compressed/ball Large.jpeg";
import banner from "../assets/community/compressed/banner Large.jpeg";
import boys from "../assets/community/compressed/boys Large.jpeg";
import check from "../assets/community/compressed/check Large.jpeg";
import check2 from "../assets/community/compressed/check2 Large.jpeg";
import cookin from "../assets/community/compressed/cookin Large.jpeg";
import crescentbros from "../assets/community/compressed/crescentbros Large.jpeg";
import deltamerch from "../assets/community/compressed/deltamerch Large.jpeg";
import empathics from "../assets/community/compressed/empathics Large.jpeg";
import grouppic from "../assets/community/compressed/grouppic Large.jpeg";
import hike from "../assets/community/compressed/hike Large.jpeg";
import mhfinals from "../assets/community/compressed/mhfinals Large.jpeg";
import prezpitch from "../assets/community/compressed/prezpitch Large.jpeg";
import shake from "../assets/community/compressed/shake Large.jpeg";
import table from "../assets/community/compressed/table Large.jpeg";
import vnmoderators from "../assets/community/compressed/vnmoderators Large.jpeg";
import web3mixer from "../assets/community/compressed/web3mixer Large.jpeg";

export default function Community() {
  // Convert StaticImageData to string by accessing the `src` property
  const images = [
    { image: aifinals.src, name: "aifinals", title: "aifinals" },
    { image: alphaog.src, name: "alphaog", title: "alphaog" },
    { image: ball.src, name: "ball", title: "ball" },
    { image: banner.src, name: "banner", title: "banner" },
    { image: boys.src, name: "boys", title: "boys" },
    { image: check.src, name: "check", title: "check" },
    { image: check2.src, name: "check2", title: "check2" },
    { image: cookin.src, name: "cookin", title: "cookin" },
    { image: crescentbros.src, name: "crescentbros", title: "crescentbros" },
    { image: deltamerch.src, name: "deltamerch", title: "deltamerch" },
    { image: empathics.src, name: "empathics", title: "empathics" },
    { image: grouppic.src, name: "grouppic", title: "grouppic" },
    { image: hike.src, name: "hike", title: "hike" },
    { image: mhfinals.src, name: "mhfinals", title: "mhfinals" },
    { image: prezpitch.src, name: "prezpitch", title: "prezpitch" },
    { image: shake.src, name: "shake", title: "shake" },
    { image: table.src, name: "table", title: "table" },
    { image: vnmoderators.src, name: "vnmoderators", title: "vnmoderators" },
    { image: web3mixer.src, name: "web3mixer", title: "web3mixer" },
  ];

  return (
    <div className="h-screen flex flex-col antialiased bg-white dark:bg-black dark:bg-grid-white/[0.05] items-center justify-center relative overflow-hidden">
      <h1 className="text-center md:text-7xl sm:text-6xl text-5xl font-bold md:py-8 sm:py-6 py-6 text-white">
        Our Community
      </h1>
      <InfiniteMovingCards items={images} direction="right" speed="slow" />
    </div>
  );
}

// StaticImageData objects (resulting from imported images) include properties like src, height, width, etc. The src property is a string that contains the image path or URL, which is what the InfiniteMovingCards component expects.
// By using image: aifinals.src, you pass the string URL to the component, satisfying its type requirements.