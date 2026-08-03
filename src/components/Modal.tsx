import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
}

// Rendered into document.body via a portal: the page root keeps a `transform` after its
// fade-in animation (fill-mode: forwards), which would otherwise make it the containing
// block for position: fixed and anchor the overlay to the page instead of the viewport.
export const Modal: React.FC<ModalProps> = ({ onClose, width = 'min(520px, 92vw)', children }) => {
  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{ padding: '2rem', width, maxHeight: '85vh', overflowY: 'auto', background: 'rgba(4, 51, 9, 0.97)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
