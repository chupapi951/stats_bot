import React from 'react';

export default function Toast({ toasts }) {
  return (
    <div id="toastRoot">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.message}</div>
      ))}
    </div>
  );
}
