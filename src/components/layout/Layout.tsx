import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="app-container">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="main-content">
        <div style={{ 
          maxWidth: collapsed ? '1350px' : '1200px', 
          margin: '0 auto',
          transition: 'max-width 0.3s ease'
        }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
