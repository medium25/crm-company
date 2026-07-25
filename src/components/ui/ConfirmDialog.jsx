import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';

/**
 * Разрушающее действие всегда через этот компонент — с явным названием объекта в тексте.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onConfirm
 * @param {string} props.title
 * @param {string} props.message текст с явным названием объекта, напр. «Архивировать группу I14?»
 * @param {string} [props.confirmLabel]
 * @param {boolean} [props.loading]
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Подтвердить',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="form"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-text">{message}</p>
    </Modal>
  );
}
