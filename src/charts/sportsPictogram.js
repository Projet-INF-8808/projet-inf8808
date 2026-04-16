import * as d3 from 'd3'

const ASSET_BASE = `${import.meta.env.BASE_URL}assets`;
const PICTOGRAM_ICONS_BASE = `${ASSET_BASE}/discipline_pictograms/`

const DISCIPLINE_ICON_PATH = {
    "Alpine Skiing": `${PICTOGRAM_ICONS_BASE}/apline_skiing.png`,
    "Biathlon": `${PICTOGRAM_ICONS_BASE}/biathlon.png`,
    "Bobsleigh": `${PICTOGRAM_ICONS_BASE}/bobsleigh.png`,
    "Cross-Country Skiing": `${PICTOGRAM_ICONS_BASE}/cross_country_skiing.png`,
    "Curling": `${PICTOGRAM_ICONS_BASE}/curling.png`,
    "Figure Skating": `${PICTOGRAM_ICONS_BASE}/figure_skating.png`,
    "Freestyle Skiing": `${PICTOGRAM_ICONS_BASE}/freestyle_skiing.png`,
    "Ice Hockey": `${PICTOGRAM_ICONS_BASE}/ice_hockey.png`,
    "Luge": `${PICTOGRAM_ICONS_BASE}/luge.png`,
    "Nordic Combined": `${PICTOGRAM_ICONS_BASE}/nordic_combined.png`,
    "Short Track Speed Skating": `${PICTOGRAM_ICONS_BASE}/short_track_speed_skating.png`,
    "Skeleton": `${PICTOGRAM_ICONS_BASE}/skeleton.png`,
    "Ski Jumping": `${PICTOGRAM_ICONS_BASE}/ski_jumping.png`,
    "Snowboard": `${PICTOGRAM_ICONS_BASE}/snowboard.png`,
    "Speed Skating": `${PICTOGRAM_ICONS_BASE}/speed_skating.png`
}

const DISCIPLINE_FRENCH_NAME = {
    "Alpine Skiing": "Ski alpin",
    "Biathlon": "Biathlon",
    "Bobsleigh": "Bobsleigh",
    "Cross-Country Skiing": "Ski de fond",
    "Curling": "Curling",
    "Figure Skating": "Patinage artistique",
    "Freestyle Skiing": "Ski acrobatique",
    "Ice Hockey": "Hockey sur glace",
    "Luge": "Luge",
    "Nordic Combined": "Combiné nordique",
    "Short Track Speed Skating": "Patinage courte piste",
    "Skeleton": "Skeleton",
    "Ski Jumping": "Saut à ski",
    "Snowboard": "Snowboard",
    "Speed Skating": "Patinage de vitesse"
}

const MEDAL_COLORS = {
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32'
}

let rawPictogramCache = null;

export async function loadSportsPictogramData() {
    if(rawPictogramCache) return rawPictogramCache;

    rawPictogramCache = await d3.csv(`${ASSET_BASE}/data/medals.csv`, d => ({
        date:         d.medal_date.trim().slice(0, 10),
        event:        d.event.trim(),
        discipline:   d.discipline.trim(),
        medal_type:   d.medal_type.trim(),
        country:      d.country.trim(),
        code:         d.country_code.trim(),
        sex:          d.athlete_sex.trim(),
        athlete:      d.athlete_name.trim()
    }));

    return rawPictogramCache;
}

function filterSportsPictogramData(data, dateFilter, genderFilter) {
    let filteredData = data;
    if(dateFilter) { filteredData = filteredData.filter(d => d.date === dateFilter) };
    if(genderFilter) { filteredData = filteredData.filter(d => d.sex === genderFilter) };

    return filteredData;
}

