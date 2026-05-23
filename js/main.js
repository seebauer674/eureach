// ── Nav scroll effect ─────────────────────────────────
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 20);
}, { passive: true });

// ── Scroll reveal ─────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add("visible"), i * 80);
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

// ── Animated counter ──────────────────────────────────
function animateCount(el, target, prefix = "", suffix = "") {
  const duration = 1800;
  const start = performance.now();
  const isFloat = target % 1 !== 0;
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = isFloat ? (target * ease).toFixed(2) : Math.round(target * ease);
    el.textContent = prefix + val + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const text = el.textContent;
    if (text.includes("70")) animateCount(el, 70, "", "+");
    else if (text === "6")   animateCount(el, 6);
    else if (text === "3")   animateCount(el, 3);
    statObserver.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll(".stat-val").forEach(el => statObserver.observe(el));

// ── Mockup lead cycling ───────────────────────────────
const leads = [
  { icon: "🦷", bg: "rgba(37,99,235,0.15)",   name: "Dental Studio Müller",        cat: "Dentist · Munich",          tag: "New",  cls: "tag-new" },
  { icon: "🏨", bg: "rgba(245,158,11,0.15)",  name: "Hotel Santorini View",        cat: "Boutique Hotel · Thira",    tag: "Hot",  cls: "tag-hot" },
  { icon: "⚖️", bg: "rgba(124,58,237,0.15)",  name: "Kanzlei Weber & Partner",     cat: "Law firm · Berlin",          tag: "Warm", cls: "tag-warm" },
  { icon: "🏥", bg: "rgba(34,197,94,0.15)",   name: "Ιατρείο Παπαδόπουλου",       cat: "Doctor · Athens",            tag: "New",  cls: "tag-new" },
  { icon: "🧹", bg: "rgba(8,145,178,0.15)",   name: "CleanPro Services GmbH",      cat: "Cleaning · Vienna",          tag: "New",  cls: "tag-new" },
  { icon: "💇", bg: "rgba(239,68,68,0.15)",   name: "Κομμωτήριο Ελένης",          cat: "Hair Salon · Thessaloniki",  tag: "Warm", cls: "tag-warm" },
  { icon: "🚗", bg: "rgba(16,185,129,0.15)",  name: "Autohaus Brenner",            cat: "Car dealer · Hamburg",       tag: "Hot",  cls: "tag-hot" },
  { icon: "✈️", bg: "rgba(245,158,11,0.15)", name: "Sunway Travel Agency",        cat: "Travel · Rhodes",            tag: "New",  cls: "tag-new" },
];

let leadIdx = 4;
const leadEls = document.querySelectorAll(".mlead");

function cycleLead() {
  const target = leadEls[Math.floor(Math.random() * leadEls.length)];
  const lead = leads[leadIdx % leads.length];
  leadIdx++;

  target.style.opacity = "0";
  target.style.transform = "translateX(12px)";
  setTimeout(() => {
    target.querySelector(".mlead-icon").textContent = lead.icon;
    target.querySelector(".mlead-icon").style.background = lead.bg;
    target.querySelector(".mlead-name").textContent = lead.name;
    target.querySelector(".mlead-cat").textContent = lead.cat;
    const tag = target.querySelector(".mlead-tag");
    tag.textContent = lead.tag;
    tag.className = "mlead-tag " + lead.cls;
    target.style.opacity = "1";
    target.style.transform = "none";
    target.style.transition = "opacity 0.4s, transform 0.4s";
  }, 200);
}

setInterval(cycleLead, 2400);
