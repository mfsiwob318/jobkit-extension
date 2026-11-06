(() => {
  if (globalThis.__jobkitContentInstalled) return;
  globalThis.__jobkitContentInstalled = true;
  const clean = (value, max = 8000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  function getJob() {
    const title = clean(document.querySelector('h1')?.innerText || document.title, 180);
    const ogCompany = document.querySelector('meta[property="og:site_name"]')?.content || document.querySelector('meta[name="application-name"]')?.content || '';
    const hostCompany = location.hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ');
    const company = clean(ogCompany || hostCompany, 180);
    const descriptionNode = document.querySelector('[data-testid*="description" i], [class*="job-description" i], [id*="job-description" i], main article, main');
    const description = clean(descriptionNode?.innerText || document.querySelector('meta[name="description"]')?.content || '', 8000);
    const locationText = clean(document.querySelector('[class*="location" i], [data-testid*="location" i]')?.innerText || '', 160);
    return { title, company, location: locationText, description, url: location.href };
  }
  function fieldLabel(field) {
    const labelled = field.labels ? [...field.labels].map((label) => label.innerText).join(' ') : '';
    const aria = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || '';
    const parentLabel = field.closest('label')?.innerText || '';
    return clean([labelled, aria, parentLabel, field.name, field.id, field.placeholder].join(' '), 500).toLowerCase();
  }
  function setValue(field, value) {
    if (!value || field.disabled || field.readOnly || field.type === 'file' || field.type === 'hidden') return false;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
    if (descriptor?.set) descriptor.set.call(field, value); else field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function fill({ profile = {}, kit = {} }) {
    const answerFields = (kit.screeningAnswers || []).map((item) => ({ question: item.question.toLowerCase(), answer: item.answer }));
    const fields = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea')].filter((field) => {
      const rect = field.getBoundingClientRect(); return rect.width && rect.height && !field.disabled && !field.readOnly;
    });
    let filled = 0;
    for (const field of fields) {
      const label = fieldLabel(field);
      if (/password|captcha|social.?security|ssn|gender|race|ethnic|disability|veteran|birth|salary|compensation|work authorization|sponsorship|visa|background check|criminal|consent|agree|certif|e-sign|signature/.test(label)) continue;
      let value = '';
      if (/email/.test(label)) value = profile.email;
      else if (/phone|mobile|telephone/.test(label)) value = profile.phone;
      else if (/first.?name|given.?name/.test(label)) value = (profile.name || '').trim().split(/\s+/)[0];
      else if (/last.?name|family.?name|surname/.test(label)) value = (profile.name || '').trim().split(/\s+/).slice(1).join(' ');
      else if (/full.?name|your.?name|^name$/.test(label)) value = profile.name;
      else if (/linkedin/.test(label)) value = profile.linkedin;
      else if (/portfolio|website|personal.?url/.test(label)) value = profile.website;
      else if (/city|location|address/.test(label)) value = profile.location;
      else if (/cover.?letter|why are you interested|motivation/.test(label)) value = kit.coverLetter;
      else if (/summary|professional.?profile|about.?you|tell us about yourself/.test(label)) value = kit.resumeSummary || profile.summary;
      else {
        const matchingAnswer = answerFields.find((item) => item.question && (label.includes(item.question) || item.question.includes(label)));
        if (matchingAnswer) value = matchingAnswer.answer;
      }
      if (setValue(field, value)) filled++;
    }
    return { filled };
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'JOBKIT_GET_JOB') { sendResponse(getJob()); return false; }
    if (message?.type === 'JOBKIT_FILL_FORM') {
      try { sendResponse(fill(message)); } catch (error) { sendResponse({ error: error.message || 'Unable to fill this form.' }); }
      return false;
    }
    return false;
  });
})();
