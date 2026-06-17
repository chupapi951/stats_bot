import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { hapticNotify, tg } from '../telegram.jsx';

/**
 * Promise-based confirm dialog. Renders a real React component (reliable
 * on iOS WebKit where raw innerHTML + addEventListener can lose the first
 * click). Returns a promise that resolves to true (confirm) or false (cancel).
 */
export function confirmDialog({ title, message, confirmText = 'Подтвердить', cancelText = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const host = document.getElementById('confirmHost');
    if (!host) return resolve(false);

    // Clear any previous dialog
    host.innerHTML = '';

    const node = document.createElement('div');
    host.appendChild(node);
    const root = createRoot(node);

    const close = (val) => {
      try { root.unmount(); } catch (_) {}
      if (node.parentNode) node.parentNode.removeChild(node);
      resolve(val);
    };

    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred('warning'); } catch (_) {}
    }

    function ConfirmModal() {
      // Allow Enter to confirm, Escape to cancel
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'Escape') close(false);
          if (e.key === 'Enter') close(true);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{title}</h2>
            <p style={{ color: 'var(--hint)', margin: '0 0 8px' }}>{message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => close(false)}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className={danger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      );
    }

    root.render(<ConfirmModal />);
  });
}

export default function Modal({ open, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" ref={ref} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
