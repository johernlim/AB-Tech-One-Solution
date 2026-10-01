export const passwordRequirement = 'Use 8–128 characters, including at least one number and one special symbol, such as !.';
export const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 128 && /[0-9]/.test(value) && /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value);
