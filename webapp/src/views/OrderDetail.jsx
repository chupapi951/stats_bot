import React, { useEffect, useState, useContext } from 'react';
import { useApi } from '../api.js';
import { fmtMoney, fmtDate, fmtDateTime, statusLabel } from '../format.js';
import { hapticImpact, hapticNotify } from '../telegram.jsx';
import { confirmDialog } from '../components/Modal.jsx';
import { ToastContext } from '../App.jsx';

export default function OrderDetail({ orderId, onBack }) {
  const api = useApi();
  const { push } = useContext(ToastContext);
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    api.order(orderId).then(setOrder).catch((e) => setErr(e.message));
  };

  useEffect(() => {
    reload();
    const onChange = (e) => {
      if (e.detail?._refresh) return;
      if (e.detail?._deleted && e.detail.orderId === orderId) {
        onBack && onBack();
        return;
      }
      if (e.detail?.orderId === orderId) reload();
    };
    window.addEventListener('order:changed', onChange);
    return () => window.removeEventListener('order:changed', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const setStatus = async (status) => {
    hapticImpact('medium');
    setBusy(true);
    try {
      const updated = await api.setStatus(orderId, status);
      setOrder(updated);
      hapticNotify('success');
      push(`Статус: ${statusLabel(status)}`, 'success');
    } catch (e) {
      hapticNotify('error');
      push(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Удалить заказ?',
      message: `Заказ #${orderId} будет удалён без возможности восстановления.`,
      confirmText: 'Удалить',
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteOrder(orderId);
      hapticNotify('warning');
      push(`Заказ #${orderId} удалён`, 'info');
      onBack && onBack();
    } catch (e) {
      hapticNotify('error');
      push(e.message, 'error');
      setBusy(false);
    }
  };

  if (err) return <div className="empty">Ошибка: {err}</div>;
  if (!order) return <div className="loader">Загрузка…</div>;

  return (
    <div className="detail">
      <div className="card">
        <h3>Заказ #{order.orderId}</h3>
        <div className="kv"><span className="k">Товар</span><span className="v">{order.productName}</span></div>
        <div className="kv"><span className="k">Себестоимость</span><span className="v">{fmtMoney(order.costPrice)}</span></div>
        <div className="kv"><span className="k">Цена продажи</span><span className="v">{fmtMoney(order.sellingPrice)}</span></div>
        <div className="kv">
          <span className="k">Статус</span>
          <span className="v"><span className={'badge ' + order.status}>{statusLabel(order.status)}</span></span>
        </div>
        <div className="kv"><span className="k">Создан</span><span className="v">{fmtDateTime(order.createdAt)}</span></div>
        {order.completedAt && (
          <div className="kv"><span className="k">Выкуплен</span><span className="v">{fmtDateTime(order.completedAt)}</span></div>
        )}
        {order.status === 'completed' && (
          <div className="kv">
            <span className="k">Прибыль</span>
            <span className="v" style={{ color: 'var(--good)' }}>{fmtMoney(order.profit)}</span>
          </div>
        )}
        {order.comment && (
          <div className="kv"><span className="k">Комментарий</span><span className="v">{order.comment}</span></div>
        )}
      </div>

      <div className="actions">
        {order.status === 'created' && (
          <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('shipped')}>
            🚚 Отправить в доставку
          </button>
        )}
        {(order.status === 'created' || order.status === 'shipped') && (
          <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('completed')}>
            ✅ Подтвердить выкуп
          </button>
        )}
        {order.status !== 'returned' && order.status !== 'completed' && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => setStatus('returned')}>
            ↩️ Оформить возврат
          </button>
        )}
        {order.status === 'completed' && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => setStatus('returned')}>
            ↩️ Отменить выкуп (возврат)
          </button>
        )}
      </div>

      <div className="actions danger">
        <button className="btn btn-danger" disabled={busy} onClick={onDelete}>
          🗑 Удалить заказ
        </button>
      </div>
    </div>
  );
}
