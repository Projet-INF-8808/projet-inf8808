import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

// Raw (unfiltered) medals cache — set once by loadCountryDailyMedalData
let rawMedalsForCountry = null
let countryNamesCache = null

const MEDAL_KEYS = ['gold', 'silver', 'bronze']

const MEDAL_TYPES = {
  Gold: 'gold',
  Silver: 'silver',
  Bronze: 'bronze'
}

const MEDAL_LABELS = {
  gold: 'Or',
  silver: 'Argent',
  bronze: 'Bronze'
}

const MEDAL_COLORS = {
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32'
}

const OLYMPIC_DATES = d3.timeDay
  .range(new Date('2022-02-05T00:00:00'), new Date('2022-02-21T00:00:00'))
  .map(d3.timeFormat('%Y-%m-%d'))

function normalizeDate (rawDate) {
  return (rawDate ?? '').trim().slice(0, 10)
}

function toDate (dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

function getMedalKey (rawType) {
  return MEDAL_TYPES[(rawType ?? '').trim()] ?? null
}

export async function loadCountryDailyMedalData () {
  const [rawMedals, countries] = await Promise.all([
    d3.csv(`${ASSET_BASE}/data/medals.csv`, d => ({
      medalType: getMedalKey(d.medal_type),
      dateStr: normalizeDate(d.medal_date),
      event: (d.event ?? '').trim(),
      discipline: (d.discipline ?? '').trim(),
      country: (d.country ?? '').trim(),
      code: (d.country_code ?? '').trim(),
      sex: (d.athlete_sex ?? '').trim()
    })),
    d3.csv(`${ASSET_BASE}/data/country_names_french.csv`, d => ({
      code: (d.Code ?? '').trim(),
      label: (d['Nom du Pays'] ?? '').trim()
    }))
  ])

  countryNamesCache = new Map(countries.map(c => [c.code, c.label]))

  // Keep all valid rows (no dedup yet — dedup happens per-query in computeCountryDailyData)
  rawMedalsForCountry = rawMedals.filter(row => row.medalType && row.dateStr && row.code && row.event)

  return computeCountryDailyData(null)
}

/**
 * Re-computes per-country daily medal data with an optional gender filter.
 * @param {string|null} genderFilter – 'M', 'W', 'X', 'O', or null for all
 */
export function computeCountryDailyData (genderFilter) {
  if (!rawMedalsForCountry || !countryNamesCache) return { countries: [], allDates: OLYMPIC_DATES }

  let rows = rawMedalsForCountry
  if (genderFilter) {
    rows = rows.filter(row => row.sex === genderFilter)
  }

  // Deduplicate per event/country/medal (handles team events)
  const seenMedals = new Set()
  const medals = rows
    .filter(row => {
      const key = `${row.dateStr}||${row.code}||${row.event}||${row.medalType}`
      if (seenMedals.has(key)) return false
      seenMedals.add(key)
      return true
    })
    .map(row => ({
      ...row,
      countryLabel: countryNamesCache.get(row.code) ?? row.country ?? row.code
    }))

  const allDates = OLYMPIC_DATES

  const byCountry = Array.from(d3.group(medals, row => row.code), ([code, codeRows]) => {
    const label = codeRows[0]?.countryLabel ?? code
    const byDate = d3.group(codeRows, row => row.dateStr)

    const daily = allDates.map(dateStr => {
      const dateRows = byDate.get(dateStr) ?? []
      const counts = { gold: 0, silver: 0, bronze: 0 }

      dateRows.forEach(row => {
        counts[row.medalType] += 1
      })

      return {
        code,
        label,
        date: toDate(dateStr),
        dateStr,
        gold: counts.gold,
        silver: counts.silver,
        bronze: counts.bronze,
        total: counts.gold + counts.silver + counts.bronze,
        medals: dateRows
      }
    })

    const totals = daily.reduce((acc, day) => {
      acc.gold += day.gold
      acc.silver += day.silver
      acc.bronze += day.bronze
      acc.total += day.total
      return acc
    }, { gold: 0, silver: 0, bronze: 0, total: 0 })

    return { code, label, daily, totals }
  })
    .sort((a, b) =>
      b.totals.total - a.totals.total ||
      b.totals.gold - a.totals.gold ||
      a.label.localeCompare(b.label, 'fr')
    )

  return {
    countries: byCountry,
    allDates
  }
}

export function renderCountryDailyMedalChart (containerSelector, countryData, options = {}) {
  const container = document.querySelector(containerSelector)
  if (!container || !countryData) return {}

  const onDateSelect = options.onDateSelect
  const selectedDateStr = options.selectedDateStr
  const data = countryData.daily
  const chartData = data

  d3.select(container).selectAll('svg').remove()

  const containerWidth  = container.getBoundingClientRect().width  || 800
  const containerHeight = container.getBoundingClientRect().height || 340
  const margin = { top: 24, right: 128, bottom: 58, left: 56 }
  const width  = containerWidth
  const height = Math.max(containerHeight, 200)
  const innerW = width  - margin.left - margin.right
  const innerH = height - margin.top  - margin.bottom

  const xScale = d3.scaleBand()
    .domain(chartData.map(day => day.dateStr))
    .range([0, innerW])
    .padding(0.22)

  const yMax = d3.max(chartData, day => day.total) ?? 0
  const yScale = d3.scaleLinear()
    .domain([0, Math.max(1, yMax)])
    .range([innerH, 0])
    .nice()

  const stackedData = d3.stack().keys(MEDAL_KEYS)(chartData)

  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', '100%')
    .attr('role', 'img')
    .attr('aria-label', `Médailles quotidiennes pour ${countryData.label}`)

  const defs = svg.append('defs')
  const filter = defs.append('filter').attr('id', `viz6-glow-${countryData.code}`)
  filter.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'coloredBlur')
  const merge = filter.append('feMerge')
  merge.append('feMergeNode').attr('in', 'coloredBlur')
  merge.append('feMergeNode').attr('in', 'SourceGraphic')

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  g.append('g')
    .attr('class', 'viz6-grid')
    .call(
      d3.axisLeft(yScale)
        .tickSize(-innerW)
        .tickFormat('')
        .ticks(5)
    )
    .call(axis => axis.select('.domain').remove())

  const dateFormat = d3.timeFormat('%d %b')

  g.append('g')
    .attr('class', 'viz6-axis viz6-axis-x')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      d3.axisBottom(xScale)
        .tickFormat(dateStr => dateFormat(toDate(dateStr)))
    )
    .call(axis => axis.select('.domain').remove())
    .selectAll('text')
    .attr('transform', 'rotate(-38)')
    .style('text-anchor', 'end')

  g.append('g')
    .attr('class', 'viz6-axis viz6-axis-y')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('d')))
    .call(axis => axis.select('.domain').remove())

  g.append('text')
    .attr('class', 'viz6-axis-label')
    .attr('x', innerW / 2)
    .attr('y', innerH + margin.bottom - 4)
    .attr('text-anchor', 'middle')
    .text('Date')

  g.append('text')
    .attr('class', 'viz6-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -margin.left + 14)
    .attr('text-anchor', 'middle')
    .text('Nombre de médailles')

  const selectedDate = selectedDateStr && chartData.some(day => day.dateStr === selectedDateStr)
    ? selectedDateStr
    : chartData.find(day => day.total > 0)?.dateStr

  const selectedBand = g.append('rect')
    .attr('class', 'viz6-selected-band')
    .attr('width', xScale.bandwidth())
    .style('display', selectedDate ? null : 'none')

  function updateSelectedBand (dateStr) {
    const day = chartData.find(d => d.dateStr === dateStr)
    const x = xScale(dateStr)
    if (!day || x == null) return

    const height = day.total > 0 ? innerH - yScale(day.total) : 4
    const y = day.total > 0 ? yScale(day.total) : innerH - height

    selectedBand
      .attr('x', x)
      .attr('y', y)
      .attr('height', height)
      .style('display', null)
  }

  if (selectedDate) {
    updateSelectedBand(selectedDate)
  }

  const layer = g.selectAll('.viz6-layer')
    .data(stackedData, series => series.key)
    .join('g')
    .attr('class', series => `viz6-layer viz6-layer-${series.key}`)
    .attr('fill', series => MEDAL_COLORS[series.key])

  layer.selectAll('rect')
    .data(series => series.map(segment => ({ ...segment, key: series.key, day: segment.data })))
    .join('rect')
    .attr('class', 'viz6-segment')
    .attr('x', segment => xScale(segment.day.dateStr))
    .attr('y', innerH)
    .attr('width', xScale.bandwidth())
    .attr('height', 0)
    .attr('rx', 3)
    .attr('ry', 3)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', segment => `${countryData.label}, ${segment.day.dateStr}, ${MEDAL_LABELS[segment.key]}: ${segment.day[segment.key]}`)
    .on('mouseenter focus', function (event, segment) {
      showTooltip(event, countryData, segment)
      d3.select(this).attr('filter', `url(#viz6-glow-${countryData.code})`)
    })
    .on('mousemove', moveTooltip)
    .on('mouseleave blur', function () {
      hideTooltip()
      d3.select(this).attr('filter', null)
    })
    .on('click keydown', function (event, segment) {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      updateSelectedBand(segment.day.dateStr)
      if (typeof onDateSelect === 'function') {
        onDateSelect(segment.day)
      }
    })
    .transition()
    .duration(650)
    .delay((_, i) => i * 35)
    .ease(d3.easeCubicOut)
    .attr('y', segment => yScale(segment[1]))
    .attr('height', segment => Math.max(0, yScale(segment[0]) - yScale(segment[1])))

  const totalLabels = g.selectAll('.viz6-total-label')
    .data(chartData.filter(day => day.total > 0))
    .join('text')
    .attr('class', 'viz6-total-label')
    .attr('x', day => xScale(day.dateStr) + xScale.bandwidth() / 2)
    .attr('y', day => yScale(day.total) - 6)
    .attr('text-anchor', 'middle')
    .attr('opacity', 0)
    .text(day => day.total)

  totalLabels.transition()
    .duration(450)
    .delay(450)
    .attr('opacity', 1)

  g.selectAll('.viz6-zero-day-target')
    .data(chartData.filter(day => day.total === 0), day => day.dateStr)
    .join('rect')
    .attr('class', 'viz6-zero-day-target')
    .attr('x', day => xScale(day.dateStr))
    .attr('y', 0)
    .attr('width', xScale.bandwidth())
    .attr('height', innerH)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', day => `${countryData.label}, ${day.dateStr}, aucune médaille`)
    .on('click keydown', function (event, day) {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      updateSelectedBand(day.dateStr)
      if (typeof onDateSelect === 'function') {
        onDateSelect(day)
      }
    })

  const legend = g.append('g')
    .attr('class', 'viz6-legend')
    .attr('transform', `translate(${innerW + 18}, 0)`)

  legend.selectAll('.viz6-legend-item')
    .data(MEDAL_KEYS)
    .join('g')
    .attr('class', 'viz6-legend-item')
    .attr('transform', (_, i) => `translate(0, ${i * 28})`)
    .call(item => {
      item.append('rect')
        .attr('width', 16)
        .attr('height', 16)
        .attr('rx', 3)
        .attr('fill', key => MEDAL_COLORS[key])

      item.append('text')
        .attr('x', 24)
        .attr('y', 8)
        .attr('dy', '0.35em')
        .text(key => MEDAL_LABELS[key])
    })

  return {
    selectDate: dateStr => {
      if (!dateStr || !xScale.domain().includes(dateStr)) return
      updateSelectedBand(dateStr)
    },
    hideSelection: () => {
      selectedBand.style('display', 'none')
    }
  }
}

