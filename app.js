// ---- mobile nav toggle ----
document.addEventListener('click', function(e){
  if(e.target.closest('.nav-toggle')){
    document.querySelector('.nav-links').classList.toggle('open');
  }
});


// ---- desktop "More" dropdown ----
document.addEventListener('click', function(e){
  const btn = e.target.closest('.nav-drop > button');
  const drop = document.querySelector('.nav-drop');
  if(!drop) return;
  if(btn){
    e.preventDefault();
    const open = drop.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  } else if(!e.target.closest('.nav-drop')){
    drop.classList.remove('open');
    const b = drop.querySelector('button'); if(b) b.setAttribute('aria-expanded','false');
  }
});

// ---- respect reduced motion ----
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- nav shadow on scroll (activates existing .nav.scrolled style) ----
(function(){
  const nav = document.querySelector('.nav');
  if(!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});
})();

// ---- scroll reveal ----
document.addEventListener('DOMContentLoaded', function(){
  const els = document.querySelectorAll('[data-reveal]');
  if(REDUCE || !('IntersectionObserver' in window)){
    els.forEach(el=>el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
    });
  },{threshold:0.12, rootMargin:'0px 0px -8% 0px'});
  els.forEach(el=>io.observe(el));
});

// ---- contact form: submit to Web3Forms via fetch, stay on page ----
(function(){
  const form = document.getElementById('contact-form');
  if(!form) return;
  const status = form.querySelector('.form-status');
  const btn = form.querySelector('button');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if(status){ status.textContent = 'Sending...'; status.style.color = 'var(--ink-soft)'; }
    if(btn){ btn.disabled = true; }
    try{
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: new FormData(form)
      });
      const data = await res.json();
      if(data.success){
        form.reset();
        if(status){ status.textContent = 'Thank you. Your message was sent, and you will hear back by email.'; status.style.color = 'var(--charcoal)'; }
      } else {
        if(status){ status.textContent = 'Something went wrong. Please email hello@designedtothrive.us directly.'; status.style.color = '#b0492f'; }
      }
    } catch(err){
      if(status){ status.textContent = 'Network error. Please email hello@designedtothrive.us directly.'; status.style.color = '#b0492f'; }
    } finally {
      if(btn){ btn.disabled = false; }
    }
  });
})();
