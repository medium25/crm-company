import { useEffect, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, User, Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { formatName } from '../../lib/format.js';

const RATER_ROLES = [
  { value: 'client', label: 'Mijoz', icon: User },
  { value: 'colleague', label: 'Hamkasb', icon: Users },
];

// Текст вопросов — бриф заказчика (узбекский), не переводим. Все вопросы сформулированы так, чтобы 10 = отлично:
// вопрос «нужно ли что-то менять» (инвертированная логика) заменён на «насколько удобно/эффективно»; пожелания — в комментарии.
export const QUESTIONS = {
  client: [
    'Xodim sizga hurmat bilan murojaat qildimi?',
    "Xodim sizga kerakli yordamni ko'rsata oldimi?",
    'Xodimning professionallik darajasini qanday baholaysiz?',
    "Xodim ko'rsatgan xizmat sifatidan qanchalik mamnunsiz?",
    "Xizmat ko'rsatish jarayoni sizga qanchalik qulay va tushunarli bo'ldi?",
    'Xodimni inson sifatida (xushmuomalalik, samimiylik, odob) qanday baholaysiz?',
  ],
  colleague: [
    "Xodim sizga va jamoadagi boshqalarga hurmat bilan munosabatda bo'ladimi?",
    "Xodim ish jarayonida kerak bo'lganda sizga yordam beradimi va qo'llab-quvvatlaydimi?",
    "Xodimning kasbiy tayyorgarligi va o'z vazifasini bajarish darajasini qanday baholaysiz?",
    'Xodim bilan hamkorlik va birgalikda ishlash sifatidan qanchalik mamnunsiz?',
    "Xodimning ish uslubi va jamoada ishlash tarzi qanchalik samarali?",
    'Xodimni inson sifatida (xushmuomalalik, samimiylik, odob) qanday baholaysiz?',
  ],
};

export const SCALE_VALUES = Array.from({ length: 11 }, (_, i) => i).filter((n) => n !== 7);

// Жёлтый акцент (токен trial) — как выбранная оценка в опросах Яндекса; текст на нём всегда тёмный.
export const PICK_ON = 'bg-trial text-black';
export const PICK_OFF = 'bg-chip text-text hover:bg-border';

function ScaleButtons({ value, onChange }) {
  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {SCALE_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`h-12 rounded-row text-title font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${value === n ? PICK_ON : PICK_OFF}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-caption text-muted">
        <span>0 — juda yomon</span>
        <span>10 — a'lo</span>
      </div>
    </>
  );
}

/**
 * Оценка сотрудника по одному вопросу на экран (как в опросах Яндекса): выбор роли оценивающего
 * (Mijoz/Hamkasb — у каждой свой набор вопросов), затем вопросы 0–10 с полосками прогресса, в конце —
 * комментарий и отправка.
 * @param {Object} props
 * @param {Object|null} props.member staff-документ или null (закрыто)
 * @param {() => void} props.onClose
 */
export function StaffEvaluationModal({ member, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [raterRole, setRaterRole] = useState(null);
  // step: 'role' | номер вопроса | 'comment'
  const [step, setStep] = useState('role');
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

  const questions = raterRole ? QUESTIONS[raterRole] : [];
  const roleLabel = RATER_ROLES.find((r) => r.value === raterRole)?.label;

  const pickRole = (value) => {
    setRaterRole(value);
    setStep(0);
  };

  const goBack = () => {
    if (step === 'comment') setStep(questions.length - 1);
    else if (step === 0) {
      setStep('role');
      setRaterRole(null);
      setRatings({});
    } else setStep(step - 1);
  };

  const goNext = () => setStep(step === questions.length - 1 ? 'comment' : step + 1);

  const handleSubmit = async () => {
    if (!questions.every((_, i) => ratings[i] !== undefined)) return;
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

  const yellowButton = 'mt-6 h-14 w-full rounded-card bg-trial text-control font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40';
  const segments = questions.length + 1;
  const position = step === 'comment' ? questions.length : step;

  return (
    <Modal open={Boolean(member)} onClose={onClose} title={formatName(member?.fullName)}>
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

      {step !== 'role' && raterRole && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              aria-label="Назад"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text hover:bg-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {Array.from({ length: segments }, (_, k) => (
                <i key={k} className={`block h-1 flex-1 rounded-badge ${k <= position ? 'bg-trial' : 'bg-chip'}`} />
              ))}
            </div>
            <span className="text-small text-muted">
              {Math.min(position + 1, questions.length)} / {questions.length}
            </span>
          </div>
          <p className="text-caption text-muted">{roleLabel} sifatida</p>

          {step === 'comment' ? (
            <>
              <p className="mb-4 mt-2 text-title font-bold text-text">Qo'shimcha fikr-mulohazangiz bo'lsa, yozib qoldiring. (ixtiyoriy)</p>
              <textarea
                className="min-h-28 w-full rounded-card bg-chip p-4 text-control text-text focus:outline-none focus:ring-2 focus:ring-trial"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button type="button" onClick={handleSubmit} disabled={saving} className={yellowButton}>
                {saving ? 'Yuborilmoqda…' : 'Yuborish'}
              </button>
            </>
          ) : (
            <>
              <p className="mb-5 mt-2 text-title font-bold text-text">{questions[step]}</p>
              <ScaleButtons value={ratings[step]} onChange={(n) => setRatings((r) => ({ ...r, [step]: n }))} />
              <button type="button" onClick={goNext} disabled={ratings[step] === undefined} className={yellowButton}>
                Keyingisi
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
