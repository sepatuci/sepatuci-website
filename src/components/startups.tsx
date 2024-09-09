"use client";

import { FocusCards } from "@/components/ui/focus-cards";

import bonsai from "../assets/logos/bonsai logo icon.png";
import bookit from "../assets/logos/bookit.png";
import cartello from "../assets/logos/cartello logo name.png";
import clearly from "../assets/logos/clearly logo color.png";
import diba from "../assets/logos/diBa logo white.png";
import disko from "../assets/logos/disko logo.png";
import idefy from "../assets/logos/idefy logo color.png";
import lendopoly from "../assets/logos/lendopoly logo with name.png";
import lighthouse from "../assets/logos/lighthouse logo yellow.png";
import puerta from "../assets/logos/puerta abierta logo.png";
import recreate from "../assets/logos/recreate energy logo .png";
import redfordstartup from "../assets/logos/redford startup logo.png";
import soundsense from "../assets/logos/soundsense logo color.png";
import student from "../assets/logos/student inc logo.png";
import surplus from "../assets/logos/surplus logo.png";
import thrust from "../assets/logos/thrust aeronautics logo color.png";
import vango from "../assets/logos/vango.png";
import wastewise from "../assets/logos/wastewise logo.png";

export default   function FocusCardsDemo() {
  const cards = [
    {
        title: "Bonsai",
        src: bonsai.src,
      },
      {
        title: "Bookit",
        src: bookit.src,
      },
      {
        title: "Cartello",
        src: cartello.src,
      },
      {
        title: "Clearly",
        src: clearly.src,
      },
      {
        title: "Diba",
        src: diba.src,
      },
      {
        title: "Disko",
        src: disko.src,
      },
      {
        title: "Idefy",
        src: idefy.src,
      },
      {
        title: "Lendopoly",
        src: lendopoly.src,
      },
      {
        title: "Lighthouse",
        src: lighthouse.src,
      },
      {
        title: "Puerta",
        src: puerta.src,
      },
      {
        title: "Recreate",
        src: recreate.src,
      },
      {
        title: "Redford",
        src: redfordstartup.src,
      },
      {
        title: "Soundsense",
        src: soundsense.src,
      },
      {
        title: "Student",
        src: student.src,
      },
      {
        title: "Surplus",
        src: surplus.src,
      },
      {
        title: "Thrust",
        src: thrust.src,
      },
      {
        title: "Vango",
        src: vango.src,
      },
      {
        title: "Wastewise",
        src: wastewise.src,
      },
      


  ];

  return <FocusCards cards={cards} />;
}
