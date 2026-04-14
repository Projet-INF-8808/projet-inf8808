import './style.css'
import './charts/medalChart.css'
import './charts/athletesTable.css'
import { loadAthletesTableMedalsData, initAthletesTable } from './charts/athletesTable.js'
import './charts/dailyMedalChart.css'
import './charts/genderPieChart.css'

import { loadData, renderMedalChart, computeMedalTotals }           from './charts/medalChart.js'
import { loadDailyData, renderDailyMedalChart, buildDailyData } from './charts/dailyMedalChart.js'
import { loadGenderData, renderGenderPieChart } from './charts/genderPieChart.js'
import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

// ─────────────────────────────────────────────────────────────
//  PAGE SHELL
// ─────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <!-- ══════════════════════════════════════════════
       SECTION 1 — Medal bar chart
  ══════════════════════════════════════════════ -->
  <section id="section-viz1" class="page-section" aria-label="Graphique des médailles par pays">
    <div class="section-header">
      <h2 class="section-title">Médailles aux Jeux Olympiques d'hiver 2022</h2>
      <p class="section-subtitle">Classement des pays par nombre total de médailles — Or, Argent, Bronze</p>
    </div>
    <div id="medal-chart-wrapper"></div>
  </section>

    <!-- ══════════════════════════════════════════════
      SECTION DIVIDER
    ══════════════════════════════════════════════ -->
  <div class="section-divider" aria-hidden="true"></div>

    <!-- ══════════════════════════════════════════════
      SECTION 2 — Gender pie chart
    ══════════════════════════════════════════════ -->
  <section id="section-viz2" class="page-section" aria-label="Répartition par genre">
    <div class="section-header">
      <h2 class="section-title">Répartition selon le genre</h2>
      <p class="section-subtitle">Participation proportionnelle par catégorie</p>
    </div>
    <div id="gender-pie-wrapper"></div>
  </section>

  <div class="section-divider" aria-hidden="true"></div>

  <div id="medal-tooltip" role="tooltip"></div>

    <!-- ══════════════════════════════════════════════
      SECTION 4 — Athletes table
    ══════════════════════════════════════════════ -->
  <section id="athletes-table-section" class="page-section" aria-label="Athletes avec plusieurs medailles">
  </section>

    <!-- ══════════════════════════════════════════════
      SECTION DIVIDER
    ══════════════════════════════════════════════ -->
  <div class="section-divider" aria-hidden="true"></div>

    <!-- ══════════════════════════════════════════════
      SECTION 5 — Daily medal events
    ══════════════════════════════════════════════ -->
  <section id="section-viz5" class="page-section" aria-label="Évolution journalière des événements médaillés">
    <div class="section-header">
      <h2 class="section-title">Évolution journalière des Jeux olympiques d'hiver 2022</h2>
      <p class="section-subtitle">
        Nombre d'événements finaux médaillés (or) par journée — survolez ou naviguez avec les flèches
      </p>
    </div>

    <div class="daily-layout">

      <!-- LEFT : chart + arrow nav -->
      <div class="daily-left">
        <div id="daily-chart-wrapper"></div>

        <div class="time-nav" id="time-nav" aria-label="Navigation temporelle">
          <button class="time-nav-btn" id="btn-prev" aria-label="Jour précédent" disabled>&#8592;</button>
          <div class="time-nav-label" id="time-nav-label" aria-live="polite">
            <span id="time-nav-date">—</span>
            <span class="time-nav-progress" id="time-nav-progress"></span>
          </div>
          <button class="time-nav-btn" id="btn-next" aria-label="Jour suivant">&#8594;</button>
        </div>
      </div>

      <!-- RIGHT : three panels -->
      <div class="daily-right">

        <!-- Panel 1 — Events for selected day -->
        <div class="side-panel" id="daily-detail" aria-live="polite">
          <div class="side-panel-header">
            <span class="side-panel-title">Événements du jour</span>
          </div>
          <div class="side-panel-body side-panel-placeholder">
            <span class="placeholder-icon">🏅</span>
            <span class="placeholder-text">Sélectionnez un jour</span>
          </div>
        </div>

        <!-- Panel 2 — Placeholder -->
        <div class="side-panel">
          <div class="side-panel-header">
            <span class="side-panel-title">Statistiques</span>
          </div>
          <div class="side-panel-body side-panel-placeholder">
            <span class="placeholder-icon">📊</span>
            <span class="placeholder-text">À venir</span>
          </div>
        </div>

        <!-- Panel 3 — Placeholder -->
        <div class="side-panel">
          <div class="side-panel-header">
            <span class="side-panel-title">Classement</span>
          </div>
          <div class="side-panel-body side-panel-placeholder">
            <span class="placeholder-icon">🏆</span>
            <span class="placeholder-text">À venir</span>
          </div>
        </div>

      </div>
    </div>
  </section>
  <div id="daily-tooltip" role="tooltip"></div>
