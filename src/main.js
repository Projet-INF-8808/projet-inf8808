import './charts/athletesTable.css'
import { initAthletesTable, loadAthletesTableMedalsData } from './charts/athletesTable.js'
import './charts/countryDailyMedalChart.css'
import './charts/dailyMedalChart.css'
import './charts/genderPieChart.css'
import './charts/medalChart.css'
import './charts/sportsPictogram.css'
import './landing.css'
import './style.css'

import * as d3 from 'd3'
import { computeCountryDailyData, loadCountryDailyMedalData, renderCountryDailyMedalChart } from './charts/countryDailyMedalChart.js'
import { buildDailyData, loadDailyData, renderDailyMedalChart } from './charts/dailyMedalChart.js'
import { computeGenderData, loadGenderData, renderGenderPieChart } from './charts/genderPieChart.js'
import { computeMedalTotals, loadData, renderMedalChart } from './charts/medalChart.js'
import { loadSportsPictogramData, SportsPictogram } from './charts/sportsPictogram.js'
import { mountLanding } from './landing.js'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

let athletesTableController = null
let dailyControls = null
let pictogramController = null
let dailyDateIndex = new Map()
let countryDailyChartControls = null
let globalCountryFilter = null
let globalSelectedDateStr = null
let globalCumulativeMode = false   // when true, panels show all-time data
let _suppressModeSwitch  = false   // prevents internal syncs from exiting cumulative mode
let _isSyncingSelectedDate = false // prevents viz5/viz6 feedback loops
let selectedCountry = null         // currently-selected country for the bar chart

function syncSelectedDate (dateStr, source) {
  if (!dateStr) return
  if (_isSyncingSelectedDate) return

  _isSyncingSelectedDate = true

  try {
    globalSelectedDateStr = dateStr

    // Any chart interaction exits cumulative mode (unless suppressed by internal sync)
    if (!_suppressModeSwitch && globalCumulativeMode) {
      switchToDailyMode()
    }

    // When cumulative mode is on, panels ignore the selected date
    const effectiveDateStr = globalCumulativeMode ? null : dateStr

    if (pictogramController) {
      pictogramController.updateFilters(effectiveDateStr, globalGenderFilter, globalCountryFilter);
    }

    if (athletesTableController?.setExternalFilters) {
      athletesTableController.setExternalFilters({
        dateStr:     effectiveDateStr,
        countryCode: globalCountryFilter,
        sexCode:     globalGenderFilter,
        cumulative:  globalCumulativeMode
      })
    }

    if (source !== 'viz5' && dailyControls?.goTo && dailyDateIndex.has(dateStr)) {
      dailyControls.goTo(dailyDateIndex.get(dateStr))
    }

    if (source !== 'viz6' && countryDailyChartControls?.selectDate) {
      // Only update the selection band when not in cumulative mode
      if (!globalCumulativeMode) {
        countryDailyChartControls.selectDate(dateStr)
      }
    }

    const newPieData = computeGenderData(effectiveDateStr, globalCountryFilter)
    pieControls = renderGenderPieChart('#gender-pie-wrapper', newPieData, handleGenderSelect)
    if (pieControls && globalGenderFilter) {
      pieControls.updateSelection(globalGenderFilter)
    }

    document.dispatchEvent(new CustomEvent('olympic-date-selected', {
      detail: { date: dateStr, source }
    }))
  } finally {
    _isSyncingSelectedDate = false
  }
}

