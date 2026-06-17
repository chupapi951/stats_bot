import React, { useState, useContext } from 'react';
import Modal from './Modal.jsx';
import { ToastContext } from '../App.jsx';
import { hapticNotify } from '../telegram.jsx';

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // local YYYY-MM-DD (avoids UTC off-by-one in the date input)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AddOrderModal({ api, onClose, onCreated }) {
  const [productName, setProductName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [createdDate, setCreatedDate] = useState(todayISO());
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { push } = useContext(ToastContext);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!productName.trim()) {
      setError('Укажите название товара');
      hapticNotify('error');
      return;
    }
    const cp = Number(costPrice);
    const sp = Number(sellingPrice);
    if (!Number.isFinite(cp) || cp < 0) { setError('Себестоимость должна быть числом'); return; }
    if (!Number.isFinite(sp) || sp < 0) { setError('Цена продажи должна быть числом'); return; }

    const createdAt = useCustomDate && createdDate
      ? new Date(`${createdDate}T12:00:00`).toISOString()
      : undefined;

    setSubmitting(true);
    try {
      const created = await api.createOrder({ productName, costPrice: cp, sellingPrice: sp, createdAt });
      hapticNotify('success');
      push(`Заказ #${created.orderId} создан`, 'success');
      onCreated(created);
    } catch (e) {
      setError(e.message || 'Ошибка создания');
      hapticNotify('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose}>
      <h2>Новый заказ</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label>Название товара</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="например, футболка nike"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Себестоимость, ₽</label>
          <input
            type="number"
            inputMode="decimal"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="field">
          <label>Цена продажи, ₽</label>
          <input
            type="number"
            inputMode="decimal"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="field field--date-toggle">
          <label className="toggle-row">
            <span className="toggle-row__label">
              <span className="toggle-row__icon" aria-hidden>📅</span>
              Указать дату создания
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={useCustomDate}
                onChange={(e) => setUseCustomDate(e.target.checked)}
              />
              <span className="toggle__track">
                <span className="toggle__thumb" />
              </span>
            </span>
          </label>
          {useCustomDate && (
            <div className="date-picker">
              <input
                type="date"
                value={createdDate}
                max={todayISO()}
                onChange={(e) => setCreatedDate(e.target.value)}
              />
              <div className="date-picker__hint">
                {createdDate ? new Date(`${createdDate}T12:00:00`).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric', weekday: 'short'
                }) : 'выберите дату'}
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 6 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Создаю…' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
