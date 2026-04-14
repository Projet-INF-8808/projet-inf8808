import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

// ─────────────────────────────────────────────────────────────
//  DATA LOADING
// ─────────────────────────────────────────────────────────────

/**
 * Loads medals.csv and returns the daily counts of unique gold-medal events.
 * "Unique" means one row per (date × event), so relay teams don't inflate counts.
 * @returns {Promise<Array<{date: Date, count: number, events: string[]}>>}
 */
let rawDailyCache = null

/**
 * Loads medals.csv and caches it for daily counts.
 */
export async function loadDailyData () {
  const raw = await d3.csv(`${ASSET_BASE}/data/medals.csv`, d => ({
    type:         d.medal_type.trim(),
    date:         d.medal_date.trim().slice(0, 10),
    event:        d.event.trim(),
    discipline:   d.discipline.trim(),
    discipline_code: d.discipline_code.trim(),
    country:      d.country.trim(),
    code:         d.country_code.trim(),
    sex:          d.athlete_sex.trim()
  }))

  rawDailyCache = raw
  return buildDailyData(null)
}

/**
 * Re-builds the daily events data, filtering by gender optionally.
 */
export function buildDailyData(genderFilter) {
  if (!rawDailyCache) return []
  
  let goldOnly = rawDailyCache.filter(d => d.type === 'Gold')
  if (genderFilter) {
    goldOnly = goldOnly.filter(d => d.sex === genderFilter)
  }

  const seen = new Set()
  const unique = goldOnly.filter(d => {
    const key = `${d.date}||${d.event}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const byDate = d3.group(unique, d => d.date)
  const sorted = Array.from(byDate.entries())
    .map(([dateStr, rows]) => ({
      date:   new Date(dateStr + 'T00:00:00'),
      dateStr,
      count:  rows.length,
      events: rows.map(r => ({ event: r.event, discipline: r.discipline, country: r.country, code: r.code }))
    }))
    .sort((a, b) => a.date - b.date)

  return sorted
}

// ─────────────────────────────────────────────────────────────
//  CHART RENDERER
// ─────────────────────────────────────────────────────────────

/**
 * Renders the daily medal events line chart.
 * @param {string}   containerId  CSS selector of the wrapper div
 * @param {Array}    data         Output of loadDailyData()
 * @param {Function} onDateSelect Callback(dateObj, dayData, index, total) when selection changes
 * @returns {{ prev, next, goTo }} Navigation controls
 */
export function renderDailyMedalChart (containerId, data, onDateSelect) {
  const container = document.querySelector(containerId)
  if (!container) return {}

  const containerW = container.getBoundingClientRect().width || 800

  const margin = { top: 28, right: 32, bottom: 56, left: 56 }
  const width  = containerW
  const height = 300
  const innerW = width  - margin.left - margin.right
  const innerH = height - margin.top  - margin.bottom

  // ── Scales ──────────────────────────────────────────────────
  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, innerW])

  const yMax = d3.max(data, d => d.count)
  const yScale = d3.scaleLinear()
    .domain([0, yMax + 1])
    .range([innerH, 0])
    .nice()

  // ── SVG ─────────────────────────────────────────────────────
  d3.select(containerId).selectAll('svg').remove()

  const svg = d3.select(containerId)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', 'auto')
    .attr('role', 'img')
    .attr('aria-label', "Graphique des événements médaillés par jour")

  const defs = svg.append('defs')

  const areaGradient = defs.append('linearGradient')
    .attr('id', 'daily-area-gradient')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%')
  areaGradient.append('stop').attr('offset', '0%')
    .attr('stop-color', '#C59B4E').attr('stop-opacity', 0.35)
  areaGradient.append('stop').attr('offset', '100%')
    .attr('stop-color', '#C59B4E').attr('stop-opacity', 0.02)

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // ── Grid ────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'dm-grid')
    .call(
      d3.axisLeft(yScale)
        .tickSize(-innerW)
        .tickFormat('')
        .ticks(5)
    )
    .call(ax => ax.select('.domain').remove())

  // ── Area ─────────────────────────────────────────────────────
  const area = d3.area()
    .x(d => xScale(d.date))
    .y0(innerH)
    .y1(d => yScale(d.count))
    .curve(d3.curveMonotoneX)

  g.append('path')
    .datum(data)
    .attr('class', 'dm-area')
    .attr('d', area)

  // ── Line ─────────────────────────────────────────────────────
  const line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.count))
    .curve(d3.curveMonotoneX)

  g.append('path')
    .datum(data)
    .attr('class', 'dm-line')
    .attr('d', line)

  // ── Data points ──────────────────────────────────────────────
  const dots = g.selectAll('.dm-dot')
    .data(data)
    .join('circle')
    .attr('class', 'dm-dot')
    .attr('cx', d => xScale(d.date))
    .attr('cy', d => yScale(d.count))
    .attr('r', 4)

  // ── Axes ─────────────────────────────────────────────────────
  const dateFormat = d3.timeFormat('%d %b')
  g.append('g')
    .attr('class', 'dm-axis dm-axis-x')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      d3.axisBottom(xScale)
        .ticks(data.length)
        .tickFormat(dateFormat)
    )
    .call(ax => ax.select('.domain').remove())
    .selectAll('text')
    .attr('transform', 'rotate(-40)')
    .style('text-anchor', 'end')

  g.append('g')
    .attr('class', 'dm-axis dm-axis-y')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('d')))
    .call(ax => ax.select('.domain').remove())

  // ── Axis labels ──────────────────────────────────────────────
  g.append('text')
    .attr('class', 'dm-axis-label')
    .attr('x', innerW / 2)
    .attr('y', innerH + margin.bottom - 4)
    .attr('text-anchor', 'middle')
    .text('Date')

  g.append('text')
    .attr('class', 'dm-axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -margin.left + 14)
    .attr('text-anchor', 'middle')
    .text("Nombre d'événements")

  // ── Persistent cursor (always visible) ───────────────────────
  const cursorGroup = g.append('g').attr('class', 'dm-cursor-group')

  // Vertical cursor line — always displayed
  const cursorLine = cursorGroup.append('line')
    .attr('class', 'dm-cursor-line')
    .attr('y1', 0)
    .attr('y2', innerH)

  // Selected date dot (on the line)
  const cursorDot = cursorGroup.append('circle')
    .attr('class', 'dm-cursor-dot')
    .attr('r', 7)

  // ── Hover preview dot (replaces tooltip anchor) ──────────────
  const hoverDot = cursorGroup.append('circle')
    .attr('class', 'dm-hover-dot')
    .attr('r', 5)
    .style('display', 'none')

  // ── Bisector ─────────────────────────────────────────────────
  const bisect = d3.bisector(d => d.date).center

  // ── State ────────────────────────────────────────────────────
  let selectedIdx = 0

  function selectIndex (idx) {
    selectedIdx = Math.max(0, Math.min(data.length - 1, idx))
    const d = data[selectedIdx]
    const cx = xScale(d.date)
    const cy = yScale(d.count)

    cursorLine
      .transition().duration(200).ease(d3.easeCubicOut)
      .attr('x1', cx).attr('x2', cx)

    cursorDot
      .transition().duration(200).ease(d3.easeCubicOut)
      .attr('cx', cx).attr('cy', cy)

    // Highlight the active dot
    dots.classed('dm-dot--active', (_, i) => i === selectedIdx)

    if (typeof onDateSelect === 'function') {
      onDateSelect(d.date, d, selectedIdx, data.length)
    }
  }

  // ── Invisible overlay for mouse interaction ───────────────────
  g.append('rect')
    .attr('class', 'dm-overlay')
    .attr('width', innerW)
    .attr('height', innerH)
    .on('mousemove', function (event) {
      const [mx] = d3.pointer(event, this)
      const idx  = bisect(data, xScale.invert(mx))
      const d    = data[Math.max(0, Math.min(data.length - 1, idx))]
      if (!d) return
      hoverDot
        .attr('cx', xScale(d.date))
        .attr('cy', yScale(d.count))
        .style('display', null)
      showTooltip(event, d)
    })
    .on('click', function (event) {
      const [mx] = d3.pointer(event, this)
      const idx  = bisect(data, xScale.invert(mx))
      selectIndex(idx)
    })
    .on('mouseleave', function () {
      hoverDot.style('display', 'none')
      hideTooltip()
    })

  // ── Initial selection ─────────────────────────────────────────
  selectIndex(0)

  // ── Return navigation controls ───────────────────────────────
  return {
    prev: ()    => selectIndex(selectedIdx - 1),
    next: ()    => selectIndex(selectedIdx + 1),
    goTo: (idx) => selectIndex(idx),
    getIndex:   () => selectedIdx,
    total:      data.length
  }
}

// ─────────────────────────────────────────────────────────────
//  TOOLTIP
// ─────────────────────────────────────────────────────────────
const fmtDate = d3.timeFormat('%d %B %Y')

function showTooltip (event, d) {
  const tt = d3.select('#daily-tooltip')
  if (tt.empty()) return

  const listItems = d.events.slice(0, 8).map(e =>
    `<li class="dt-event-item">
       <img class="dt-flag" src="${ASSET_BASE}/flags/${e.code.toLowerCase()}.svg" alt="${e.code}" onerror="this.style.display='none'" />
       <span class="dt-event-name">${e.event}</span>
     </li>`
  ).join('')
  const extra = d.events.length > 8
    ? `<li class="dt-more">+${d.events.length - 8} autres…</li>` : ''

  tt.style('display', 'block')
    .html(`
      <div class="dt-date">${fmtDate(d.date)}</div>
      <div class="dt-count"><strong>${d.count}</strong> événement${d.count > 1 ? 's' : ''}</div>
      <ul class="dt-event-list">${listItems}${extra}</ul>
    `)
  moveTooltip(event)
}

function moveTooltip (event) {
  const tt = d3.select('#daily-tooltip')
  const node = tt.node()
  if (!node) return
  const bw = node.offsetWidth  || 220
  const bh = node.offsetHeight || 100
  let left = event.pageX + 16
  let top  = event.pageY - 28
  if (left + bw > window.innerWidth  - 12) left = event.pageX - bw - 16
  if (top  + bh > window.innerHeight - 12) top  = event.pageY - bh - 8
  tt.style('left', `${left}px`).style('top', `${top}px`)
}

function hideTooltip () {
  d3.select('#daily-tooltip').style('display', 'none')
}