document.querySelector('#app').innerHTML = `
  <!-- ══════════════════════════════════════════════
       SECTION 1 — Medal bar chart
  ══════════════════════════════════════════════ -->
  <section id="section-viz1" class="page-section" aria-label="Graphique des médailles par pays">
    <div class="section-header">
      <h2 class="section-title">Médailles aux Jeux Olympiques d'hiver 2022</h2>
      <p class="section-subtitle">Classement des pays par nombre total de médailles : Or, Argent, Bronze</p>
    </div>
    <div id="medal-chart-wrapper"></div>
  </section>

  <div class="section-divider" aria-hidden="true"></div>

  <!-- tooltips (fixed-position, can live anywhere) -->
  <div id="medal-tooltip"   role="tooltip"></div>
  <div id="daily-tooltip"   role="tooltip"></div>
  <div id="country-daily-tooltip" role="tooltip"></div>

  <!-- ══════════════════════════════════════════════
       SECTION 5 — Daily chart + side panels
  ══════════════════════════════════════════════ -->
  <section id="section-viz5" class="page-section" aria-label="Évolution journalière des événements médaillés">
    <div class="section-header">
      <h2 class="section-title">Évolution journalière des Jeux olympiques d'hiver 2022</h2>
      <p class="section-subtitle">
        Nombre d'événements finaux médaillés par journée : survolez ou naviguez avec les flèches
      </p>
    </div>

    <!-- 2-col grid: chart left, panels right -->
    <div class="viz5-main-layout">

      <!-- LEFT : selector row + line/bar chart + arrow nav -->
      <div class="viz5-left">
        <!-- Shared control bar: country selector (left) + mode toggle (right) -->
        <div class="daily-country-selector-row">
          <div class="country-daily-control">
            <label for="country-daily-select">Filtrer par pays</label>
            <select id="country-daily-select"></select>
          </div>
          <div class="country-daily-country" id="country-daily-country"></div>
          <div class="panels-mode-bar">
            <span class="panels-mode-label">Affichage&nbsp;:</span>
            <div class="mode-pill">
              <button class="mode-tab is-active" id="mode-tab-date">Par journ&eacute;e</button>
              <button class="mode-tab" id="mode-tab-cumul">Cumulatif</button>
            </div>
          </div>
        </div>

        <div id="daily-chart-wrapper"></div>
        <div id="country-daily-chart-wrapper" style="display:none;"></div>

        <div class="time-nav" id="time-nav" aria-label="Navigation temporelle">
          <button class="time-nav-btn" id="btn-prev" aria-label="Jour précédent" disabled>&#8592;</button>
          <div class="time-nav-label" id="time-nav-label" aria-live="polite">
            <span id="time-nav-date">—</span>
            <span class="time-nav-progress" id="time-nav-progress"></span>
          </div>
          <button class="time-nav-btn" id="btn-next" aria-label="Jour suivant">&#8594;</button>
        </div>
      </div>

      <!-- RIGHT : 3 stacked panels -->
      <div class="viz5-right">

        <!-- Panel 1 — Sexe (gender pie chart) -->
        <div class="side-panel" id="panel-sex">
          <div class="side-panel-header">
            <span class="side-panel-title">Sexe</span>
          </div>
          <div class="side-panel-body side-panel-pie">
            <div id="gender-pie-wrapper"></div>
          </div>
        </div>

        <!-- Panel 2 — Événements (pictogram placeholder) -->
        <div class="side-panel" id="panel-events">
          <div class="side-panel-header">
            <span class="side-panel-title">Événements</span>
          </div>
          <div class="side-panel-body side-panel-placeholder">
            <span class="placeholder-icon">🎿</span>
            <span class="placeholder-text">Pictogramme à venir</span>
          </div>
        </div>

        <!-- Panel 3 — Détails (athletes table) -->
        <div id="athletes-table-section" class="side-panel" aria-label="Athlètes avec plusieurs médailles">
        </div>

      </div>
    </div>
  </section>
`

mountLanding()
const modeTabDate  = document.getElementById('mode-tab-date')
const modeTabCumul = document.getElementById('mode-tab-cumul')

function setTimeNavVisible (visible) {
  const timeNav = document.getElementById('time-nav')
  if (timeNav) timeNav.style.visibility = visible ? '' : 'hidden'
}

function switchToDailyMode () {
  globalCumulativeMode = false
  modeTabDate.classList.add('is-active')
  modeTabCumul.classList.remove('is-active')
  setTimeNavVisible(true)
}

function applyPanelMode () {
  setTimeNavVisible(!globalCumulativeMode)
  const effectiveDateStr = globalCumulativeMode ? null : globalSelectedDateStr
  const newPieData = computeGenderData(effectiveDateStr, globalCountryFilter)

  if (pictogramController) {
    pictogramController.updateFilters(effectiveDateStr, globalGenderFilter, globalCountryFilter);
  }

  pieControls = renderGenderPieChart('#gender-pie-wrapper', newPieData, handleGenderSelect)
  if (pieControls && globalGenderFilter) pieControls.updateSelection(globalGenderFilter)
  if (athletesTableController?.setExternalFilters) {
    athletesTableController.setExternalFilters({
      dateStr:     effectiveDateStr,
      countryCode: globalCountryFilter,
      sexCode:     globalGenderFilter,
      cumulative:  globalCumulativeMode
    })
  }
  if (globalCumulativeMode) {
    countryDailyChartControls?.hideSelection?.()
  } else if (globalSelectedDateStr) {
    countryDailyChartControls?.selectDate?.(globalSelectedDateStr)
  }
}

