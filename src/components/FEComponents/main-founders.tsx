import React from 'react';
import { FaSearch, FaUserFriends, FaChartLine } from 'react-icons/fa';
import { IoExtensionPuzzle } from 'react-icons/io5';
import { MdOutlineAttachMoney } from 'react-icons/md';
import { GiConversation } from 'react-icons/gi';
import { RiPresentationFill } from 'react-icons/ri';
import { CiGlobe } from 'react-icons/ci';

const MainFE: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="md:h-screen container px-5 pt-24 pb-24 mx-auto items-center justify-center flex flex-col">
        <div className="flex flex-col text-center w-full mb-10">
          <h1 className="text-5xl font-bold title-font text-white mb-4">
          The Program
          </h1>
          {/* <h1 className="text-4xl md:text-5xl font-bold title-font text-white mb-4">
          </h1> */}
          <p className="text-base md:text-lg mx-auto leading-relaxed">
            Founder&apos;s Education is our 8-week startup incubator program focused on helping you think and build like an entrepreneur.
          </p>
        </div>
        <div className="flex flex-wrap -m-2 text-center">
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
              <CiGlobe className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
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
              <RiPresentationFill className="text-indigo-500 w-12 h-12 mb-3 inline-block" />
              <p className="leading-relaxed text-white">Pitching</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MainFE;
