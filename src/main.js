import './style.css'
import './charts/medalChart.css'
import './charts/athletesTable.css'
import { loadData, renderMedalChart } from './charts/medalChart.js'
import { loadAthletesTableMedalsData, initAthletesTable } from './charts/athletesTable.js'

// Build the page shell
document.querySelector('#app').innerHTML = `
  <section id="medal-chart-section" class="chart-section">
    <h1>Médailles aux Jeux Olympiques d'hiver 2022</h1>
    <p class="chart-subtitle">Classement des pays par nombre total de médailles — Or, Argent, Bronze</p>
    <div id="medal-chart-wrapper"></div>
  </section>

  <section id="athletes-table-section" class="chart-section">
  </section>

  <div id="medal-tooltip"></div>
`

// Load data and render
Promise.all([loadData(), loadAthletesTableMedalsData()]).then(([medalData, athletesTableData]) => {
  renderMedalChart('#medal-chart-wrapper', medalData)

  initAthletesTable('#athletes-table-section', athletesTableData)
}).catch(err => {
  console.error('Erreur lors du chargement des données :', err)
  document.querySelector('#medal-chart-wrapper').innerHTML =
    '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'

  const athletesTableSection = document.querySelector('#athletes-table-section')
  if (athletesTableSection) {
    athletesTableSection.innerHTML = '<p style="color:red;text-align:center">Erreur lors du chargement des données.</p>'
  }
})