modeTabDate.addEventListener('click', () => {
  if (globalCumulativeMode === false) return
  globalCumulativeMode = false
  modeTabDate.classList.add('is-active')
  modeTabCumul.classList.remove('is-active')
  applyPanelMode()
})
modeTabCumul.addEventListener('click', () => {
  if (globalCumulativeMode === true) return
  globalCumulativeMode = true
  modeTabCumul.classList.add('is-active')
  modeTabDate.classList.remove('is-active')
  applyPanelMode()
})

let globalGenderFilter = null
let pieControls = null
let dailyChartControls = null

function updateAllVisualizations () {
  if (pieControls) {
    pieControls.updateSelection(globalGenderFilter)
  }

  if (pictogramController) {
    const effectiveDateStr = globalCumulativeMode ? null : globalSelectedDateStr;
    pictogramController.updateFilters(effectiveDateStr, globalGenderFilter, globalCountryFilter);
  }
  
  const filteredMedalData = computeMedalTotals(globalGenderFilter)
  renderMedalChart('#medal-chart-wrapper', filteredMedalData)

  const sexSelect = document.querySelector('#athletes-table-filter-sex')
  if (sexSelect) {
    const map = { M: 'Homme', W: 'Femme', X: 'Mixte', O: 'Autre' }
    sexSelect.value = globalGenderFilter ? map[globalGenderFilter] : 'Tous'
    sexSelect.dispatchEvent(new Event('change'))
  }

  let currentIndex = 0
  if (dailyControls) {
    currentIndex = dailyControls.getIndex()
  }

  const filteredDailyData = buildDailyData(globalGenderFilter)
  _suppressModeSwitch = true
  dailyControls = renderDailyMedalChart(
    '#daily-chart-wrapper',
    filteredDailyData,
    (_date, dayData, index, total) => {
      renderDetailPanel(dayData)
      updateNavUI(index, total, dayData)
      syncSelectedDate(d3.timeFormat('%Y-%m-%d')(dayData.date), 'viz5')
    },
    { initialIndex: currentIndex }
  )
  _suppressModeSwitch = false

  if (globalCountryFilter) {
    const newCountryData = computeCountryDailyData(globalGenderFilter)
    const updatedCountry = newCountryData.countries.find(c => c.code === globalCountryFilter)
    if (updatedCountry) {
      selectedCountry = updatedCountry
      renderCountryDailyCountry(updatedCountry, globalSelectedDateStr)
    }
  }
}

function handleGenderSelect (gender) {
  globalGenderFilter = (globalGenderFilter === gender) ? null : gender
  updateAllVisualizations()
}

//  VIZ 1 — Medal bar chart
loadData()
  .then(medalData => {
    renderMedalChart('#medal-chart-wrapper', medalData)
  })
  .catch(err => {
    console.error('Viz 1 – erreur :', err)
    document.querySelector('#medal-chart-wrapper').innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
  })

//  VIZ 2 — Gender Pie Chart
loadGenderData()
  .then(data => {
    pieControls = renderGenderPieChart('#gender-pie-wrapper', data, handleGenderSelect)
  })
  .catch(err => {
    console.error('Viz 2 – erreur :', err)
    document.querySelector('#gender-pie-wrapper').innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
  })

//  VIZ 4 — Athletes table
loadAthletesTableMedalsData()
  .then(athletesTableData => {
    athletesTableController = initAthletesTable('#athletes-table-section', athletesTableData)
  })
  .catch(err => {
    console.error('Viz 4 – erreur :', err)
    const athletesTableSection = document.querySelector('#athletes-table-section')
    if (athletesTableSection) {
      athletesTableSection.innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
    }
  })

//  VIZ 5 — Daily medal events + arrow nav
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
    dailyDateIndex = new Map(data.map((day, index) => [d3.timeFormat('%Y-%m-%d')(day.date), index]))

    dailyControls = renderDailyMedalChart(
      '#daily-chart-wrapper',
      data,
      (_date, dayData, index, total) => {
        renderDetailPanel(dayData)
        updateNavUI(index, total, dayData)
        syncSelectedDate(d3.timeFormat('%Y-%m-%d')(dayData.date), 'viz5')
      }
    )

    btnPrev.onclick = () => { activeChartControls()?.prev?.() }
    btnNext.onclick = () => { activeChartControls()?.next?.() }

    document.onkeydown = e => {
      const ctrl = activeChartControls()
      if (!ctrl) return
      if (e.key === 'ArrowLeft') ctrl.prev()
      if (e.key === 'ArrowRight') ctrl.next()
    }
  })
  .catch(err => {
    console.error('Viz 5 – erreur :', err)
    document.querySelector('#daily-chart-wrapper').innerHTML =
      '<p style="color:red;text-align:center">Erreur lors du chargement des données journalières.</p>'
  })

  loadSportsPictogramData().then(() => {
    pictogramController = new SportsPictogram('#panel-events', {
      dateFilter: globalSelectedDateStr,
      genderFilter: globalGenderFilter,
      countryFilter: globalCountryFilter
    })
  }).catch(err => {
    console.error("erreur de chargement du pictogramme:", err)
  })

