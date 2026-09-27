import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className="app-shell">
      <Header onMenu={() => setNavOpen(true)} />
      <div className="app-body">
        <Sidebar open={navOpen} onClose={closeNav} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
