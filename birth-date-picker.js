import {today, validBirthDate} from './customer-validation.js';

export const birthDateInputs = `<fieldset class="birth-date-picker"><legend>Date of Birth</legend><div class="birth-date-options"><label>Day<select name="birthDay" autocomplete="bday-day" required><option value="">Day</option></select></label><label>Month<select name="birthMonth" autocomplete="bday-month" required><option value="">Month</option>${['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => `<option value="${i + 1}">${name}</option>`).join('')}</select></label><label>Year<select name="birthYear" autocomplete="bday-year" required><option value="">Year</option>${Array.from({length: Number(today().slice(0, 4)) - 1899}, (_, i) => Number(today().slice(0, 4)) - i).map(year => `<option>${year}</option>`).join('')}</select></label></div><input type="hidden" name="dateOfBirth"></fieldset>`;

export function setupBirthDatePicker(form) {
  const {birthDay: day, birthMonth: month, birthYear: year, dateOfBirth: value} = form.elements;
  function update() {
    const selected = day.value;
    const days = month.value ? new Date(Date.UTC(Number(year.value || 2000), Number(month.value), 0)).getUTCDate() : 31;
    day.replaceChildren(new Option('Day', ''), ...Array.from({length: days}, (_, i) => new Option(String(i + 1), String(i + 1))));
    day.value = Number(selected) <= days ? selected : '';
    value.value = day.value && month.value && year.value ? `${year.value}-${month.value.padStart(2, '0')}-${day.value.padStart(2, '0')}` : '';
    day.setCustomValidity(value.value && !validBirthDate(value.value) ? 'Choose a valid birthday that is not in the future.' : '');
  }
  for (const input of [day, month, year]) input.addEventListener('change', update);
  form.addEventListener('reset', () => queueMicrotask(update));
  update();
}
