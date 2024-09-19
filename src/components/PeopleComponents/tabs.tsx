// components/Tabs.tsx

"use client";

import React, { useState } from 'react';

type Tab = {
  id: string;
  label: string;
  content: JSX.Element;
};

const Tabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('tab1');

  const tabs: Tab[] = [
    {
      id: 'tab1',
      label: 'Introduction',
      content: <div>Content for Introduction</div>,
    },
    {
      id: 'tab2',
      label: 'Our Team',
      content: <div>Content for Our Team</div>,
    },
    {
      id: 'tab3',
      label: 'Events',
      content: <div>Content for Events</div>,
    },
  ];

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="tab-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeTab === tab.id ? 'block' : 'hidden'}>
            {tab.content}
          </div>
        ))}
      </div>

      <style jsx>{`
        .tab-navigation {
          display: flex;
          gap: 10px;
        }
        .tab-navigation button {
          padding: 10px 20px;
          cursor: pointer;
          background-color: #333;
          color: white;
          border: none;
          border-radius: 5px;
        }
        .tab-navigation button.active {
          background-color: #0070f3;
        }
        .tab-content div {
          margin-top: 20px;
        }
        .hidden {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default Tabs;
