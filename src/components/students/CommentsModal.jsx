import { Modal } from '../ui/Modal.jsx';
import { CommentsTab } from '../shared/CommentsTab.jsx';

/**
 * Тот же тред комментариев, что на карточке студента (CommentsTab),
 * но в модалке — для быстрого доступа из списка должников.
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.student
 * @param {() => void} props.onClose
 */
export function CommentsModal({ student, onClose }) {
  return (
    <Modal open={Boolean(student)} onClose={onClose} title={student ? `Комментарии — ${student.fullName}` : ''} width="table">
      {student && <CommentsTab entityType="student" entityId={student.id} />}
    </Modal>
  );
}
