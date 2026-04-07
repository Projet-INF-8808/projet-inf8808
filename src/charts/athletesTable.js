import * as d3 from 'd3'

const TOUS = 'Tous'

const SEX_MAP = {
  M: 'Homme',
  W: 'Femme',
  X: 'Mixte',
  O: 'Autre'
}

const DISCIPLINE_MAP = {
  Biathlon: 'Biathlon',
  'Cross-Country Skiing': 'Ski de fond',
  'Freestyle Skiing': 'Ski acrobatique',
  'Short Track Speed Skating': 'Patinage de vitesse sur piste courte',
  'Speed Skating': 'Patinage de vitesse',
  'Figure Skating': 'Patinage artistique',
  Curling: 'Curling',
  Luge: 'Luge',
  Skeleton: 'Skeleton',
  Bobsleigh: 'Bobsleigh',
  Snowboard: 'Snowboard',
  'Ski Jumping': 'Saut a ski',
  'Alpine Skiing': 'Ski alpin',
  'Nordic Combined': 'Combine nordique',
  'Ice Hockey': 'Hockey sur glace'
}

const DAY_MEDAL_LABELS = {
  Gold: 'Or',
  Silver: 'Argent',
  Bronze: 'Bronze'
}

function normalizeDate (rawDate) {
  return (rawDate ?? '').split(' ')[0]
}

function normalizeSex (rawSex) {
  return SEX_MAP[(rawSex ?? '').trim()] ?? 'Autre'
}

function normalizeMedalType (rawType) {
  const medal = (rawType ?? '').trim().toLowerCase()
  if (medal === 'gold') return 'Gold'
  if (medal === 'silver') return 'Silver'
  if (medal === 'bronze') return 'Bronze'
  return null
}

function normalizeDiscipline (rawDiscipline) {
  const discipline = (rawDiscipline ?? '').trim()
  return DISCIPLINE_MAP[discipline] ?? discipline
}

function formatDayMedalDetails (row) {
  const counts = row.day_medal_counts
  const parts = ['Gold', 'Silver', 'Bronze']
    .filter(type => counts[type] > 0)
    .map(type => {
      const label = DAY_MEDAL_LABELS[type]
      const count = counts[type]
      return count > 1 ? `${label} x${count}` : label
    })

  if (parts.length === 0) return String(row.medals_on_selected_day)
  return `${row.medals_on_selected_day} (${parts.join(', ')})`
}

