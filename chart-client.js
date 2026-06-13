// Designed to Thrive - chart form client.
// Posts birth data to the HD chart API, stores the result, redirects to result.html.

// Auto-detect environment:
//   - If page is served from localhost/127.0.0.1, hit the local API on :8080
//   - Otherwise hit the production API
// You can override at any time by setting window.HD_API_BASE before this script loads.
const HD_LOCAL_DEFAULT = 'http://127.0.0.1:8080';
const HD_PROD_DEFAULT  = 'https://dtt-chart.onrender.com';
const _host = window.location.hostname;
const _isLocal = _host === 'localhost' || _host === '127.0.0.1' || _host === '' || _host.endsWith('.local');
const HD_API_BASE = window.HD_API_BASE || (_isLocal ? HD_LOCAL_DEFAULT : HD_PROD_DEFAULT);

(function(){
  const form = document.getElementById('chart-form');
  if (!form) return;

  // ---------- Email quality check ----------
  // Filters out obvious junk. This does NOT prove an inbox is real (only a
  // confirmation email can do that), but it kills lazy fakes and throwaways.
  const DISPOSABLE_DOMAINS = [
    'mailinator.com','guerrillamail.com','guerrillamail.info','guerrillamail.biz',
    '10minutemail.com','10minutemail.net','tempmail.com','temp-mail.org','tempmail.net',
    'throwawaymail.com','yopmail.com','getnada.com','nada.email','trashmail.com',
    'maildrop.cc','dispostable.com','fakeinbox.com','sharklasers.com','spam4.me',
    'mailnesia.com','mintemail.com','mohmal.com','emailondeck.com','fakemail.net',
    'tempinbox.com','mytemp.email','tempmailo.com','luxusmail.org','burnermail.io',
    'mailcatch.com','spambox.us','tempr.email','discard.email','inboxbear.com'
  ];
  // Common typos in the popular providers, mapped to the correct domain.
  const DOMAIN_TYPOS = {
    'gmial.com':'gmail.com','gmai.com':'gmail.com','gmal.com':'gmail.com',
    'gmail.co':'gmail.com','gmailcom':'gmail.com','gnail.com':'gmail.com',
    'gmaill.com':'gmail.com','gamil.com':'gmail.com',
    'yahooo.com':'yahoo.com','yaho.com':'yahoo.com','yahoo.co':'yahoo.com','yhaoo.com':'yahoo.com',
    'hotmial.com':'hotmail.com','hotmai.com':'hotmail.com','hotmial.co':'hotmail.com',
    'hotmail.co':'hotmail.com','hotnail.com':'hotmail.com',
    'outlok.com':'outlook.com','outloo.com':'outlook.com','outlook.co':'outlook.com',
    'iclould.com':'icloud.com','icloud.co':'icloud.com','iclud.com':'icloud.com'
  };

  // Returns { ok:true } or { ok:false, message: '...' }
  function checkEmail(raw){
    const email = (raw || '').trim().toLowerCase();
    // Solid format check: local@domain.tld, no spaces, real TLD of 2+ letters.
    const fmt = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/;
    if (!email || !fmt.test(email)) {
      return { ok:false, message:'Please enter a valid email address.' };
    }
    const domain = email.split('@')[1];
    const local = email.split('@')[0];
    // Reject silly same-on-both-sides junk like a@a.aa or test@test.com.
    if (local === domain.split('.')[0] && local.length <= 4) {
      return { ok:false, message:'Please enter your real email address.' };
    }
    // Reject disposable / throwaway domains.
    if (DISPOSABLE_DOMAINS.indexOf(domain) !== -1) {
      return { ok:false, message:'Please use a permanent email address, not a temporary one.' };
    }
    // Catch typos and suggest the fix.
    if (DOMAIN_TYPOS[domain]) {
      return { ok:false, message:'Did you mean ' + local + '@' + DOMAIN_TYPOS[domain] + '? Please check your email.' };
    }
    return { ok:true };
  }

  // Wake the API immediately on page load. The free host sleeps after idle and
  // takes ~30-50s to wake; pinging now means it is usually awake by the time the
  // visitor finishes typing, so geocode and calculate don't hang.
  try { fetch(HD_API_BASE + '/health', { mode:'cors' }).catch(()=>{}); } catch(_){}

  const btn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('form-error');
  const statusBox = document.getElementById('calc-status');
  const locInput = document.getElementById('location');
  const locList = document.getElementById('location-suggestions');

  // ---------- City autocomplete ----------
  // Debounced fetch against our /geocode endpoint. Cached so repeating queries
  // don't re-hit Nominatim. Supports keyboard nav.
  const sugCache = new Map();
  let sugDebounce = null;
  let sugCurrent = [];
  let sugActive = -1;
  let sugPicked = false;  // user explicitly picked - skip showing again on focus

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function hideSug(){ locList.classList.remove('open'); sugCurrent = []; sugActive = -1; }
  function showSugLoading(){
    locList.innerHTML = '<li class="loc-loading">Searching...</li>';
    locList.classList.add('open');
  }
  function showSugEmpty(){
    locList.innerHTML = '<li class="loc-empty">No matches. Try "City, Country".</li>';
    locList.classList.add('open');
    sugCurrent = []; sugActive = -1;
  }
  function showSug(results){
    sugCurrent = results;
    sugActive = -1;
    if (!results || results.length === 0) { showSugEmpty(); return; }
    locList.innerHTML = results.map((r,i)=>`<li class="loc-item" role="option" data-i="${i}">${escapeHTML(r.display_name)}</li>`).join('');
    locList.classList.add('open');
    locList.querySelectorAll('.loc-item').forEach(el=>{
      el.addEventListener('mousedown', e=>{
        e.preventDefault();  // prevent input blur before click
        pickSug(sugCurrent[parseInt(el.dataset.i,10)]);
      });
      el.addEventListener('mouseenter', ()=>{
        sugActive = parseInt(el.dataset.i,10);
        highlightSug();
      });
    });
  }
  function highlightSug(){
    locList.querySelectorAll('.loc-item').forEach((el,i)=>{
      el.classList.toggle('active', i === sugActive);
    });
  }
  function pickSug(s){
    if (!s) return;
    locInput.value = s.display_name;
    sugPicked = true;
    hideSug();
  }

  function showSugUnavailable(){
    locList.innerHTML = '<li class="loc-empty">Location lookup is temporarily unavailable. Type your city and country (for example, "Smolyan, Bulgaria") and continue.</li>';
    locList.classList.add('open');
    sugCurrent = []; sugActive = -1;
  }

  async function fetchSug(q){
    if (sugCache.has(q)) { showSug(sugCache.get(q)); return; }
    showSugLoading();
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 8000);
    try {
      const res = await fetch(HD_API_BASE + '/geocode?q=' + encodeURIComponent(q), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) { showSugUnavailable(); return; }
      const data = await res.json();
      sugCache.set(q, data.results || []);
      showSug(data.results || []);
    } catch (e) {
      clearTimeout(timer);
      // API unreachable (server offline / cold start / network). Tell the user
      // they can still type the location manually rather than leaving a dead field.
      showSugUnavailable();
    }
  }

  locInput.addEventListener('input', ()=>{
    sugPicked = false;
    clearTimeout(sugDebounce);
    const q = locInput.value.trim();
    if (q.length < 2) { hideSug(); return; }
    sugDebounce = setTimeout(()=>fetchSug(q), 300);
  });
  locInput.addEventListener('keydown', e=>{
    if (!locList.classList.contains('open') || sugCurrent.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sugActive = Math.min(sugActive + 1, sugCurrent.length - 1);
      if (sugActive < 0) sugActive = 0;
      highlightSug();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sugActive = Math.max(sugActive - 1, 0);
      highlightSug();
    } else if (e.key === 'Enter' && sugActive >= 0) {
      e.preventDefault();
      pickSug(sugCurrent[sugActive]);
    } else if (e.key === 'Escape') {
      hideSug();
    }
  });
  locInput.addEventListener('blur', ()=>{
    // small delay so click on suggestion fires first
    setTimeout(hideSug, 150);
  });
  locInput.addEventListener('focus', ()=>{
    if (sugPicked) return;
    const q = locInput.value.trim();
    if (q.length >= 2 && sugCache.has(q)) showSug(sugCache.get(q));
  });

  // ---------- Form submission ----------

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  }
  function clearError() {
    errorBox.classList.remove('show');
    errorBox.textContent = '';
  }
  function setLoading(on, msg) {
    btn.disabled = on;
    btn.textContent = on ? 'Calculating...' : 'Calculate my chart';
    statusBox.textContent = on ? (msg || 'Reading the sky at the moment you were born.') : '';
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    clearError();

    const payload = {
      name:     form.name.value.trim() || null,
      date:     form.date.value,
      time:     form.time.value,
      location: form.location.value.trim(),
    };
    const email = form.email.value.trim();

    const emailCheck = checkEmail(email);
    if (!emailCheck.ok) {
      showError(emailCheck.message);
      return;
    }

    if (!payload.date || !payload.time || !payload.location) {
      showError('Please fill in birth date, time, and location.');
      return;
    }
    if (payload.date > new Date().toISOString().split('T')[0]) {
      showError('Birth date cannot be in the future. Please enter your real date of birth.');
      return;
    }
    if (payload.location.length < 3 || !/[a-zA-Z]{3,}/.test(payload.location)) {
      showError('Please enter a full birth place, for example "Smolyan, Bulgaria".');
      return;
    }

    setLoading(true, 'Finding your birth coordinates...');

    try {
      const res = await fetch(HD_API_BASE + '/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail = 'Calculation failed.';
        try { detail = (await res.json()).detail || detail; } catch (_) {}
        showError(detail);
        setLoading(false);
        return;
      }

      setLoading(true, 'Calculating your chart...');
      const data = await res.json();

      // Send the lead to your email-capture service so you actually collect it.
      // Web3Forms is email-only and free. Replace the access key below with your
      // own from web3forms.com (Create Access Key). Until then this is a no-op.
      const LEAD_CAPTURE_KEY = 'YOUR_WEB3FORMS_ACCESS_KEY';
      if (LEAD_CAPTURE_KEY && LEAD_CAPTURE_KEY !== 'YOUR_WEB3FORMS_ACCESS_KEY') {
        try {
          fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              access_key: LEAD_CAPTURE_KEY,
              subject: 'New chart lead from designedtothrive.us',
              from_name: 'Designed to Thrive chart',
              name: payload.name || '(no name)',
              email: email,
              birth_date: payload.date,
              birth_time: payload.time,
              birth_location: payload.location,
              type: (data.chart && data.chart.type) || '',
              profile: (data.chart && data.chart.profile) || '',
              authority: (data.chart && data.chart.authority) || '',
            }),
          }).catch(()=>{});
        } catch (_) {}
      }

      // Store result for the result page. sessionStorage so it does not persist
      // beyond the browser tab (privacy-respecting).
      const stash = {
        chart: data.chart,
        birth_info: data.birth_info,
        input: data.input,
        email: email || null,
        ts: Date.now(),
      };
      try {
        sessionStorage.setItem('dtt_chart_result', JSON.stringify(stash));
      } catch (_) {
        // sessionStorage blocked - fall through, result page will show fallback.
      }

      window.location.href = 'result.html';
    } catch (err) {
      console.error(err);
      showError('The chart calculator is temporarily offline. It may be waking up after a period of inactivity, please wait a few seconds and try again.');
      setLoading(false);
    }
  });

  // When the user returns via the browser back button, the page may be restored
  // from the back/forward cache with stale inputs and the button frozen on
  // "Calculating...". Force a clean reload so the form is fresh and usable again.
  window.addEventListener('pageshow', function(e){
    if (e.persisted) {           // page came from bfcache (back/forward)
      window.location.reload();
      return;
    }
    setLoading(false);
    clearError();
    if (statusBox) statusBox.textContent = '';
  });
})();
