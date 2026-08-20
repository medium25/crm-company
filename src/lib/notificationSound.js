import newLeadChimeUrl from '../assets/sounds/new-lead-chime.mp3';

let audio;

/** Звук нового лида в «Заявки» — вручную или из синка Sheets. */
export function playNewLeadChime() {
  if (!audio) audio = new Audio(newLeadChimeUrl);
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