function toNameCase (segment) {
  return segment
    .split(/([\-\s'’])/)
    .map(part => {
      if (/^[\-\s'’]$/.test(part) || part === '') return part
      const lower = part.toLocaleLowerCase('fr')
      return lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1)
    })
    .join('')
}

function formatAthleteDisplayName (rawName) {
  const tokens = (rawName ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return toNameCase(rawName ?? '')

  const upperToken = /^[A-ZÀ-ÖØ-Þ'’-]+$/
  let firstNameStart = tokens.findIndex(token => !upperToken.test(token))
  if (firstNameStart <= 0) {
    firstNameStart = 1
  }

  const surname = toNameCase(tokens.slice(0, firstNameStart).join(' '))
  const firstName = toNameCase(tokens.slice(firstNameStart).join(' '))

  return firstName ? `${firstName} ${surname}` : surname
}

export async function loadAthletesTableMedalsData () {
  const [rows, countries] = await Promise.all([
    d3.csv('/src/assets/data/medals.csv', d => ({
      medal_date: normalizeDate(d.medal_date),
      athlete_name: (d.athlete_name ?? '').trim(),
      athlete_sex: normalizeSex(d.athlete_sex),
      country: (d.country ?? '').trim(),
      country_code: (d.country_code ?? '').trim(),
      discipline: normalizeDiscipline(d.discipline),
      event: (d.event ?? '').trim(),
      medal_type: normalizeMedalType(d.medal_type)
    })),
    d3.csv('/src/assets/data/country_names_french.csv', d => ({
      code: (d.Code ?? '').trim(),
      name: (d['Nom du Pays'] ?? '').trim()
    }))
  ])

  const countryMap = new Map(countries.map(country => [country.code, country.name]))

  return rows
    .filter(row => row.athlete_name && row.medal_date && row.medal_type)
    .map(row => ({
      ...row,
      country: countryMap.get(row.country_code) ?? row.country
    }))
}

export function getAthletesTableFilterOptions (rows) {
  return {
    dates: Array.from(new Set(rows.map(d => d.medal_date))).sort((a, b) => a.localeCompare(b)),
    countries: Array.from(new Set(rows.map(d => d.country))).sort((a, b) => a.localeCompare(b)),
    sexes: Array.from(new Set(rows.map(d => d.athlete_sex))).sort((a, b) => a.localeCompare(b)),
    disciplines: Array.from(new Set(rows.map(d => d.discipline))).sort((a, b) => a.localeCompare(b))
  }
}

export function initAthletesTable (sectionSelector, rawData) {
  const section = document.querySelector(sectionSelector)
  if (!section) return null

  section.innerHTML = `
    <h1 class="athletes-table-title">Athletes avec plusieurs médailles</h1>
    <div class="athletes-table-controls" id="athletes-table-controls"></div>
    <div id="athletes-table-root"></div>
  `

  const options = getAthletesTableFilterOptions(rawData)
  const filters = {
    date: options.dates[0] ?? '',
    country: TOUS,
    sex: TOUS,
    discipline: TOUS
  }

  const filterConfig = [
    { key: 'date', label: 'Date', options: options.dates, includeAll: false },
    { key: 'country', label: 'Pays', options: options.countries, includeAll: true },
    { key: 'sex', label: 'Sexe', options: options.sexes, includeAll: true },
    { key: 'discipline', label: 'Discipline', options: options.disciplines, includeAll: true }
  ]

  const controlsContainer = section.querySelector('#athletes-table-controls')
  controlsContainer.innerHTML = filterConfig.map(cfg => {
    const values = [...(cfg.includeAll ? [TOUS] : []), ...cfg.options]

    return `
      <div class="athletes-table-control">
        <label for="athletes-table-filter-${cfg.key}">${cfg.label}</label>
        <select id="athletes-table-filter-${cfg.key}">
          ${values.map(value => `<option value="${value}">${value}</option>`).join('')}
        </select>
      </div>
    `
  }).join('')

  controlsContainer.insertAdjacentHTML('beforeend', `
    <div class="athletes-table-actions">
      <button type="button" class="athletes-table-reset" id="athletes-table-reset">Reinitialiser filtres et tri</button>
    </div>
  `)

  const athletesTable = new AthletesTable('#athletes-table-root', rawData, filters)
  const defaultFilters = { ...filters }

  const dateSelect = section.querySelector('#athletes-table-filter-date')

  const getAvailableDates = () => {
    const available = rawData.filter(row => {
      const countryMatch = filters.country === TOUS || row.country === filters.country
      const sexMatch = filters.sex === TOUS || row.athlete_sex === filters.sex
      const disciplineMatch = filters.discipline === TOUS || row.discipline === filters.discipline
      return countryMatch && sexMatch && disciplineMatch
    })

    return Array.from(new Set(available.map(row => row.medal_date))).sort((a, b) => a.localeCompare(b))
  }

  const refreshDateOptions = () => {
    const availableDates = getAvailableDates()

    dateSelect.innerHTML = availableDates
      .map(date => `<option value="${date}">${date}</option>`)
      .join('')

    if (!availableDates.length) {
      filters.date = ''
      athletesTable.setFilters(filters)
      return
    }

    if (!availableDates.includes(filters.date)) {
      filters.date = availableDates[0]
    }

    dateSelect.value = filters.date
    athletesTable.setFilters(filters)
  }

  refreshDateOptions()

  filterConfig.forEach(cfg => {
    const select = section.querySelector(`#athletes-table-filter-${cfg.key}`)
    if (!select) return

    select.value = filters[cfg.key]
    select.addEventListener('change', event => {
      filters[cfg.key] = event.target.value

      if (cfg.key !== 'date') {
        refreshDateOptions()
        return
      }

      athletesTable.setFilters(filters)
    })
  })

  const resetButton = section.querySelector('#athletes-table-reset')
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      filters.country = defaultFilters.country
      filters.sex = defaultFilters.sex
      filters.discipline = defaultFilters.discipline
      filters.date = defaultFilters.date

      section.querySelector('#athletes-table-filter-country').value = filters.country
      section.querySelector('#athletes-table-filter-sex').value = filters.sex
      section.querySelector('#athletes-table-filter-discipline').value = filters.discipline

      refreshDateOptions()
      athletesTable.resetSort()
    })
  }

  return athletesTable
}

export class AthletesTable {
  constructor (containerSelector, rawData, initialFilters = {}) {
    this.root = d3.select(containerSelector)
    this.rawData = rawData
    this.filters = {
      date: '',
      country: TOUS,
      sex: TOUS,
      discipline: TOUS,
      ...initialFilters
    }

    this.columns = [
      { key: 'athlete_name', label: 'Athlete', type: 'text', sortable: true },
      { key: 'country', label: 'Pays', type: 'text', sortable: true },
      { key: 'athlete_sex', label: 'Sexe', type: 'text', sortable: true },
      { key: 'medals_on_selected_day', label: 'Médailles (jour)', type: 'number', sortable: false },
      { key: 'total_medals_all_games', label: 'Total médailles', type: 'number', sortable: true },
      { key: 'gold_total', label: 'Or', type: 'number', sortable: true },
      { key: 'silver_total', label: 'Argent', type: 'number', sortable: true },
      { key: 'bronze_total', label: 'Bronze', type: 'number', sortable: true }
    ]
    this.sortState = null

    this.allTimeByAthlete = this.computeAllTimeTotals(rawData)
    this.renderShell()
    this.render()
  }

  computeAllTimeTotals (rows) {
    const totals = new Map()

    rows.forEach(row => {
      if (!totals.has(row.athlete_name)) {
        totals.set(row.athlete_name, {
          athlete_name: row.athlete_name,
          total_medals_all_games: 0,
          gold_total: 0,
          silver_total: 0,
          bronze_total: 0
        })
      }

      const agg = totals.get(row.athlete_name)
      agg.total_medals_all_games += 1
      if (row.medal_type === 'Gold') agg.gold_total += 1
      if (row.medal_type === 'Silver') agg.silver_total += 1
      if (row.medal_type === 'Bronze') agg.bronze_total += 1
    })

    return totals
  }

  setFilters (nextFilters) {
    this.filters = { ...this.filters, ...nextFilters }
    this.render()
  }

  toggleSort (columnKey) {
    const column = this.columns.find(col => col.key === columnKey)
    if (!column || column.sortable === false) return

    if (!this.sortState || this.sortState.key !== columnKey) {
      this.sortState = { key: columnKey, direction: 'asc' }
    } else {
      this.sortState = {
        key: columnKey,
        direction: this.sortState.direction === 'asc' ? 'desc' : 'asc'
      }
    }

    this.render()
  }

  resetSort () {
    this.sortState = null
    this.render()
  }

  applySort (rows) {
    const getSortValue = (row, key) => {
      if (key === 'athlete_name') return row.athlete_display_name
      return row[key]
    }

    if (!this.sortState) {
      return rows.sort((a, b) =>
        b.total_medals_all_games - a.total_medals_all_games ||
        b.medals_on_selected_day - a.medals_on_selected_day ||
        b.gold_total - a.gold_total ||
        a.athlete_display_name.localeCompare(b.athlete_display_name, 'fr')
      )
    }

    const { key, direction } = this.sortState
    const column = this.columns.find(col => col.key === key)
    const multiplier = direction === 'asc' ? 1 : -1

    return rows.sort((a, b) => {
      if (!column || column.type === 'text') {
        const textCompare = String(getSortValue(a, key)).localeCompare(String(getSortValue(b, key)), 'fr')
        if (textCompare !== 0) return textCompare * multiplier
      } else {
        const numericCompare = (Number(getSortValue(a, key)) - Number(getSortValue(b, key)))
        if (numericCompare !== 0) return numericCompare * multiplier
      }

      return (
        b.total_medals_all_games - a.total_medals_all_games ||
        b.medals_on_selected_day - a.medals_on_selected_day ||
        b.gold_total - a.gold_total ||
        a.athlete_display_name.localeCompare(b.athlete_display_name, 'fr')
      )
    })
  }

  updateSortIndicators () {
    this.root.selectAll('thead th')
      .classed('is-sorted-asc', d => this.sortState?.key === d.key && this.sortState.direction === 'asc')
      .classed('is-sorted-desc', d => this.sortState?.key === d.key && this.sortState.direction === 'desc')
  }

  buildRows () {
    const { date, country, sex, discipline } = this.filters

    const filtered = this.rawData.filter(row => {
      const dateMatch = !date || row.medal_date === date
      const countryMatch = country === TOUS || row.country === country
      const sexMatch = sex === TOUS || row.athlete_sex === sex
      const disciplineMatch = discipline === TOUS || row.discipline === discipline
      return dateMatch && countryMatch && sexMatch && disciplineMatch
    })

    const byAthlete = new Map()

    filtered.forEach(row => {
      const allTime = this.allTimeByAthlete.get(row.athlete_name)
      if (!allTime) return

      if (!byAthlete.has(row.athlete_name)) {
        byAthlete.set(row.athlete_name, {
          athlete_name: row.athlete_name,
          athlete_display_name: formatAthleteDisplayName(row.athlete_name),
          country: row.country,
          athlete_sex: row.athlete_sex,
          medals_on_selected_day: 0,
          day_medal_counts: {
            Gold: 0,
            Silver: 0,
            Bronze: 0
          },
          total_medals_all_games: allTime.total_medals_all_games,
          gold_total: allTime.gold_total,
          silver_total: allTime.silver_total,
          bronze_total: allTime.bronze_total
        })
      }

      const athleteRow = byAthlete.get(row.athlete_name)
      athleteRow.medals_on_selected_day += 1
      athleteRow.day_medal_counts[row.medal_type] += 1
    })

    return this.applySort(Array.from(byAthlete.values()))
  }

  renderShell () {
    this.root.html('')
    this.root.append('p').attr('class', 'athletes-table-summary')

    const table = this.root.append('div')
      .attr('class', 'athletes-table-wrapper')
      .append('table')
      .attr('class', 'athletes-table')

    table.append('thead')
      .append('tr')
      .selectAll('th')
      .data(this.columns)
      .join('th')
      .attr('scope', 'col')
      .attr('class', d => (d.sortable === false ? '' : 'is-sortable'))
      .on('click', (_, d) => this.toggleSort(d.key))
      .text(d => d.label)

    table.append('tbody')
  }

  render () {
    const rows = this.buildRows()

    const multiMedalAthletes = rows.filter(row => row.total_medals_all_games > 1).length
    const athletesLabel = rows.length > 1 ? 'athletes affiches' : 'athlete affiche'
    let summaryText = `${rows.length} ${athletesLabel}`

    if (multiMedalAthletes > 0) {
      const multiAthleteLabel = multiMedalAthletes > 1 ? 'athletes' : 'athlete'
      summaryText += ` | ${multiMedalAthletes} ${multiAthleteLabel} avec plus d'une médaille au total`
    }

    this.root.select('.athletes-table-summary').text(summaryText)
    this.updateSortIndicators()

    const tableRows = this.root.select('tbody')
      .selectAll('tr')
      .data(rows, d => d.athlete_name)
      .join('tr')

    const cells = tableRows
      .selectAll('td')
      .data(d => [
        d.athlete_display_name,
        d.country,
        d.athlete_sex,
        formatDayMedalDetails(d),
        d.total_medals_all_games,
        d.gold_total,
        d.silver_total,
        d.bronze_total
      ])
      .join('td')
      .text(d => d)

    tableRows.selectAll('td')
      .attr('class', (_, i) => `athletes-table-col-${i}`)

    cells.classed('athletes-table-value-cell', (_, i) => i >= 3)

    tableRows.select('.athletes-table-col-4')
      .classed('athletes-table-total-medals', true)
      .classed('athletes-table-total-medals-light', d => d.total_medals_all_games > 1 && d.total_medals_all_games < 3)
      .classed('athletes-table-total-medals-strong', d => d.total_medals_all_games >= 3)

    tableRows.select('.athletes-table-col-5')
      .classed('athletes-table-gold-cell', d => d.gold_total > 0)

    tableRows.select('.athletes-table-col-6')
      .classed('athletes-table-silver-cell', d => d.silver_total > 0)

    tableRows.select('.athletes-table-col-7')
      .classed('athletes-table-bronze-cell', d => d.bronze_total > 0)
  }
}
