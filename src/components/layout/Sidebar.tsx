import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Banknote, Settings, LogOut, Database, ChevronLeft, ChevronRight, Sparkles, Package, Building2, ClipboardCheck, ClipboardList, Receipt, ShoppingCart, UserPlus, MapPin, ScrollText } from 'lucide-react';
import logo from '../../assets/logo.jpg';
import { logout, hasRole } from '../../services/auth';

// `roles` (when present) gates the item — it only renders if the token carries one of them.
const NAV_ITEMS: { to: string; label: string; icon: typeof LayoutDashboard; roles?: string[] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/coupons', label: 'Coupons', icon: Banknote },
  { to: '/batches', label: 'Batches', icon: Package },
  { to: '/requisitions', label: 'Requisitions', icon: ClipboardList },
  { to: '/redemptions', label: 'Redemptions', icon: Receipt },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/erp-sales', label: 'ERP Sales', icon: ShoppingCart },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, roles: ['ADMIN', 'AUDITOR'] },
  { to: '/departments', label: 'Departments', icon: Building2 },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/attendants/register', label: 'Register Attendant', icon: UserPlus, roles: ['TEAM_LEADER', 'ADMIN'] },
  { to: '/fuel-types', label: 'Fuel Types', icon: Database },
  { to: '/ai', label: 'Report', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
  const handleLogout = () => {
    // Keycloak performs a full-page redirect to end the SSO session and return to '/'.
    logout();
  };

  return (
    <aside className={`sidebar glass-panel ${collapsed ? 'collapsed' : ''}`} style={{ 
      width: collapsed ? '80px' : '260px', 
      height: 'calc(100vh - 4rem)', 
      margin: '2rem 0 2rem 2rem', 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Toggle Button */}
      <button 
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute',
          right: '-14px',
          top: '32px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'var(--color-accent-gold)',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100,
          boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
          transition: 'all 0.2s ease'
        }}
        title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {collapsed ? <ChevronRight size={16} color="#000" /> : <ChevronLeft size={16} color="#000" />}
      </button>

      <div style={{ 
        padding: collapsed ? '1rem 0.5rem' : '1.5rem 1rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.75rem', 
        borderBottom: '1px solid var(--color-border)', 
        transition: 'all 0.3s' 
      }}>
        <div style={{ 
          minWidth: collapsed ? '50px' : '60px', 
          width: collapsed ? '50px' : '60px', 
          height: 'auto', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          transition: 'all 0.3s'
        }}>
          <img src={logo} alt="Petrotrade" style={{ width: '100%', height: 'auto' }} />
        </div>
        {!collapsed && (
          <div className="animate-fade-in" style={{ overflow: 'hidden' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0', color: 'var(--color-accent-gold)', whiteSpace: 'nowrap' }}>Petrotrade</h2>
            <p style={{ fontSize: '0.7rem', margin: '0', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Coupon System</p>
          </div>
        )}
      </div>
      
      <nav style={{ padding: '1.5rem 0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
        {NAV_ITEMS.filter(({ roles }) => !roles || hasRole(...roles)).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              color: isActive ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
              background: isActive ? 'rgba(206, 166, 32, 0.1)' : 'transparent',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              fontWeight: isActive ? 600 : 500,
              overflow: 'hidden'
            })}
            title={collapsed ? label : ""}
          >
            <Icon size={20} style={{ minWidth: '20px' }} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      
      <div style={{ padding: '1.5rem 0.75rem', borderTop: '1px solid var(--color-border)' }}>
        <button 
          onClick={handleLogout}
          className="btn"
          style={{ width: '100%', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', background: 'transparent', color: 'var(--color-text-secondary)', padding: '0.75rem 1rem' }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-accent-red)'; e.currentTarget.style.background = 'rgba(208, 76, 87, 0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
          title={collapsed ? "Log Out" : ""}
        >
          <LogOut size={20} style={{ minWidth: '20px' }} />
          {!collapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
};
