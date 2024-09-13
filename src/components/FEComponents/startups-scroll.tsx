"use client";
import React from "react";
import { StartupsInfiniteMovingCards } from "../ui/startups-infinite-moving-cards";

import bonsai from "@/assets/logos/bonsai logo icon.png";
import bookit from "@/assets/logos/bookit.png";
import cartello from "@/assets/logos/cartello logo name.png";
import clearly from "@/assets/logos/clearly logo color.png";
import diba from "@/assets/logos/diBa logo white.png";
import disko from "@/assets/logos/disko logo.png";
import idefy from "@/assets/logos/idefy logo color.png";
import lendopoly from "@/assets/logos/lendopoly logo with name.png";
import lighthouse from "@/assets/logos/lighthouse logo yellow.png";
import puerta from "@/assets/logos/puerta abierta logo.png";
import recreate from "@/assets/logos/recreate energy logo .png";
import redfordstartup from "@/assets/logos/redford startup logo.png";
import soundsense from "@/assets/logos/soundsense logo color.png";
import student from "@/assets/logos/student inc logo.png";
import surplus from "@/assets/logos/surplus logo.png";
import thrust from "@/assets/logos/thrust aeronautics logo color.png";
import vango from "@/assets/logos/vango.png";
import wastewise from "@/assets/logos/wastewise logo.png";

export default function ScrollStartups() {
  const images = [
    { image: bonsai.src, name: "Bonsai", title: "bonsai" },
    { image: bookit.src, name: "Bookit", title: "bookit" },
    { image: cartello.src, name: "Cartello", title: "cartello" },
    { image: clearly.src, name: "Clearly", title: "clearly" },
    { image: diba.src, name: "Diba", title: "diba" },
    { image: disko.src, name: "Disko", title: "disko" },
    { image: idefy.src, name: "Idefy", title: "idefy" },
    { image: lendopoly.src, name: "Lendopoly", title: "lendopoly" },
    { image: lighthouse.src, name: "Lighthouse", title: "lighthouse" },
    { image: puerta.src, name: "Puerta", title: "puerta" },
    { image: recreate.src, name: "Recreate", title: "recreate" },
    { image: redfordstartup.src, name: "Redfordstartup", title: "redfordstartup" },
    { image: soundsense.src, name: "Soundsense", title: "soundsense" },
    { image: student.src, name: "Student", title: "student" },
    { image: surplus.src, name: "Surplus", title: "surplus" },
    { image: thrust.src, name: "Thrust", title: "thrust" },
    { image: vango.src, name: "Vango", title: "vango" },
    { image: wastewise.src, name: "Wastewise", title: "wastewise" },
  ];

  return (
    <div className="h-screen flex flex-col antialiased bg-white dark:bg-black dark:bg-grid-white/[0.05] items-center justify-center relative overflow-hidden">
      <h1 className="text-center md:text-7xl sm:text-6xl text-5xl font-bold md:py-8 sm:py-6 py-6 text-white">
        Startups we&apos;ve built
      </h1>
      <StartupsInfiniteMovingCards
        items={images}
        direction="right"
        speed="slow"
      />
    </div>
  );
}

// StaticImageData objects (resulting from imported images) include properties like src, height, width, etc. The src property is a string that contains the image path or URL, which is what the InfiniteMovingCards component expects.
// By using image: aifinals.src, you pass the string URL to the component, satisfying its type requirements.