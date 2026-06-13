// Designed to Thrive - result page renderer.
// Reads the chart result from sessionStorage and renders the dynamic page.

(function(){
  const root = document.getElementById('result-root');
  if (!root) return;

  // Plain-language type descriptions. Kept short - the goal here is to lead
  // them to a reading, not to be a full primer.
  const TYPE_COPY = {
    'Manifestor': {
      pct: 'about 9% of people',
      essence: 'Here to initiate, impact, and move. You carry an energy others feel before you speak.',
      work: 'Inform the people affected by your moves, instead of asking permission or going quiet.',
    },
    'Generator': {
      pct: 'about 37% of people',
      essence: 'Here to respond. You have a defined Sacral that lights up around the right work and goes silent around the wrong work.',
      work: 'Stop pushing into action. Start tracking what your body says yes to and let response guide you.',
    },
    'Manifesting Generator': {
      pct: 'about 33% of people',
      essence: 'Here to respond, then move fast. You can pivot, multi-task, and follow energy in ways most people cannot.',
      work: 'Honor the pivot. Inform the people affected. Stop apologizing for not staying on one straight path.',
    },
    'Projector': {
      pct: 'about 20% of people',
      essence: 'Here to see, guide, and direct energy. You are not designed for sustained output the way Generators are.',
      work: 'Wait for the invitation for the big things. Stop trying to prove your worth through volume of effort.',
    },
    'Reflector': {
      pct: 'about 1% of people',
      essence: 'Here to mirror the health of your environment. You take in everything and sample the world through your open centers.',
      work: 'Your environment is everything. Give yourself a full lunar cycle before any major decision.',
    },
  };

  const SALE_HOOK = {
    'Generator': 'Why you feel drained even doing things you chose, and how to tell a real yes from a should.',
    'Manifesting Generator': 'Why you start three things at once and burn out, and which to actually finish.',
    'Manifestor': 'Why people resist you when you are just being yourself, and how to move without the friction.',
    'Projector': 'Why effort alone keeps getting ignored, and how recognition and the right invitation change everything.',
    'Reflector': 'Why the people and places around you decide your whole mood, and how to choose them on purpose.',
  };

  const AUTHORITY_COPY = {
    'Emotional (Solar Plexus)': 'Your truth comes over a wave, not in a moment. Sleep on it. Wait through the high and the low. There is no truth in the now for you.',
    'Sacral':       'Your truth is in your gut sounds and your body. Uh-huh / uh-uh. Respond, do not initiate from your head.',
    'Splenic':      'Your truth is a quiet, in-the-moment knowing. It speaks once. Listen the first time.',
    'Ego Manifested':   'Your truth comes from what your heart is willing to commit to and follow through on. If your will says yes, the answer is yes.',
    'Ego Projected':    'Your truth lives in what you actually want and what you are willing to commit to. Speak it out loud and listen to what comes out.',
    'Self-Projected':   'Your truth is in your own voice. Talk it out with someone who will listen without advising. Hear yourself say it.',
    'Mental (Sounding Board)': 'You do not have inner authority the way other types do. Talk to several trusted people across days. Your clarity comes through the right environment, not from inside.',
    'Lunar':            'You need a full lunar cycle (about 28 days) to know your truth on any major decision. Talk to different people in different places across the month.',
  };

  const STRATEGY_COPY = {
    'To Inform':                'Before you act, tell the people who will feel the impact. Not for permission. So they can move with you instead of resisting.',
    'To Respond':               'Wait for life to bring something to respond to. Your body knows what is yours by the way it lights up or goes flat.',
    'To Respond, then Inform':  'Respond first like a Generator. Once you commit, inform the people affected before you pivot, skip steps, or change direction.',
    'Wait for the Invitation':  'Wait for recognition and invitation for the big things: the relationship, the job, the move. Without it, you push and burn out.',
    'Wait a Lunar Cycle':       'Give every major decision a full lunar cycle, around 28 days. Move through different environments. Talk to different people. Then decide.',
  };

  function getResult() {
    try {
      const raw = sessionStorage.getItem('dtt_chart_result');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
  }

  function renderMissing() {
    root.innerHTML = `
      <header class="page-head"><div class="wrap" style="text-align:center">
        <span class="eyebrow">No chart yet</span>
        <h1>Let's get your <em>chart</em></h1>
        <p style="margin:0 auto">It looks like you landed here without calculating a chart yet. Head to the chart page to enter your birth details.</p>
        <a href="chart.html" class="btn btn-solid" style="margin-top:1.6rem">Calculate my chart</a>
      </div></header>`;
  }

  function render(data) {
    const c = data.chart;
    const b = data.birth_info || {};
    const input = data.input || {};
    const firstName = (input.name || '').trim();

    const typeCopy = TYPE_COPY[c.type] || { pct: '', essence: '', work: '' };
    const authCopy = AUTHORITY_COPY[c.authority] || '';
    const stratCopy = STRATEGY_COPY[c.strategy] || '';

    const allCenters = ['Head','Ajna','Throat','G','Heart','Solar Plexus','Sacral','Spleen','Root'];
    const defined = new Set(c.defined_centers || []);

    const centersHTML = allCenters.map(name => {
      const cls = defined.has(name) ? 'defined' : 'open';
      return `<span class="center-pill ${cls}">${escapeHTML(name)}</span>`;
    }).join('');

    const birthDate = input.date ? new Date(input.date + 'T00:00:00').toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'}) : '';

    const resolvedName = (b.resolved_name || '').trim();
    const typedLoc = (input.location || '').trim();
    // Show resolved name only if it differs meaningfully from what the user typed
    // (otherwise repeating it just adds noise).
    const showResolved = resolvedName && resolvedName.toLowerCase() !== typedLoc.toLowerCase();

    const greeting = firstName
      ? `Hi ${escapeHTML(firstName)}, here is your <em>chart</em>.`
      : `Here is your <em>chart</em>.`;

    root.innerHTML = `
      <header class="page-head"><div class="wrap type-hero">
        <span class="eyebrow">Your chart is ready</span>
        <h1>${greeting}</h1>
        <p>You're a <strong style="color:var(--charcoal)">${escapeHTML(c.type)}</strong> with a <strong style="color:var(--charcoal)">${escapeHTML(c.profile)}</strong> profile and <strong style="color:var(--charcoal)">${escapeHTML(c.authority)}</strong> authority. ${escapeHTML(typeCopy.essence)}</p>
      </div></header>

      <section class="section"><div class="wrap" style="max-width:920px">
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Type</div>
            <div class="value">${escapeHTML(c.type)}</div>
            <div class="note">${escapeHTML(typeCopy.pct)}. ${escapeHTML(typeCopy.essence)}</div>
          </div>
          <div class="stat">
            <div class="label">Strategy</div>
            <div class="value">${escapeHTML(c.strategy)}</div>
            <div class="note">${escapeHTML(stratCopy)}</div>
          </div>
          <div class="stat">
            <div class="label">Authority</div>
            <div class="value">${escapeHTML(c.authority)}</div>
            <div class="note">${escapeHTML(authCopy)}</div>
          </div>
          <div class="stat">
            <div class="label">Profile</div>
            <div class="value">${escapeHTML(c.profile)}</div>
            <div class="note">Your conscious / unconscious life themes. The shape of how you show up and what you learn through.</div>
          </div>
        </div>

        <div class="offer-cta">
          <span class="flag">Your full reading</span>
          <h3>This is your blueprint. <em>The reading is what to do with it.</em></h3>
          <p>You're a <strong style="color:#fff">${escapeHTML(c.type)}</strong>, and your free chart stops at the surface. Your full reading goes deep into your actual life: ${escapeHTML(SALE_HOOK[c.type] || 'what your chart means for your work, relationships, and the decisions in front of you.')}</p>
          <p style="margin-bottom:0">A complete written reading of every center, channel, and gate in your chart, plus a practical plan for living it. Written for you, from your exact birth moment.</p>
          <div class="price-row">
            <span class="price">From $49</span>
            <span class="price-note">Most chosen: the full reading at $149. See a sample before you buy.</span>
          </div>
          <div class="cta-btns">
            <a href="readings.html" class="btn btn-solid">Get my full reading</a>
            <a href="sample-reading.html" class="btn btn-ghost" target="_blank" rel="noopener">See a sample first</a>
          </div>
        </div>

        <div style="margin-top:2.6rem">
          <span class="eyebrow">Your nine centers</span>
          <h2 style="font-size:clamp(1.5rem,2.6vw,2rem);margin:.8rem 0 1rem">Where you're <em style="font-style:italic;color:var(--gold-deep)">consistent</em> and where you're <em style="font-style:italic;color:var(--gold-deep)">open</em></h2>
          <p class="lead" style="margin-bottom:1.2rem">Filled-in centers are where you carry consistent energy. Open centers are where you take in, amplify, and learn from the people around you.</p>
          <div>${centersHTML}</div>
          <p style="font-size:.86rem;color:var(--ink-soft);margin-top:1rem"><strong style="color:var(--charcoal)">Defined:</strong> ${escapeHTML((c.defined_centers||[]).join(', ') || 'none')}<br><strong style="color:var(--charcoal)">Open:</strong> ${escapeHTML((c.undefined_centers||[]).join(', ') || 'none')}</p>
        </div>

        <div class="themes">
          <div class="theme-card">
            <div class="k">Signature (when aligned)</div>
            <div class="v">${escapeHTML(c.signature || '')}</div>
          </div>
          <div class="theme-card">
            <div class="k">Not-self theme (when off)</div>
            <div class="v">${escapeHTML(c.not_self_theme || '')}</div>
          </div>
        </div>

        ${birthDate ? `<div class="birth-meta">
          <p>Calculated from your birth on <strong style="color:var(--charcoal)">${escapeHTML(birthDate)} at ${escapeHTML(input.time||'')}</strong> in <strong style="color:var(--charcoal)">${escapeHTML(typedLoc)}</strong>.</p>
          ${showResolved ? `<p style="margin-top:.4rem"><strong style="color:var(--charcoal)">Location resolved to:</strong> ${escapeHTML(resolvedName)} (${escapeHTML(b.timezone||'')}, UTC${b.utc_offset_hours>=0?'+':''}${b.utc_offset_hours}). If that's not where you were born, <a href="chart.html" style="color:var(--gold-deep);text-decoration:underline">recalculate with a more specific city + country</a>.</p>` : `<p style="margin-top:.4rem;font-size:.84rem">Timezone used: ${escapeHTML(b.timezone||'')}, UTC${b.utc_offset_hours>=0?'+':''}${b.utc_offset_hours}.</p>`}
        </div>` : ''}
      </div></section>

      <!-- LEAD TO A READING -->
      <section class="section center next-step">
        <div class="wrap" style="max-width:680px;margin:0 auto">
          <span class="eyebrow">Your next step</span>
          <h2>You've seen the <em>what</em>. The reading is the <em>how</em>.</h2>
          <p>Your free chart shows your type, strategy, authority, and profile. The full reading is where it becomes useful: the patterns that keep repeating in your life, the work and rhythm that actually fit your energy, the decisions you have been forcing, and the ones you have been quietly avoiding. It is the part most people say finally made it click.</p>
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:2rem">
            <a href="readings.html" class="btn btn-solid">Get my full reading</a>
            <a href="readings.html#sample" class="btn btn-ghost">See a sample first</a>
          </div>
          <p style="font-size:.84rem;color:rgba(250,246,240,.55);margin-top:1.8rem">Starter readings from $49. Most chosen: the full Human Design Reading at $149. See exactly what you get before you book.</p>
          <p style="font-size:.92rem;color:rgba(250,246,240,.72);margin-top:2.2rem;border-top:1px solid rgba(250,246,240,.15);padding-top:1.8rem">Not ready yet? Follow <a href="https://instagram.com/designedtothrive.us" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline">@designedtothrive.us</a> on Instagram. I break down one type, center, channel, or gate every day, so yours will come up. designedtothrive.us</p>
        </div>
      </section>
    `;
  }

  const data = getResult();
  if (data && data.chart && data.chart.type) {
    render(data);
  } else {
    renderMissing();
  }
})();
