import './style.css'
import './charts/medalChart.css'
import { loadData, renderMedalChart } from './charts/medalChart.js'

// Build the page shell
document.querySelector('#app').innerHTML = `
  <section id="medal-chart-section">
    <h1>Médailles aux Jeux Olympiques d'hiver 2022</h1>
    <p class="chart-subtitle">Classement des pays par nombre total de médailles — Or, Argent, Bronze</p>
    <div id="medal-chart-wrapper"></div>
  </section>

  <div id="medal-tooltip"></div>
`

// Load data and render
loadData().then(data => {
  renderMedalChart('#medal-chart-wrapper', data)
}).catch(err => {
  console.error('Erreur lors du chargement des données :', err)
  document.querySelector('#medal-chart-wrapper').innerHTML =
    '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
})
