import {showCategoryIcon} from '../category-icon.js';
export function setupCategoryIconEditor({upload, isBusy, setBusy, notify}) {
  const form = document.getElementById('staff-category-form'), select = form.elements.icon;
  const custom = new Option('Custom uploaded icon', ''); custom.hidden = true; select.append(custom);
  const panel = document.createElement('div'); panel.className = 'full-field category-icon-editor';
  panel.innerHTML = '<img id="category-icon-preview" width="64" height="64" alt="Category icon preview"><div><div class="category-icon-actions"><button type="button" class="button secondary" id="upload-category-icon">Upload icon</button><button type="button" class="button secondary" id="reset-category-icon">Reset to default</button></div><p class="field-help" id="category-icon-help">Recommended: 256 × 256 pixels, square, with a transparent background. PNG or WebP only, smaller than 1 MB (1,000,000 bytes). Maximum dimensions: 4096 × 4096 pixels. Other shapes are fitted into a 256 × 256 transparent square without cropping. Transparency is recommended, not required.</p><input id="category-icon-file" type="file" accept="image/png,image/webp" aria-label="Choose category icon" aria-describedby="category-icon-help" hidden></div>';
  select.closest('label').after(panel);
  const preview = panel.querySelector('img'), fileInput = panel.querySelector('input'), uploadButton = panel.querySelector('#upload-category-icon'), resetButton = panel.querySelector('#reset-category-icon');
  const previews = new Map();
  function render() {
    showCategoryIcon(preview, select.value);
    if (previews.has(select.value)) preview.src = previews.get(select.value);
    uploadButton.textContent = select.value.startsWith('assets/uploads/') ? 'Replace icon' : 'Upload icon';
  }
  function open(icon = 'network') {
    custom.value = icon.startsWith('assets/uploads/') ? icon : '';
    custom.hidden = !custom.value; select.value = custom.value || icon;
    if (!select.value) select.value = 'network'; fileInput.value = ''; render();
  }
  select.addEventListener('change', render);
  resetButton.addEventListener('click', () => {if (!isBusy()) {select.value = 'network'; fileInput.value = ''; render();}});
  uploadButton.addEventListener('click', () => {if (!isBusy()) fileInput.click();});
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; if (!file || isBusy()) return;
    setBusy(true); uploadButton.disabled = resetButton.disabled = select.disabled = true;
    document.getElementById('publish-staff-category').disabled = true;
    let bitmap;
    try {
      if (!['image/png','image/webp'].includes(file.type) || file.size >= 1000000) throw new Error('Choose a PNG or WebP icon smaller than 1 MB.');
      try {bitmap = await createImageBitmap(file);} catch {throw new Error('This image cannot be read. Choose a valid PNG or WebP image.');}
      if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error('Icon dimensions must not exceed 4096 × 4096 pixels.');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const scale = Math.min(256 / bitmap.width, 256 / bitmap.height), width = bitmap.width * scale, height = bitmap.height * scale;
      canvas.getContext('2d').drawImage(bitmap, (256-width)/2, (256-height)/2, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not prepare this icon. Please try another image.');
      notify('Uploading icon…');
      const path = await upload(new File([blob], 'category-icon.png', {type:'image/png'}));
      previews.set(path, URL.createObjectURL(blob)); open(path);
      notify('Icon uploaded. Save the category to publish it.');
    } catch (error) {notify(error.message, true);}
    finally {bitmap?.close(); fileInput.value = ''; setBusy(false); uploadButton.disabled = resetButton.disabled = select.disabled = false; document.getElementById('publish-staff-category').disabled = false;}
  });
  return {open};
}
