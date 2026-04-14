import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

let rawMedalsCache = null
let namesCache = null

/**
 * Loads and caches the medals and French country name data.
 */
export async function loadData () {
  const [medals, names] = await Promise.all([
    d3.csv(`${ASSET_BASE}/data/medals.csv`),
    d3.csv(`${ASSET_BASE}/data/country_names_french.csv`, d => ({
      code: d.Code.trim(),
      name: d['Nom du Pays'].trim()
    }))
  ])

  rawMedalsCache = medals
  namesCache = new Map(names.map(n => [n.code, n.name]))
  
  return computeMedalTotals(null)
}

/**
 * Computes unique medals for each country, filtered by gender optionally.
 */
export function computeMedalTotals (genderFilter) {
  if (!rawMedalsCache) return []
  
  let filtered = rawMedalsCache
  if (genderFilter) {
    filtered = rawMedalsCache.filter(d => d.athlete_sex.trim() === genderFilter)
  }

  const seen = new Set()
  const uniqueMedals = filtered.filter(d => {
    // Only count 1 medal per event per country to handle team events
    const key = `${d.country_code.trim()}||${d.event.trim()}||${d.medal_type.trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const byCountry = d3.group(uniqueMedals, d => d.country_code.trim())

  const aggregated = Array.from(byCountry, ([code, rows]) => {
    let gold = 0; let silver = 0; let bronze = 0
    for (const r of rows) {
      if (r.medal_type === 'Gold') gold++
      else if (r.medal_type === 'Silver') silver++
      else if (r.medal_type === 'Bronze') bronze++
    }
    return {
      code,
      gold,
      silver,
      bronze,
      total: gold + silver + bronze,
      label: namesCache.get(code) || code
    }
  })
  
  return aggregated
}

/**
 * Renders the horizontal stacked medal bar chart into the given container.
 * @param {string} containerId – CSS selector of the container element.
 * @param {Array}  data        – Merged medal data rows.
 */
export function renderMedalChart (containerId, data) {
  // Sort by total desc, then gold, silver, bronze as tie-breakers, then alphabetical
  const sorted = [...data].sort(
    (a, b) =>
      b.total  - a.total  ||
      b.gold   - a.gold   ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.code.localeCompare(b.code)
  )

  // ---------- Dimensions ----------
  const container = document.querySelector(containerId)
  const containerWidth = container.getBoundingClientRect().width || 800

  const flagW   = 28   // flag image width
  const flagH   = 20   // flag image height
  const flagGap = 8    // gap between flag and code text
  const codeW   = 36   // rough width of 3-letter code text

  const margin = {
    top: 24,
    right: 160,
    bottom: 40,
    // left margin = flag + gap + code + gap-to-bar
    left: flagW + flagGap + codeW + 14
  }

  // Fit the chart within the available viewport height.
  // Subtract the section header (title + subtitle + padding ≈ 130px).
  const sectionHeaderH = 130
  const availableH = window.innerHeight - sectionHeaderH
  const height = Math.max(availableH, sorted.length * 20 + margin.top + margin.bottom)
  const width  = containerWidth

  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  // ---------- Scales ----------
  const maxTotal = d3.max(sorted, d => d.total)

  const xScale = d3
    .scaleLinear()
    .domain([0, maxTotal])
    .range([0, innerW])
    .nice()

  const yScale = d3
    .scaleBand()
    .domain(sorted.map(d => d.code))
    .range([0, innerH])
    .padding(0.25)

  const medalColors = {
    gold:   '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32'
  }

  const stack = ['gold', 'silver', 'bronze']

  // ---------- SVG ----------
  d3.select(containerId).selectAll('svg').remove()
  
  const svg = d3
    .select(containerId)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr('aria-label', 'Graphique des médailles olympiques par pays')

  // Clip path so flags don't bleed outside the left margin area
  const defs = svg.append('defs')

  const filter = defs.append('filter').attr('id', 'glow')
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'coloredBlur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // ---------- X-axis grid lines ----------
  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      d3.axisBottom(xScale)
        .tickSize(-innerH)
        .tickFormat('')
        .ticks(6)
    )
    .call(ax => ax.select('.domain').remove())

  // ---------- Axes ----------
  g.append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format('d')))
    .call(ax => ax.select('.domain').remove())

  // X-axis label
  g.append('text')
    .attr('class', 'axis-label x-axis-label')
    .attr('x', innerW / 2)
    .attr('y', innerH + margin.bottom - 2)
    .attr('text-anchor', 'middle')
    .text('Nombre de médailles')

  // Hide the default y-axis ticks/labels — we draw our own
  g.append('g')
    .attr('class', 'axis y-axis')
    .call(d3.axisLeft(yScale).tickFormat(''))
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('.tick line').remove())

  // Y-axis label — top-left, not rotated
  g.append('text')
    .attr('class', 'axis-label y-axis-label')
    .attr('x', -margin.left)
    .attr('y', -8)
    .attr('text-anchor', 'start')
    .text('Pays')

  // ---------- Per-row label groups (flag + code) ----------
  const labelGroups = g
    .selectAll('.label-group')
    .data(sorted)
    .join('g')
    .attr('class', 'label-group')
    .attr('transform', d => `translate(0,${yScale(d.code) + yScale.bandwidth() / 2})`)

  // Country flag — positioned to the left of y-axis origin
  // flag right edge sits at -codeW - flagGap - (small buffer)
  const flagX = -(codeW + flagGap + flagW + 2)

  labelGroups
    .append('image')
    .attr('class', 'country-flag')
    .attr('href', d => `${ASSET_BASE}/flags/${d.code.toLowerCase()}.svg`)
    .attr('x', flagX)
    .attr('y', -flagH / 2)
    .attr('width', flagW)
    .attr('height', flagH)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  // 3-letter country code text
  labelGroups
    .append('text')
    .attr('class', 'country-label')
    .attr('x', -8)
    .attr('y', 0)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .text(d => d.code)

  // ---------- Stacked bars ----------
  const barGroups = g
    .selectAll('.bar-group')
    .data(sorted)
    .join('g')
    .attr('class', 'bar-group')
    .attr('transform', d => `translate(0,${yScale(d.code)})`)

  stack.forEach(medal => {
    barGroups
      .append('rect')
      .attr('class', `bar bar-${medal}`)
      .attr('x', d => {
        const offset =
          medal === 'gold'   ? 0 :
          medal === 'silver' ? d.gold :
                               d.gold + d.silver
        return xScale(offset)
      })
      .attr('y', 0)
      .attr('width', 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', medalColors[medal])
      .attr('data-medal', medal)
      .on('mouseenter', function (event, d) {
        showTooltip(event, d, medal)
        d3.select(this).attr('filter', 'url(#glow)')
      })
      .on('mousemove', function (event) {
        moveTooltip(event)
      })
      .on('mouseleave', function () {
        hideTooltip()
        d3.select(this).attr('filter', null)
      })
      .transition()
      .duration(800)
      .delay((_, i) => i * 30)
      .ease(d3.easeCubicOut)
      .attr('width', d => xScale(d[medal]))
  })

  // ---------- Medal count labels (on bars) ----------
  stack.forEach(medal => {
    barGroups
      .append('text')
      .attr('class', 'bar-value')
      .attr('y', yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('opacity', 0)
      .attr('x', d => {
        const offset =
          medal === 'gold'   ? 0 :
          medal === 'silver' ? d.gold :
                               d.gold + d.silver
        return xScale(offset) + xScale(d[medal]) / 2
      })
      .text(d => (d[medal] > 0 ? d[medal] : ''))
      .transition()
      .duration(800)
      .delay((_, i) => i * 30 + 400)
      .attr('opacity', d => (xScale(d[medal]) > 18 ? 1 : 0))
  })

  // ---------- Total labels (right of bars) ----------
  barGroups
    .append('text')
    .attr('class', 'total-label')
    .attr('x', d => xScale(d.total) + 8)
    .attr('y', yScale.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('opacity', 0)
    .text(d => d.total)
    .transition()
    .duration(800)
    .delay((_, i) => i * 30 + 600)
    .attr('opacity', 1)

  // ---------- Legend ----------
  const legendData = [
    { key: 'gold',   label: 'Or',     color: medalColors.gold   },
    { key: 'silver', label: 'Argent', color: medalColors.silver },
    { key: 'bronze', label: 'Bronze', color: medalColors.bronze }
  ]

  const legendX = innerW + 16
  const legend  = g.append('g').attr('class', 'legend').attr('transform', `translate(${legendX}, 0)`)

  legend
    .selectAll('.legend-item')
    .data(legendData)
    .join('g')
    .attr('class', 'legend-item')
    .attr('transform', (_, i) => `translate(0, ${i * 28})`)
    .call(item => {
      item
        .append('rect')
        .attr('width', 16)
        .attr('height', 16)
        .attr('rx', 3)
        .attr('fill', d => d.color)

      item
        .append('text')
        .attr('x', 24)
        .attr('y', 8)
        .attr('dy', '0.35em')
        .attr('class', 'legend-label')
        .text(d => d.label)
    })

  return svg.node()
}

// ---------- Tooltip helpers ----------
function showTooltip (event, d, medal) {
  const medalLabels = { gold: 'Or', silver: 'Argent', bronze: 'Bronze' }
  const medalColors = {
    gold:   '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32'
  }

  const flagSrc = `${ASSET_BASE}/flags/${d.code.toLowerCase()}.svg`

  const tt = d3.select('#medal-tooltip')
  tt.style('display', 'block')
    .html(`
      <div class="tt-header">
        <img class="tt-flag" src="${flagSrc}" alt="${d.code}" />
        <div>
          <div class="tt-country">${d.label}</div>
          <div class="tt-code">${d.code}</div>
        </div>
      </div>
      <div class="tt-divider"></div>
      <div class="tt-row">
        <span class="tt-dot" style="background:${medalColors[medal]}"></span>
        <span class="tt-medal">${medalLabels[medal]}</span>
        <span class="tt-val">${d[medal]}</span>
      </div>
      <div class="tt-all-medals">
        <span class="tt-dot" style="background:#FFD700"></span>${d.gold}
        <span class="tt-dot" style="background:#C0C0C0;margin-left:8px"></span>${d.silver}
        <span class="tt-dot" style="background:#CD7F32;margin-left:8px"></span>${d.bronze}
      </div>
      <div class="tt-total">Total : <strong>${d.total}</strong></div>
    `)
  moveTooltip(event)
}

function moveTooltip (event) {
  d3.select('#medal-tooltip')
    .style('left', `${event.pageX + 14}px`)
    .style('top',  `${event.pageY - 28}px`)
}

function hideTooltip () {
  d3.select('#medal-tooltip').style('display', 'none')
}
