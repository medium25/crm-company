import { useEffect, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { User, Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { formatName } from '../../lib/format.js';

const RATER_ROLES = [
  { value: 'client', label: 'Mijoz', icon: User },
  { value: 'colleague', label: 'Hamkasb', icon: Users },
];

// Текст вопросов — фиксированный бриф заказчика (узбекский), не переводим.
const QUESTIONS = {
  client: [
    'Xodim sizga hurmat bilan murojaat qildimi?',
    "Xodim sizga kerakli yordamni ko'rsata oldimi?",
    'Xodimning professionallik darajasini qanday baholaysiz?',
    "Xodim ko'rsatgan xizmat sifatidan qanchalik mamnunsiz?",
    "Xizmat ko'rsatish jarayonida biror narsani o'zgartirish yoki yaxshilash kerak deb hisoblaysizmi?",
    'Xodimni inson sifatida (xushmuomalalik, samimiylik, odob) qanday baholaysiz?',
  ],
  colleague: [
    "Xodim sizga va jamoadagi boshqalarga hurmat bilan munosabatda bo'ladimi?",
    "Xodim ish jarayonida kerak bo'lganda sizga yordam beradimi va qo'llab-quvvatlaydimi?",
    "Xodimning kasbiy tayyorgarligi va o'z vazifasini bajarish darajasini qanday baholaysiz?",
    'Xodim bilan hamkorlik va birgalikda ishlash sifatidan qanchalik mamnunsiz?',
    "Xodimning ish uslubi yoki jamoa bilan ishlash tarzida o'zgartirish yoki yaxshilash kerak deb hisoblaysizmi?",
    'Xodimni inson sifatida (xushmuomalalik, samimiylik, odob) qanday baholaysiz?',
  ],
};

const SCALE_HINT = "Baholash shkalasi: 0 — juda yomon, 10 — a'lo darajada.";
// Шкала 0–10 без 7 (так задал заказчик).
const SCALE_VALUES = Array.from({ length: 11 }, (_, i) => i).filter((n) => n !== 7);

// Статичные классы — Tailwind JIT не умеет собирать `bg-${tone}` на лету.
const ZONE_CLASSES = {
  danger: { off: 'border-transparent bg-danger/10 text-danger hover:bg-danger/20', on: 'border-danger bg-danger text-white' },
  warning: { off: 'border-transparent bg-warning/10 text-warning hover:bg-warning/20', on: 'border-warning bg-warning text-white' },
  success: { off: 'border-transparent bg-success/10 text-success hover:bg-success/20', on: 'border-success bg-success text-white' },
  // 10 — графитовый акцент интерфейса (токен orange), не зелёный.
  graphite: { off: 'border-transparent bg-orange/10 text-orange hover:bg-orange/20', on: 'border-orange bg-orange text-surface' },
};
const zoneOf = (n) => (n <= 3 ? 'danger' : n <= 6 ? 'warning' : n === 10 ? 'graphite' : 'success');

function RatingRow({ label, value, onChange }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-control text-text">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {SCALE_VALUES.map((n) => {
          const zone = ZONE_CLASSES[zoneOf(n)];
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex h-8 w-8 items-center justify-center rounded-field border-[1.5px] text-small font-bold transition-colors ${value === n ? zone.on : zone.off}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Оценка сотрудника: сперва выбор роли оценивающего (Mijoz/Hamkasb — у
 * каждой свой набор вопросов), затем сама анкета 0–10 + комментарий.
 * @param {Object} props
 * @param {Object|null} props.member staff-документ или null (закрыто)
 * @param {() => void} props.onClose
 */
export function StaffEvaluationModal({ member, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState('role');
  const [raterRole, setRaterRole] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setStep('role');
    setRaterRole(null);
    setRatings({});
    setComment('');
  }, [member]);

  const pickRole = (value) => {
    setRaterRole(value);
    setStep('form');
  };

  const handleBack = () => {
    setStep('role');
    setRaterRole(null);
    setRatings({});
  };

  const questions = raterRole ? QUESTIONS[raterRole] : [];
  const allAnswered = raterRole && questions.every((_, i) => ratings[i] !== undefined);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allAnswered) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'staffEvaluations'), {
        staffId: member.id,
        staffName: member.fullName,
        staffRole: member.roleForEval,
        raterRole,
        ratings,
        comment: comment.trim(),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      showToast('Оценка сохранена.');
      onClose();
    } catch {
      showToast('Не удалось сохранить оценку.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const footer =
    step === 'form' ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={saving} disabled={!allAnswered}>
          Yuborish
        </Button>
      </>
    ) : undefined;

  return (
    <Modal open={Boolean(member)} onClose={onClose} title={formatName(member?.fullName)} footer={footer}>
      {step === 'role' && (
        <div>
          <p className="mb-4 text-control text-muted">Siz xodimni qaysi sifatda baholaysiz?</p>
          <div className="grid grid-cols-2 gap-3">
            {RATER_ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => pickRole(r.value)}
                  className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-border-strong p-6 text-center transition hover:-translate-y-0.5 hover:border-navy hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                >
                  <Icon className="h-7 w-7 text-navy" strokeWidth={1.75} aria-hidden="true" />
                  <span className="text-title font-bold text-text">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'form' && raterRole && (
        <form onSubmit={handleSubmit}>
          <button type="button" onClick={handleBack} className="mb-4 text-small font-bold text-navy hover:underline">
            ← {RATER_ROLES.find((r) => r.value === raterRole)?.label}, orqaga
          </button>
          <p className="mb-5 text-caption text-muted">{SCALE_HINT}</p>
          {questions.map((q, i) => (
            <RatingRow key={i} label={`${i + 1}. ${q}`} value={ratings[i]} onChange={(n) => setRatings((r) => ({ ...r, [i]: n }))} />
          ))}
          <label className="block">
            <span className="mb-1 block text-control text-text">Qo'shimcha fikr-mulohazangiz bo'lsa, yozib qoldiring. (ixtiyoriy)</span>
            <textarea
              className="min-h-20 w-full rounded-field border border-border-strong p-3 text-control focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        </form>
      )}
    </Modal>
  );
}