//  VIZ 6 — Country daily bar chart (embedded in section 5)
const countrySelect  = document.getElementById('country-daily-select')
const countrySummary = document.getElementById('country-daily-country')
const countryDetail  = document.getElementById('country-daily-detail')

const lineWrapper    = document.getElementById('daily-chart-wrapper')
const barWrapper     = document.getElementById('country-daily-chart-wrapper')

const fmtViz6Date = d3.timeFormat('%d %B %Y')

function activeChartControls () {
  return barWrapper?.style.display !== 'none' ? barNavControls : dailyControls
}

function showLineMode () {
  lineWrapper.style.display = ''
  barWrapper.style.display  = 'none'
  if (countrySummary) countrySummary.innerHTML = ''
}

function showBarMode (countryData) {
  lineWrapper.style.display = 'none'
  barWrapper.style.display  = ''

  if (countrySummary) {
    countrySummary.innerHTML = `
      <img src="${ASSET_BASE}/flags/${countryData.code.toLowerCase()}.svg" alt="${countryData.code}" onerror="this.style.display='none'" />
      <span>${countryData.label} · ${countryData.totals.total} médailles</span>
    `
  }
}

function renderCountryDailyDetail (countryData, dayData) {
  if (!countryDetail || !countryData || !dayData) return

  const medalEvents = dayData.medals
    .sort((a, b) => a.medalType.localeCompare(b.medalType) || a.discipline.localeCompare(b.discipline))
    .map(medal => {
      const label = medal.medalType === 'gold' ? 'Or' : medal.medalType === 'silver' ? 'Argent' : 'Bronze'
      return `
        <div class="country-daily-event">
          <div class="country-daily-event-name">${medal.event}</div>
          <div class="country-daily-event-meta">${medal.discipline} · ${label}</div>
        </div>
      `
    })
    .join('')

  countryDetail.innerHTML = `
    <div class="country-daily-panel-header">
      <span class="country-daily-panel-title">Date sélectionnée</span>
      <span class="country-daily-badge">${dayData.total} médaille${dayData.total > 1 ? 's' : ''}</span>
    </div>
    <div class="country-daily-panel-body">
      <div class="country-daily-date">${fmtViz6Date(dayData.date)}</div>
      <div class="country-daily-stats">
        <div class="country-daily-stat">
          <span class="country-daily-stat-label"><span class="country-daily-stat-dot" style="background:#FFD700"></span>Or</span>
          <span class="country-daily-stat-value">${dayData.gold}</span>
        </div>
        <div class="country-daily-stat">
          <span class="country-daily-stat-label"><span class="country-daily-stat-dot" style="background:#C0C0C0"></span>Argent</span>
          <span class="country-daily-stat-value">${dayData.silver}</span>
        </div>
        <div class="country-daily-stat">
          <span class="country-daily-stat-label"><span class="country-daily-stat-dot" style="background:#CD7F32"></span>Bronze</span>
          <span class="country-daily-stat-value">${dayData.bronze}</span>
        </div>
      </div>
      <div class="country-daily-events">
        ${medalEvents || '<p class="country-daily-empty">Aucune médaille pour cette date.</p>'}
      </div>
    </div>
  `
}

function buildBarControls (countryData, currentDateStr, onSelect, skipInitialSelect) {
  const dates = countryData.daily.map(d => d.dateStr)
  let idx = Math.max(0, dates.indexOf(currentDateStr))

  function goTo (i) {
    idx = Math.max(0, Math.min(dates.length - 1, i))
    const day = countryData.daily[idx]
    updateNavUI(idx, dates.length, { date: day.date, count: day.total })
    btnPrev.disabled = idx <= 0
    btnNext.disabled = idx >= dates.length - 1
    navDate.textContent = fmtShort(day.date)
    navProgress.textContent = `Jour ${idx + 1} / ${dates.length}`
    countryDailyChartControls?.selectDate?.(day.dateStr)
    if (typeof onSelect === 'function') onSelect(day)
  }

  if (!skipInitialSelect) {
    goTo(idx)
  } else {
    const day = countryData.daily[idx]
    updateNavUI(idx, dates.length, { date: day.date, count: day.total })
    btnPrev.disabled = idx <= 0
    btnNext.disabled = idx >= dates.length - 1
    navDate.textContent = fmtShort(day.date)
    navProgress.textContent = `Jour ${idx + 1} / ${dates.length}`
  }

  return {
    prev: () => goTo(idx - 1),
    next: () => goTo(idx + 1),
    goTo
  }
}

