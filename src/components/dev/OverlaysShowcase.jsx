import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { useToast } from '../ui/Toast.jsx';

export function OverlaysShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setModalOpen(true)}>Открыть Modal</Button>
      <Button variant="danger" onClick={() => setConfirmOpen(true)}>
        Открыть ConfirmDialog
      </Button>
      <Button variant="secondary" onClick={() => showToast('Оплата сохранена.')}>
        Toast — успех
      </Button>
      <Button variant="secondary" onClick={() => showToast('Не удалось загрузить.', { type: 'error' })}>
        Toast — ошибка
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          showToast('Студент перенесён в архив.', { actionLabel: 'Отменить', onAction: () => {} })
        }
      >
        Toast — с «Отменить»
      </Button>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Добавить оплату"
        width="form"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => setModalOpen(false)}>Сохранить</Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">Пример модалки шириной 520px, Esc закрывает.</p>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
        title="Архивировать группу"
        message="Архивировать группу I14? Студенты и история останутся доступны."
        confirmLabel="Архивировать"
      />
    </div>
  );
}