function deduplicateSportsPictogramData(data) {
    const seen = new Set();
    const unique = data.filter(d => {
        const key = `${d.date}||${d.event}||${d.country_code}||${d.medal_type}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    });

    return unique;
}

function formatSportsPictogramData(data) {
    return Array.from(data, ([discipline, medals]) => {
        const nbGold = medals.filter(m => m.medal_type === 'Gold').length;
        const nbSilver = medals.filter(m => m.medal_type === 'Silver').length;
        const nbBronze = medals.filter(m => m.medal_type === 'Bronze').length;
        const nbMedals = nbGold + nbBronze + nbSilver;

        return {
            discipline: discipline,
            nbGold: nbGold,
            nbSilver: nbSilver,
            nbBronze: nbBronze,
            nbMedals: nbMedals,
            medals: medals,
            disciplineFrenchName:  DISCIPLINE_FRENCH_NAME[discipline],
            disciplineIcon: DISCIPLINE_ICON_PATH[discipline]
        }
    })
}

export function buildDailyData(dateFilter, genderFilter) {
    if(!rawPictogramCache) return [];

    let data = rawPictogramCache;

    const filteredDisciplines = filterSportsPictogramData(data, dateFilter, genderFilter);
    const validMedals = deduplicateSportsPictogramData(filteredDisciplines);
    const grouped = d3.group(validMedals, d => d.discipline);

    const formattedData = formatSportsPictogramData(grouped);
    formattedData.sort((a, b) => (b.nbMedals - a.nbMedals))

    return formattedData;
}


export class SportsPictogram {

    constructor(containerSelector, filters = {}) {
        this.containerSelector = containerSelector;
        this.dateFilter = filters.dateFilter;
        this.genderFilter = filters.genderFilter;

        this.initPictogram()
        this.render();
    }

    initPictogram() {
       const root = document.querySelector(this.containerSelector);
       if(!root) return;
       
       root.innerHTML = `
          <div class="side-panel-header pictogram-panel-header">
            <span class="side-panel-title pictogram-panel-title">Événements</span>
          </div>
          <div class="side-panel-body pictogram-grid-wrapper">
            <div class="pictogram-grid"></div>
          </div>
          <div class="side-panel-body pictogram-empty">
            <span class="pictogram-empty-text">Aucune épreuve à ce jour</span>
          </div>
        `
    }

    updateFilters(dateFilter, genderFilter) {
        this.dateFilter = dateFilter;
        this.genderFilter = genderFilter;
        this.render()
    }

    render() {
        const root = document.querySelector(this.containerSelector);
        if(!root) return;

        const grid = root.querySelector(".pictogram-grid")
        const empty = root.querySelector(".pictogram-empty");
        const data = buildDailyData(this.dateFilter, this.genderFilter);

        if(data.length === 0) {
            this.showEmptyState(grid, empty);
        } else {
            this.showPictogram(grid, empty, data);
        }
    }

    showEmptyState(grid, empty) {
        if (grid) grid.style.display = "none";
        if (empty) empty.style.display = "flex";
    }

    showPictogram(grid, empty, data) {
        if (empty) empty.style.display = "none";
        if (!grid) return;

        grid.style.display = "";
        grid.innerHTML = "";

        data.forEach((discipline, i) => {
            const card = this.createCard(discipline, i)
            grid.appendChild(card);
        })
    }

    createCard(discipline, index) {
        const card = document.createElement("div");
        card.className = "pictogram-card";
        card.dataset.discipline = discipline.discipline;

        const medalDots = this.createMedalDots(discipline);

        card.innerHTML = `
          <div class="pictogram-icon-wrap">
            <img class="pictogram-icon" src="${discipline.disciplineIcon}"/>
          </div>
          <div class="pictogram-card-name">${discipline.disciplineFrenchName}</div>
          <div class="pictogram-medals">${medalDots}</div>
        `;

        return card;
    }

    createMedalDots(discipline) {
        const medals = [
            {type: "Gold", count: discipline.nbGold, color: MEDAL_COLORS.gold},
            {type: "Silver", count: discipline.nbSilver, color: MEDAL_COLORS.silver},
            {type: "Bronze", count: discipline.nbBronze, color: MEDAL_COLORS.bronze}
        ]

        const medalDots = medals.filter(medal => medal.count > 0).map(medal => 
            Array.from({ length: medal.count }, () => 
                `<span class="pictogram-medal-dot" style="background: ${medal.color}"></span>`
            ).join('')
        ).join('');

        return medalDots;
    }


}