import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/upload', label: 'Upload' },
  { to: '/rules', label: 'Rules' },
  { to: '/preview', label: 'Preview' },
  { to: '/batch-job', label: 'Current Job' },
  { to: '/jobs', label: 'Job History' },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  return (
    <>
      <button type="button" className={`nav-backdrop ${open ? 'open' : ''}`} aria-label="Close navigation" onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <nav className="side-nav" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => {
                const jobPage = link.to === '/batch-job' && location.pathname.startsWith('/job/');
                return `nav-link ${isActive || jobPage ? 'active' : ''}`;
              }}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <nav className="side-nav side-nav-foot" aria-label="Workspace">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Settings
          </NavLink>
        </nav>
      </aside>
    </>
  );
}
