import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

let rawMedalsCache = null
let namesCache = null

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

export function computeMedalTotals (genderFilter) {
  if (!rawMedalsCache) return []
  
  let filtered = rawMedalsCache
  if (genderFilter) {
    filtered = rawMedalsCache.filter(d => d.athlete_sex.trim() === genderFilter)
  }

  const seen = new Set()
  const uniqueMedals = filtered.filter(d => {
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

export function renderMedalChart (containerId, data) {
  const sorted = [...data].sort(
    (a, b) =>
      b.total  - a.total  ||
      b.gold   - a.gold   ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.code.localeCompare(b.code)
  )

  const container = document.querySelector(containerId)
  const containerWidth = container.getBoundingClientRect().width || 800

  const flagW   = 28   
  const flagH   = 20   
  const flagGap = 8    
  const codeW   = 36   

  const margin = {
    top: 24,
    right: 160,
    bottom: 40,
    left: flagW + flagGap + codeW + 14
  }
  const sectionHeaderH = 130
  const availableH = window.innerHeight - sectionHeaderH
  const height = Math.max(availableH, sorted.length * 20 + margin.top + margin.bottom)
  const width  = containerWidth

  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

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

  function getElementCenterEvent (element) {
    const rect = element.getBoundingClientRect()
    return {
      pageX: rect.left + window.scrollX + rect.width / 2,
      pageY: rect.top + window.scrollY + rect.height / 2
    }
  }

  d3.select(containerId).selectAll('svg').remove()
  
  const descId = 'medal-chart-desc'

  const svg = d3
    .select(containerId)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('width', '100%')
    .style('height', 'auto')
    .attr('role', 'img')
    .attr('aria-label', 'Graphique en barres empilées horizontales des médailles olympiques par pays')
    .attr('aria-describedby', descId)

  svg.append('desc')
    .attr('id', descId)
    .text(
      'Graphique en barres empilées horizontales. ' +
      'L\'axe horizontal représente le nombre de médailles (Or, Argent, Bronze) et l\'axe vertical liste les pays participants aux Jeux olympiques d\'hiver de Pékin 2022. ' +
      'La Norvège domine le classement avec le plus grand nombre total de médailles, suivie de l\'Allemagne et des États-Unis. ' +
      'On distingue trois groupes : un peloton de tête composé de 5 à 6 grands pays (Norvège, Allemagne, États-Unis, Suède, Pays-Bas, Autriche), ' +
      'un groupe intermédiaire d\'environ 10 nations, et un groupe de pays avec peu ou une seule médaille. ' +
      'Ces résultats reflètent la domination historique des nations nordiques et alpines dans les sports d\'hiver, ' +
      'mais mettent aussi en lumière des performances notables de pays comme la Chine, pays hôte, et la Corée.'
    )

  const defs = svg.append('defs')

  const filter = defs.append('filter').attr('id', 'glow')
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'coloredBlur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

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

  g.append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format('d')))
    .call(ax => ax.select('.domain').remove())

  g.append('text')
    .attr('class', 'axis-label x-axis-label')
    .attr('x', innerW / 2)
    .attr('y', innerH + margin.bottom - 2)
    .attr('text-anchor', 'middle')
    .text('Nombre de médailles')

  g.append('g')
    .attr('class', 'axis y-axis')
    .call(d3.axisLeft(yScale).tickFormat(''))
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('.tick line').remove())

  g.append('text')
    .attr('class', 'axis-label y-axis-label')
    .attr('x', -margin.left)
    .attr('y', -8)
    .attr('text-anchor', 'start')
    .text('Pays')

  const labelGroups = g
    .selectAll('.label-group')
    .data(sorted)
    .join('g')
    .attr('class', 'label-group')
    .attr('transform', d => `translate(0,${yScale(d.code) + yScale.bandwidth() / 2})`)

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

  labelGroups
    .append('text')
    .attr('class', 'country-label')
    .attr('x', -8)
    .attr('y', 0)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .text(d => d.code)

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
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', d => {
        const labels = { gold: 'or', silver: 'argent', bronze: 'bronze' }
        return `${d.label} (${d.code}), ${d[medal]} médaille${d[medal] > 1 ? 's' : ''} ${labels[medal]}`
      })
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
      .on('focus', function (_event, d) {
        const centerEvent = getElementCenterEvent(this)
        showTooltip(centerEvent, d, medal)
        d3.select(this).attr('filter', 'url(#glow)')
      })
      .on('blur', function () {
        hideTooltip()
        d3.select(this).attr('filter', null)
      })
      .on('keydown', function (event, d) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const centerEvent = getElementCenterEvent(this)
        showTooltip(centerEvent, d, medal)
      })
      .transition()
      .duration(800)
      .delay((_, i) => i * 30)
      .ease(d3.easeCubicOut)
      .attr('width', d => xScale(d[medal]))
  })

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
    .style('left', `${event.clientX + 14}px`)
    .style('top',  `${event.clientY - 28}px`)
}

function hideTooltip () {
  d3.select('#medal-tooltip').style('display', 'none')
}