function showTooltip (event, countryData, segment) {
  const medalCount = segment.day[segment.key]
  const tt = d3.select('#country-daily-tooltip')
  if (tt.empty()) return

  const fmtDate = d3.timeFormat('%d %B %Y')
  const medalRows = MEDAL_KEYS
    .map(key => `
      <div class="viz6-tt-row">
        <span class="viz6-tt-dot" style="background:${MEDAL_COLORS[key]}"></span>
        <span>${MEDAL_LABELS[key]}</span>
        <strong>${segment.day[key]}</strong>
      </div>
    `)
    .join('')

  tt.style('display', 'block')
    .html(`
      <div class="viz6-tt-header">
        <img class="viz6-tt-flag" src="${ASSET_BASE}/flags/${countryData.code.toLowerCase()}.svg" alt="${countryData.code}" onerror="this.style.display='none'" />
        <div>
          <div class="viz6-tt-country">${countryData.label}</div>
          <div class="viz6-tt-date">${fmtDate(segment.day.date)}</div>
        </div>
      </div>
      <div class="viz6-tt-selected">
        ${MEDAL_LABELS[segment.key]} : <strong>${medalCount}</strong>
      </div>
      ${medalRows}
      <div class="viz6-tt-total">Total : <strong>${segment.day.total}</strong></div>
    `)

  moveTooltip(event)
}

function moveTooltip (event) {
  const tt = d3.select('#country-daily-tooltip')
  const node = tt.node()
  if (!node) return

  const width = node.offsetWidth || 220
  const height = node.offsetHeight || 120
  let left = event.pageX + 14
  let top = event.pageY - 28

  if (left + width > window.innerWidth - 12) left = event.pageX - width - 14
  if (top + height > window.innerHeight - 12) top = event.pageY - height - 8

  tt.style('left', `${left}px`).style('top', `${top}px`)
}

function hideTooltip () {
  d3.select('#country-daily-tooltip').style('display', 'none')
}
