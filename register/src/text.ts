import {
  MAX_ACCOUNT_PASSWORD_LENGTH,
  MIN_ACCOUNT_LENGTH,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  type SignupProblem,
} from '../../src/modules/servers/registerRules';

const MIN = MIN_ACCOUNT_PASSWORD_LENGTH;
const MAX = MAX_ACCOUNT_PASSWORD_LENGTH;

const EN = {
  title: 'Create Account',
  labels: { username: 'ID', password: 'Password', confirm: 'Confirm', email: 'E-mail' },
  rules: `Password: ${MIN} to ${MAX} letters, numbers or symbols. No spaces or accents.`,
  show: 'Show password',
  hide: 'Hide password',
  done: 'Account created. You can log in now.',
  unreachable: 'Could not reach the server.',
  failed: (status: number) => `Registration failed (${status}).`,
  problems: {
    empty: 'Please fill in every field.',
    idShort: `ID must be at least ${MIN_ACCOUNT_LENGTH} characters.`,
    idChars: 'ID may contain only letters and numbers.',
    passwordShort: `Password must be at least ${MIN} characters.`,
    passwordLong: `Too long: use ${MIN} to ${MAX} characters.`,
    passwordChars: 'Password may contain only letters, numbers and basic symbols.',
    mismatch: 'Passwords do not match.',
    email: 'Enter a valid e-mail. It is how you recover the account.',
  } satisfies Record<SignupProblem, string>,
};

const ES: typeof EN = {
  title: 'Crear cuenta',
  labels: { username: 'Usuario', password: 'Contraseña', confirm: 'Repetir', email: 'E-mail' },
  rules: `Contraseña: de ${MIN} a ${MAX} letras, números o símbolos. Sin ñ, acentos ni espacios.`,
  show: 'Mostrar contraseña',
  hide: 'Ocultar contraseña',
  done: 'Cuenta creada. Ya podés entrar al juego.',
  unreachable: 'No se pudo conectar con el servidor.',
  failed: status => `No se pudo crear la cuenta (${status}).`,
  problems: {
    empty: 'Completá todos los campos.',
    idShort: `El usuario debe tener al menos ${MIN_ACCOUNT_LENGTH} caracteres.`,
    idChars: 'El usuario solo puede tener letras y números.',
    passwordShort: `La contraseña debe tener al menos ${MIN} caracteres.`,
    passwordLong: `Te pasaste de los ${MAX} caracteres. Usá de ${MIN} a ${MAX}.`,
    passwordChars: 'La contraseña solo puede tener letras, números y símbolos básicos (sin ñ, acentos ni espacios).',
    mismatch: 'Las contraseñas no coinciden.',
    email: 'Poné un e-mail válido. Es como recuperás la cuenta.',
  },
};

/** The page's words in the browser's language: Spanish for any `es`, English otherwise. */
export const pageText = (lang = typeof navigator === 'undefined' ? 'en' : navigator.language) =>
  lang.toLowerCase().startsWith('es') ? ES : EN;
