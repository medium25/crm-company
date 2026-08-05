const PHONE_AUTH_DOMAIN = 'icon-crm.local';

/**
 * Учителя заводятся по номеру телефона, без SMS-кода — Firebase Auth умеет
 * только email/пароль или phone+SMS, поэтому номер превращается в
 * синтетический email и живёт как обычный email/password аккаунт.
 * @param {string} phone цифры номера, с кодом страны или без
 * @returns {string} "998901234567@icon-crm.local"
 */
export function phoneToAuthEmail(phone) {
  return `${phone.replace(/\D/g, '')}@${PHONE_AUTH_DOMAIN}`;
}

/**
 * @param {string} identifier то, что ввели в поле логина
 * @returns {boolean} true — номер телефона, false — обычный email
 */
export function isPhoneIdentifier(identifier) {
  return !identifier.includes('@');
}