let barNavControls = null

function renderCountryDailyCountry (countryData, selectedDateStr) {
  if (!countryData) return

  showBarMode(countryData)

  const selectedDay =
    countryData.daily.find(day => day.dateStr === selectedDateStr && day.total > 0) ||
    countryData.daily.find(day => day.total > 0) ||
    countryData.daily[0]

  countryDailyChartControls = renderCountryDailyMedalChart(
    '#country-daily-chart-wrapper',
    countryData,
    {
      selectedDateStr: selectedDay?.dateStr,
      onDateSelect: dayData => {
        renderCountryDailyDetail(countryData, dayData)
        syncSelectedDate(dayData.dateStr, 'viz6')
        const i = countryData.daily.findIndex(d => d.dateStr === dayData.dateStr)
        if (i >= 0) {
          barNavControls?.goTo(i)
        }
      }
    }
  )

  renderCountryDailyDetail(countryData, selectedDay)

  barNavControls = buildBarControls(
    countryData,
    selectedDay?.dateStr,
    dayData => {
      renderCountryDailyDetail(countryData, dayData)
      syncSelectedDate(dayData.dateStr, 'viz6')
    },
    true
  )
  if (selectedDay) {
    countryDailyChartControls?.selectDate?.(selectedDay.dateStr)
  }
}

loadCountryDailyMedalData()
  .then(data => {
    if (!countrySelect || !data.countries.length) return

    countrySelect.innerHTML =
      '<option value="">— Tous les pays —</option>' +
      data.countries
        .map(country => `<option value="${country.code}">${country.label} (${country.code})</option>`)
        .join('')

    countrySelect.value = ''
    showLineMode()

    countrySelect.addEventListener('change', event => {
      const code = event.target.value || null
      globalCountryFilter = code
      
      _suppressModeSwitch = true
      if (globalSelectedDateStr) {
        syncSelectedDate(globalSelectedDateStr, 'viz6')
      } else {
        const newPieData = computeGenderData(null, globalCountryFilter)
        pieControls = renderGenderPieChart('#gender-pie-wrapper', newPieData, handleGenderSelect)
        if (pieControls && globalGenderFilter) pieControls.updateSelection(globalGenderFilter)
        
        if (pictogramController) {
          pictogramController.updateFilters(null, globalGenderFilter, globalCountryFilter);
        }
        if (athletesTableController?.setExternalFilters) {
          athletesTableController.setExternalFilters({
            dateStr:     null,
            countryCode: globalCountryFilter,
            sexCode:     globalGenderFilter,
            cumulative:  globalCumulativeMode
          })
        }
      }
      _suppressModeSwitch = false

      if (!code) {
        selectedCountry = null
        showLineMode()
        if (dailyControls) {
          const idx   = dailyControls.getIndex()
          const total = dailyControls.total
          dailyControls.goTo(idx)
        }
        return
      }
      const currentDateStr = navDate.textContent !== '—'
        ? dailyDateIndex
            ? [...dailyDateIndex.entries()].find(([, i]) => i === dailyControls?.getIndex())?.[0]
            : null
        : null
      const filteredCountryData = computeCountryDailyData(globalGenderFilter)
      selectedCountry = filteredCountryData.countries.find(c => c.code === code) ?? null
      if (selectedCountry) {
        renderCountryDailyCountry(selectedCountry, currentDateStr)
      }
    })

    document.addEventListener('olympic-date-selected', event => {
      if (event.detail?.source === 'viz6') return
      const dateStr = event.detail?.date
      if (!selectedCountry || !dateStr) return
      const selectedDay = selectedCountry.daily.find(day => day.dateStr === dateStr)
      if (!selectedDay) return
      countryDailyChartControls?.selectDate?.(dateStr)
      renderCountryDailyDetail(selectedCountry, selectedDay)
      const i = selectedCountry.daily.findIndex(d => d.dateStr === dateStr)
      if (i >= 0) barNavControls?.goTo(i)
    })
  })
  .catch(err => {
    console.error('Viz 6 – erreur :', err)
    document.querySelector('#country-daily-chart-wrapper').innerHTML =
      '<p style="color:red;text-align:center">Erreur lors du chargement des données par pays.</p>'
  })
