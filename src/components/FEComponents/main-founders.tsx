import React from 'react';
import { FaSearch, FaUserFriends, FaShieldAlt, FaChartLine, FaMoneyBillWave, FaLightbulb, FaRocket } from 'react-icons/fa';
import { FaPeopleGroup } from "react-icons/fa6";
import { GiConversation } from "react-icons/gi";
import { AiFillProduct } from "react-icons/ai";
import { MdOutlineAttachMoney } from "react-icons/md";
import { IoExtensionPuzzle } from "react-icons/io5";


const MainFE: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="sm:text-3xl text-2xl font-medium title-font mb-4 text-white">
            The Program
          </h1>
          <p className="lg:w-2/3 mx-auto leading-relaxed text-base">
            Founder&apos;s Education is our 8-week startup incubator program focused on helping you think and build like an entrepreneur.
          </p>
        </div>
        <div className="flex flex-wrap -m-4 text-center">
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <FaSearch className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Problem Discovery</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <FaUserFriends className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Customer Discovery</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <IoExtensionPuzzle className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Minimum Viable Product</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <FaChartLine className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Market Analysis</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <MdOutlineAttachMoney className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Finance</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <FaLightbulb className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Branding</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <GiConversation className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Networking</p>
            </div>
          </div>
          <div className="p-4 md:w-1/4 sm:w-1/2 w-full">
            <div className="border-2 border-gray-200 px-4 py-6 rounded-lg">
              <FaRocket className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Pitching</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MainFE;
