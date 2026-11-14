/** tr text of `versions/shared/ui/pages/login`. */

import type en from './en';

export default {
  'login.enterCredentials': 'Hesap adını ve şifreni gir',
  'login.createAccount': 'Hesap oluştur',
  'login.rememberMe': 'Beni hatırla',
  'register.id': 'ID',
  'register.password': 'Şifre',
  'register.confirm': 'Tekrar',
  'register.fillEveryField': 'Lütfen tüm alanları doldur.',
  'register.idTooShort': 'ID en az {min} karakter olmalı.',
  'register.idChars': 'ID yalnızca harf ve rakam içerebilir.',
  'register.passwordTooShort': 'Şifre en az {min} karakter olmalı.',
  'register.passwordTooLong': 'Şifre en fazla {max} karakter olabilir.',
  'register.passwordRules': 'Şifre: {min}-{max} harf, rakam veya sembol. Boşluk ve Türkçe karakter olmadan.',
  'register.showPassword': 'Şifreyi göster',
  'register.passwordChars': 'Şifre yalnızca harf, rakam ve temel simgeler içerebilir.',
  'register.mismatch': 'Şifreler eşleşmiyor.',
  'register.unreachable': 'Sunucuya ulaşılamadı.',
  'register.failed': 'Kayıt başarısız ({status}).',
  'register.created': 'Hesap oluşturuldu. Artık giriş yapabilirsin.',
  'login.savedLogin': 'Kayıtlı giriş',
} satisfies Partial<Record<keyof typeof en, string>>;
