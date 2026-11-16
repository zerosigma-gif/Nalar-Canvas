export const MIN_PROJECT_PASSWORD_LENGTH = 8;
export const MAX_PROJECT_PASSWORD_LENGTH = 128;

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  'qwertyui',
  'qwerty12',
  'qwerty123',
  'admin123',
  'admin1234',
  'welcome1',
  'letmein1',
  'nalarcanvas',
  'kolaborasi',
  'rahasia1',
  'rahasia12',
  'rahasia123',
  'pass1234',
  'test1234',
  'user1234',
  'abc12345',
  'abcd1234',
  '1234abcd',
  'asdfghjk',
  'zxcvbnm1',
]);

const SEQUENTIAL_PATTERNS = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop',
  'poiuytrewq',
  'asdfghjkl',
  'lkjhgfdsa',
  'zxcvbnm',
  'mnbvcxz',
];

function hasSequentialRun(value: string, minRun = 4): boolean {
  const lower = value.toLowerCase();
  for (const seq of SEQUENTIAL_PATTERNS) {
    for (let i = 0; i <= seq.length - minRun; i++) {
      const sub = seq.slice(i, i + minRun);
      if (lower.includes(sub)) {
        return true;
      }
    }
  }
  return false;
}

function hasRepeatingPattern(value: string): boolean {
  // 3+ identical consecutive chars (e.g. "aaa", "111")
  if (/(.)\1{2,}/.test(value)) return true;
  // Too few unique characters across 8+ chars (e.g. "abababab", "a1a1a1a1")
  const uniqueCount = new Set(value.toLowerCase()).size;
  if (uniqueCount < 4) return true;
  // Repeated 2-3 char chunks (e.g. "ab12ab12")
  if (/^(.{2,4})\1+$/.test(value.toLowerCase())) return true;
  return false;
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    notPredictable: boolean;
  };
  strength: 'weak' | 'fair' | 'strong';
}

export function validateProjectPassword(rawPassword: string): PasswordPolicyResult {
  const password = rawPassword.trim();
  const minLength =
    password.length >= MIN_PROJECT_PASSWORD_LENGTH &&
    password.length <= MAX_PROJECT_PASSWORD_LENGTH;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const lower = password.toLowerCase();
  const isCommon = COMMON_WEAK_PASSWORDS.has(lower);
  const isRepeated = password.length > 0 && hasRepeatingPattern(password);
  const isSequential = password.length >= 4 && hasSequentialRun(password, 4);
  const notPredictable = password.length > 0 && !isCommon && !isRepeated && !isSequential;

  const errors: string[] = [];
  if (!minLength) {
    errors.push(
      `Kata sandi wajib minimal ${MIN_PROJECT_PASSWORD_LENGTH} karakter (maksimal ${MAX_PROJECT_PASSWORD_LENGTH}).`
    );
  }
  if (!hasUpper || !hasLower || !hasNumber) {
    errors.push('Kombinasikan huruf besar, huruf kecil, dan angka.');
  }
  if (isCommon) {
    errors.push('Kata sandi terlalu umum atau mudah ditebak.');
  } else if (isRepeated) {
    errors.push('Hindari pengulangan karakter atau pola berulang yang mudah ditebak.');
  } else if (isSequential) {
    errors.push('Hindari urutan karakter atau papan ketik berurutan (mis. 1234, abcd, qwer).');
  }

  let score = 0;
  if (minLength) score++;
  if (hasUpper && hasLower) score++;
  if (hasNumber) score++;
  if (notPredictable) score++;
  if (password.length >= 12 || hasSymbol) score++;

  const strength: 'weak' | 'fair' | 'strong' =
    score >= 5 ? 'strong' : score >= 3 ? 'fair' : 'weak';

  return {
    valid: errors.length === 0,
    errors,
    checks: {
      minLength,
      hasUpper,
      hasLower,
      hasNumber,
      notPredictable,
    },
    strength,
  };
}

export function validateLoginPasswordFormat(rawPassword: string): string | null {
  const password = rawPassword.trim();
  if (password.length < MIN_PROJECT_PASSWORD_LENGTH) {
    return `Kata sandi proyek wajib minimal ${MIN_PROJECT_PASSWORD_LENGTH} karakter.`;
  }
  if (password.length > MAX_PROJECT_PASSWORD_LENGTH) {
    return `Kata sandi maksimal ${MAX_PROJECT_PASSWORD_LENGTH} karakter.`;
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase()) || /(.)\1{4,}/.test(password)) {
    return 'Format sandi tidak memenuhi standar keamanan ruang (hindari pola tebak-tebakan atau pengulangan).';
  }
  return null;
}