`

// ─────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────
let globalGenderFilter = null
let pieControls = null
let dailyChartControls = null

function updateAllVisualizations () {
  if (pieControls) {
    pieControls.updateSelection(globalGenderFilter)
  }

  const filteredMedalData = computeMedalTotals(globalGenderFilter)
  renderMedalChart('#medal-chart-wrapper', filteredMedalData)

  const sexSelect = document.querySelector('#athletes-table-filter-sex')
  if (sexSelect) {
    const map = { M: 'Homme', W: 'Femme', X: 'Mixte', O: 'Autre' }
    sexSelect.value = globalGenderFilter ? map[globalGenderFilter] : 'Tous'
    sexSelect.dispatchEvent(new Event('change'))
  }

  const filteredDailyData = buildDailyData(globalGenderFilter)
  dailyChartControls = renderDailyMedalChart(
    '#daily-chart-wrapper',
    filteredDailyData,
    (_date, dayData, index, total) => {
      renderDetailPanel(dayData)
      updateNavUI(index, total, dayData)
    }
  )
}

function handleGenderSelect (gender) {
  globalGenderFilter = (globalGenderFilter === gender) ? null : gender
  updateAllVisualizations()
}

// ─────────────────────────────────────────────────────────────
//  VIZ 1 — Medal bar chart
// ─────────────────────────────────────────────────────────────
loadData()
  .then(medalData => {
    renderMedalChart('#medal-chart-wrapper', medalData)
  })
  .catch(err => {
    console.error('Viz 1 – erreur :', err)
    document.querySelector('#medal-chart-wrapper').innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
  })

// ─────────────────────────────────────────────────────────────
//  VIZ 2 — Gender Pie Chart
// ─────────────────────────────────────────────────────────────
loadGenderData()
  .then(data => {
    pieControls = renderGenderPieChart('#gender-pie-wrapper', data, handleGenderSelect)
  })
  .catch(err => {
    console.error('Viz 2 – erreur :', err)
    document.querySelector('#gender-pie-wrapper').innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
  })

// ─────────────────────────────────────────────────────────────
//  VIZ 4 — Athletes table
// ─────────────────────────────────────────────────────────────
loadAthletesTableMedalsData()
  .then(athletesTableData => {
    initAthletesTable('#athletes-table-section', athletesTableData)
  })
  .catch(err => {
    console.error('Viz 4 – erreur :', err)
    const athletesTableSection = document.querySelector('#athletes-table-section')
    if (athletesTableSection) {
      athletesTableSection.innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
    }
  })

// ─────────────────────────────────────────────────────────────
//  VIZ 5 — Daily medal events + arrow nav
// ─────────────────────────────────────────────────────────────
const fmtLong     = d3.timeFormat('%A %d %B %Y')
const fmtShort    = d3.timeFormat('%d %B %Y')

const btnPrev     = document.getElementById('btn-prev')
const btnNext     = document.getElementById('btn-next')
const navDate     = document.getElementById('time-nav-date')
const navProgress = document.getElementById('time-nav-progress')
const detailPanel = document.getElementById('daily-detail')

function updateNavUI (index, total, dayData) {
  btnPrev.disabled = index <= 0
  btnNext.disabled = index >= total - 1
  navDate.textContent     = fmtShort(dayData.date)
  navProgress.textContent = `Jour ${index + 1} / ${total}`
}

function renderDetailPanel (dayData) {
  if (!detailPanel || !dayData) return

  const cards = dayData.events.map(e => `
    <div class="dd-card">
      <img class="dd-card-flag"
           src="${ASSET_BASE}/flags/${e.code.toLowerCase()}.svg"
           alt="${e.code}"
           onerror="this.style.display='none'" />
      <div class="dd-card-info">
        <div class="dd-card-event">${e.event}</div>
        <div class="dd-card-discipline">${e.discipline} · ${e.country}</div>
      </div>
      <div class="dd-medal-dot" title="Or" aria-label="Médaille d'or"></div>
    </div>
  `).join('')

  detailPanel.innerHTML = `
    <div class="side-panel-header">
      <span class="side-panel-title">Événements du jour</span>
      <span class="dd-badge">${dayData.count} événement${dayData.count > 1 ? 's' : ''}</span>
    </div>
    <div class="side-panel-body">
      <div class="dd-date-label">${fmtLong(dayData.date)}</div>
      <div class="dd-grid">${cards}</div>
    </div>
  `
}

loadDailyData()
  .then(data => {
    dailyChartControls = renderDailyMedalChart(
      '#daily-chart-wrapper',
      data,
      (_date, dayData, index, total) => {
        renderDetailPanel(dayData)
        updateNavUI(index, total, dayData)
      }
    )

    btnPrev.onclick = () => { if (dailyChartControls) dailyChartControls.prev() }
    btnNext.onclick = () => { if (dailyChartControls) dailyChartControls.next() }

    document.onkeydown = e => {
      if (!dailyChartControls) return
      if (e.key === 'ArrowLeft') dailyChartControls.prev()
      if (e.key === 'ArrowRight') dailyChartControls.next()
    }
  })
  .catch(err => {
    console.error('Viz 5 – erreur :', err)
    document.querySelector('#daily-chart-wrapper').innerHTML =
      '<p style="color:red;text-align:center">Erreur lors du chargement des données journalières.</p>'
  })
