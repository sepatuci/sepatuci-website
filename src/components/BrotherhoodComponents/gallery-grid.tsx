"use client";

import { FocusCards } from "@/components/ui/focus-cards";

// import banner from "../../assets/community/banner.JPG"
// import check from "../../assets/community/check.JPG"
import check2 from "../../assets/community/check2.jpeg";
// import table from "../../assets/community/table.JPG";
import mhfinals from "../../assets/community/mhfinals.jpeg";
// import crescentbros from "../../assets/community/crescentbros.JPG";
import hike from "../../assets/community/hike.jpeg"
import restaurant from "../../assets/community/atRestraunt.jpeg"
import alphaog from "../../assets/community/1alphaogEdited.jpeg"


export default function FocusCardsDemo() {
  const cards = [
    {
      title: "Forest Adventure",    
      src: alphaog.src,
    },
    {
        title: "Forest Adventure",    
        src: restaurant.src,
      },
  ];

  return <FocusCards cards={cards} />;
}
