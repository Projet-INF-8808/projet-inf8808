const TEAM = [
  { name: 'Jérôme Chabot',   id: '2144812' },
  { name: 'Olivier Falardeau', id: '2135428' },
  { name: 'Kalis Fallouh',   id: '2178898' },
  { name: 'Walid Fortas',    id: '2047983' },
  { name: 'David Vaillant',  id: '2143989' },
  { name: 'Justin Veilleux', id: '214409'  },
]

const STATS = [
  { value: '91', label: 'Nations',    cls: 'ice'    },
  { sep: true },
  { value: '109', label: 'Épreuves', cls: 'silver'  },
  { sep: true },
  { value: '306', label: 'Médailles', cls: 'gold'   },
  { sep: true },
  { value: '16',  label: 'Jours',    cls: 'ice'     },
]

function buildHeroHTML () {
  const statsHTML = STATS.map(s =>
    s.sep
      ? `<div class="hero-stat-sep" aria-hidden="true"></div>`
      : `<div class="hero-stat">
           <span class="hero-stat-value ${s.cls}">${s.value}</span>
           <span class="hero-stat-label">${s.label}</span>
         </div>`
  ).join('')

  const teamHTML = TEAM.map(m => `
    <div class="hero-member">
      <span class="hero-member-name">${m.name}</span>
      <span class="hero-member-id">${m.id}</span>
    </div>
  `).join('')



  return `
    <section id="landing-hero" role="banner" aria-label="Page de présentation — Pékin 2022 sous la Loupe">
      <canvas id="snow-canvas" aria-hidden="true"></canvas>

      <div class="hero-content">
        <!-- Logo -->
        <img class="hero-logo" src="${import.meta.env.BASE_URL}assets/beijing_2022_logo.png" alt="Logo Olympique Pékin 2022" />

        <!-- Title -->
        <h1 class="hero-title">
          Pékin 2022
          <span class="hero-title-accent">sous la Loupe</span>
        </h1>

        <!-- Subtitle -->
        <p class="hero-subtitle">
          Une exploration interactive des médailles, athlètes et tendances
          des Jeux olympiques d'hiver de 2022.
        </p>

        <!-- Stats -->
        <div class="hero-stats" aria-label="Statistiques clés">
          ${statsHTML}
        </div>

        <!-- CTA -->
        <a href="#section-viz1" class="hero-cta" id="hero-cta-btn" aria-label="Explorer les visualisations">
          Explorer les données
          <span class="hero-cta-arrow" aria-hidden="true">↓</span>
        </a>

        <!-- Team credits -->
        <div class="hero-credits" aria-label="Présenté par">
          <div class="hero-credits-label">Présenté par</div>
          <div class="hero-team-grid">
            ${teamHTML}
          </div>
        </div>
      </div>




    </section>
  `
}

function initSnow (canvasId) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  let W = 0, H = 0, flakes = []
  const COUNT = 130

  function resize () {
    const hero = document.getElementById('landing-hero')
    W = canvas.width  = hero ? hero.offsetWidth  : window.innerWidth
    H = canvas.height = hero ? hero.offsetHeight : window.innerHeight
  }

  function mkFlake () {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.2 + 0.4,
      speed: Math.random() * 0.7 + 0.2,
      drift: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.55 + 0.15,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.018 + 0.006,
    }
  }

  resize()
  window.addEventListener('resize', resize)
  flakes = Array.from({ length: COUNT }, mkFlake)

  function draw () {
    ctx.clearRect(0, 0, W, H)
    for (const f of flakes) {
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(200, 230, 255, ${f.alpha})`
      ctx.fill()

      f.wobble += f.wobbleSpeed
      f.x += f.drift + Math.sin(f.wobble) * 0.25
      f.y += f.speed

      if (f.y > H + 4) {
        f.y = -4
        f.x = Math.random() * W
      }
      if (f.x < -4) f.x = W + 4
      if (f.x > W + 4) f.x = -4
    }
    requestAnimationFrame(draw)
  }
  draw()
}

function bindCTA () {
  const btn = document.getElementById('hero-cta-btn')
  if (!btn) return
  btn.addEventListener('click', e => {
    e.preventDefault()
    const target = document.getElementById('section-viz1')
    if (target) target.scrollIntoView({ behavior: 'smooth' })
  })
}

export function mountLanding () {
  const app = document.querySelector('#app')
  if (!app) return
  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildHeroHTML()
  app.prepend(wrapper.firstElementChild)

  initSnow('snow-canvas')
  bindCTA()
}
