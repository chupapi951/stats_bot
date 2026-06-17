import React, { useState, useEffect, useRef } from 'react';
import { hapticImpact, hapticNotify, tg } from '../telegram.jsx';

export function confirmDialog({ title, message, confirmText = 'Подтвердить', cancelText = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    if (!root) return resolve(false);
    root.innerHTML = `
      <div class="modal-backdrop" data-backdrop>
        <div class="modal" role="dialog" aria-modal="true">
          <h2>${title}</h2>
          <p style="color: var(--hint); margin: 0 0 8px;">${message}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="ok">${confirmText}</button>
          </div>
        </div>
      </div>`;
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred('warning'); } catch (_) {}
    }
    const close = (val) => {
      root.innerHTML = '';
      resolve(val);
    };
    root.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
    root.querySelector('[data-action="ok"]').addEventListener('click', () => close(true));
    root.querySelector('[data-backdrop]').addEventListener('click', (e) => {
      if (e.target.dataset.backdrop !== undefined) close(false);
    });
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
