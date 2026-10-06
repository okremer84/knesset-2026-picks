import React, { useState } from 'react';
import { Avatar, ProfileModal } from './ProfileModal';
import { useAccount } from './AuthGate';

export type AppTab = 'picker' | 'league' | 'surveys' | 'historical';
interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}
const pages: { id: AppTab; label: string }[] = [
  { id: 'picker', label: 'התחזית שלי' },
  { id: 'league', label: 'הליגות שלי' },
  { id: 'surveys', label: 'סקרים' },
  { id: 'historical', label: 'בחירות קודמות' },
];

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  const { user } = useAccount();
  const [profileOpen, setProfileOpen] = useState(false);
  return <header className="site-header">
    <a href="#main-content" className="skip-link">דילוג לתוכן</a>
    <div className="masthead">
      <button className="brand" onClick={() => setActiveTab('picker')} aria-label="120 — התחזית שלי">
        <span className="brand-number">120<span>.</span></span>
        <span className="brand-caption">פנטזי בחירות<span>הכנסת ה־26</span></span>
      </button>
      <button className="account-trigger" aria-label="הפרופיל שלי" onClick={() => setProfileOpen(true)}>
        <Avatar name={user.name} url={user.avatar_url}/><span className="account-name">{user.name}</span>
      </button>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)}/>}

    </div>
    <nav className="main-nav" aria-label="ניווט ראשי">
      {pages.map(page => <button key={page.id} aria-current={activeTab === page.id ? 'page' : undefined} onClick={() => setActiveTab(page.id)}>{page.label}</button>)}
    </nav>
  </header>;
}
