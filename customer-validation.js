export const normalizeGmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validGmail = value => {
  const email = normalizeGmail(value);
  if (email.length > 254 || !/^[a-z0-9]+(?:\.[a-z0-9]+)*@gmail\.com$/.test(email)) return false;
  const local = email.split('@')[0].replace(/\./g, '');
  return local.length >= 6 && local.length <= 30;
};
export const gmailKey = value => normalizeGmail(value).replace(/\.(?=[^@]*@)/g, '');
export function gmailError(value) {
  const email = normalizeGmail(value);
  if (!email || validGmail(email)) return '';
  const [local, domain] = email.split('@');
  if (domain && domain !== 'gmail.com') return `Use @gmail.com. Please check the spelling${local ? ': ' + local + '@gmail.com' : ''}.`;
  return 'Enter a valid Gmail address, such as yourname@gmail.com. Use 6–30 letters or numbers before @gmail.com; dots are allowed.';
}
export const validContact = value => typeof value === 'string' && /^(?:011[0-9]{8}|01[02-9][0-9]{7})$/.test(value);
export const contactError = 'Enter a Malaysian mobile number: 011 needs 11 digits; other 01 prefixes need 10 digits.';
export function today() {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());}
export function validBirthDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= today() && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function profileError(data) {
  if (!validGmail(data.email)) return gmailError(data.email) || 'Enter your Gmail address.';
  if (typeof data.fullName !== 'string' || !data.fullName.trim() || data.fullName.trim().length > 120 || /[\x00-\x1f\x7f]/.test(data.fullName)) return 'Enter your full name (up to 120 characters).';
  if (!validContact(data.contactNo)) return contactError;
  if (!validBirthDate(data.dateOfBirth)) return 'Choose a valid date of birth that is not in the future.';
  if (!['male', 'female', 'prefer_not_to_say'].includes(data.gender)) return 'Please choose your gender option.';
  return '';
}
