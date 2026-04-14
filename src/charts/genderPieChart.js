import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`

export async function loadGenderData () {
  const raw = await d3.csv(`${ASSET_BASE}/data/medals.csv`)
  
  const roll = d3.rollup(raw, v => v.length, d => d.athlete_sex.trim())
  const total = raw.length
  
  return [
    { key: 'M', label: 'Male', count: roll.get('M') || 0, color: '#82C6C0' },
    { key: 'W', label: 'Female', count: roll.get('W') || 0, color: '#2B4450' },
    { key: 'X', label: 'Mixed', count: roll.get('X') || 0, color: '#E3C273' },
    { key: 'O', label: 'Other', count: roll.get('O') || 0, color: '#F6A266' }
  ].map(d => ({
    ...d,
    percent: (d.count / total * 100).toFixed(1)
  }))
}

export function renderGenderPieChart (containerId, data, onSelect) {
  const container = document.querySelector(containerId)
  if (!container) return
  
  const width = container.getBoundingClientRect().width || 600
  const height = 450
  const margin = 50
  const radius = Math.min(width, height) / 2 - margin

  d3.select(containerId).selectAll('svg').remove()

  const svg = d3.select(containerId)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', 'auto')
    .attr('class', 'gender-pie-svg')

  const g = svg.append('g')
    .attr('transform', `translate(${width / 2}, ${(height / 2) - 20})`)

  const pie = d3.pie()
    .value(d => d.count)
    .sort(null)

  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius)

  // Arc for labels positioning
  const outerArc = d3.arc()
    .innerRadius(radius + 15)
    .outerRadius(radius + 15)

  const pieData = pie(data)

  // ── DRAW SLICES ───────────────────────────────────────────────
  const slices = g.selectAll('path')
    .data(pieData)
    .join('path')
    .attr('d', arc)
    .attr('fill', d => d.data.color)
    .attr('class', 'gender-slice')
    .attr('data-key', d => d.data.key)
    .on('click', function (event, d) {
      if (onSelect) onSelect(d.data.key)
    })
    .on('mouseenter', function() {
      d3.select(this).style('cursor', 'pointer');
    })

  // ── LABELS ───────────────────────────────────────────────────
  // Text labels outside the pie
  const labelsGroup = g.append('g').attr('class', 'gender-labels')
  
  labelsGroup.selectAll('text')
    .data(pieData)
    .join('text')
    .attr('transform', d => {
      const pos = outerArc.centroid(d)
      return `translate(${pos})`
    })
    .style('text-anchor', d => {
      const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2
      return (midAngle < Math.PI ? 'start' : 'end')
    })
    .attr('dy', '0.35em')
    .attr('class', 'gender-label-text')
    .call(text => {
      text.append('tspan')
        .attr('x', 0)
        .attr('font-weight', 'bold')
        .text(d => d.data.label)
      text.append('tspan')
        .attr('x', 0)
        .attr('dy', '1em')
        .attr('font-size', '0.9em')
        .text(d => `${d.data.percent}%`)
    })
    .on('click', function(event, d) {
       if (onSelect) onSelect(d.data.key)
    })
    .on('mouseenter', function() {
       d3.select(this).style('cursor', 'pointer');
    })

  // ── LEGEND ───────────────────────────────────────────────────
  const legendGroup = svg.append('g')
    .attr('class', 'gender-legend-group')
    .attr('transform', `translate(${width / 2}, ${height - 20})`)
  
  const legendSpace = 90
  const startX = -((data.length * legendSpace) / 2) + (legendSpace / 2)

  const legendItems = legendGroup.selectAll('.gender-legend-item')
    .data(data)
    .join('g')
    .attr('class', 'gender-legend-item')
    .attr('transform', (d, i) => `translate(${startX + i * legendSpace}, 0)`)
    .attr('data-key', d => d.key)
    .on('click', function (event, d) {
      if (onSelect) onSelect(d.key)
    })
    .on('mouseenter', function() {
       d3.select(this).style('cursor', 'pointer');
    })

  legendItems.append('circle')
    .attr('r', 6)
    .attr('fill', d => d.color)

  legendItems.append('text')
    .attr('x', 12)
    .attr('y', 0)
    .attr('dy', '0.35em')
    .attr('class', 'gender-legend-label')
    .text(d => d.label)
    
  return {
    updateSelection: (activeKey) => {
      // Dim unselected slices and labels
      slices.classed('dimmed', d => activeKey !== null && d.data.key !== activeKey)
      labelsGroup.selectAll('text').classed('dimmed', d => activeKey !== null && d.data.key !== activeKey)
      legendItems.classed('dimmed', d => activeKey !== null && d.key !== activeKey)
    }
  }
}
