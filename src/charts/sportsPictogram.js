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

function filterSportsPictogramData(data, dateFilter, genderFilter, countryFilter) {
    let filteredData = data;
    if(dateFilter) { filteredData = filteredData.filter(d => d.date === dateFilter) };
    if(genderFilter) { filteredData = filteredData.filter(d => d.sex === genderFilter) };
    if(countryFilter) { filteredData = filteredData.filter(d => d.code === countryFilter) };

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

function formatSportsPictogramData(data, duplicateCards) {
    if (duplicateCards) {
        return data.map(medal => {
            const isGold = medal.medal_type === 'Gold';
            const isSilver = medal.medal_type === 'Silver';
            const isBronze = medal.medal_type === 'Bronze';

            return {
                discipline: medal.discipline,
                nbGold: isGold ? 1 : 0,
                nbSilver: isSilver ? 1 : 0,
                nbBronze: isBronze ? 1 : 0,
                nbMedals: 1,
                medals: [medal],
                disciplineFrenchName:  DISCIPLINE_FRENCH_NAME[medal.discipline] || medal.discipline,
                disciplineIcon: DISCIPLINE_ICON_PATH[medal.discipline]
            }
        });
    } else {
        return Array.from(data, ([eventName, medals]) => {
            const discipline = medals[0].discipline;
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
                disciplineFrenchName:  DISCIPLINE_FRENCH_NAME[discipline] || discipline,
                disciplineIcon: DISCIPLINE_ICON_PATH[discipline]
            }
        });
    }
}

export function buildDailyData(dateFilter, genderFilter, countryFilter) {
    if(!rawPictogramCache) return [];

    let data = rawPictogramCache;

    const filteredDisciplines = filterSportsPictogramData(data, dateFilter, genderFilter, countryFilter);
    const validMedals = deduplicateSportsPictogramData(filteredDisciplines);

    let formattedData;

    if (countryFilter) {
        formattedData = formatSportsPictogramData(validMedals, true);
        const medalValue = { 'Gold': 3, 'Silver': 2, 'Bronze': 1 };
        formattedData.sort((a, b) => {
            if (a.discipline !== b.discipline) return a.discipline.localeCompare(b.discipline);
            return medalValue[b.medals[0].medal_type] - medalValue[a.medals[0].medal_type];
        });
    } else {
        const grouped = d3.group(validMedals, d => d.event);
        formattedData = formatSportsPictogramData(grouped, false);
        formattedData.sort((a, b) => {
            if (a.discipline !== b.discipline) return a.discipline.localeCompare(b.discipline);
            return a.medals[0].event.localeCompare(b.medals[0].event);
        });
    }

    return formattedData;
}


export class SportsPictogram {

    constructor(containerSelector, filters = {}) {
        this.containerSelector = containerSelector;
        this.dateFilter = filters.dateFilter;
        this.genderFilter = filters.genderFilter;
        this.countryFilter = filters.countryFilter;

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
          <div class="side-panel-body pictogram-grid-wrapper"
               role="region"
               aria-label="Grille de pictogrammes des disciplines olympiques ayant donné lieu à au moins une médaille pour la période sélectionnée. Plusieurs disciplines concentrent de nombreuses médailles, notamment le ski de fond, le biathlon et le patinage. Survolez un pictogramme pour voir le détail des événements et des pays médaillés.">
            <div class="pictogram-grid"></div>
          </div>
          <div class="side-panel-body pictogram-empty">
            <span class="pictogram-empty-text">Aucune épreuve à ce jour</span>
          </div>
        `
    }

    updateFilters(dateFilter, genderFilter, countryFilter) {
        this.dateFilter = dateFilter;
        this.genderFilter = genderFilter;
        this.countryFilter = countryFilter;
        this.render()
    }

    render() {
        const root = document.querySelector(this.containerSelector);
        if(!root) return;

        const grid = root.querySelector(".pictogram-grid")
        const empty = root.querySelector(".pictogram-empty");
        const data = buildDailyData(this.dateFilter, this.genderFilter, this.countryFilter);

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

        if (this.countryFilter && discipline.medals.length === 1) {
            card.classList.add("pictogram-card-naked");
            const medal = discipline.medals[0];
            const color = medal.medal_type === 'Gold' ? MEDAL_COLORS.gold : 
                          medal.medal_type === 'Silver' ? MEDAL_COLORS.silver : MEDAL_COLORS.bronze;
                          
            card.innerHTML = `
              <div class="pictogram-single-icon-wrap">
                <div class="pictogram-single-icon" style="background-color: ${color}; -webkit-mask-image: url(${discipline.disciplineIcon}); mask-image: url(${discipline.disciplineIcon});"></div>
              </div>
            `;
        } else {
            card.classList.add("pictogram-card-naked");

            card.innerHTML = `
              <div class="pictogram-single-icon-wrap">
                <img class="pictogram-single-img" src="${discipline.disciplineIcon}" alt="Pictogramme de ${discipline.disciplineFrenchName}"/>
              </div>
            `;
        }

        card.addEventListener("mouseenter", e => this.showToolTip(e, discipline));
        card.addEventListener("mousemove", e => this.positionToolTip(e, discipline));
        card.addEventListener("mouseleave", e => this.hideToolTip(e, discipline));

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

    showToolTip(event, discipline) {
        let tooltip = document.getElementById("pictogram-tooltip");

        if(!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = "pictogram-tooltip";
            tooltip.className = "pictogram-tooltip";
            document.body.appendChild(tooltip);
        }

        const events = Array.from(new Set(discipline.medals.map(m => m.event))).sort();
        const eventList = events.map(event => {
            const eventMedals = discipline.medals.filter(m => m.event === event);
            return `
            <div class="pictogram-tooltip-event-group">
                <div class="pictogram-tooltip-event-name">${event}</div>
                <div class="pictogram-tooltip-event-winners">
                    ${this.buildMedalHTML(eventMedals, 'Gold', MEDAL_COLORS.gold)}
                    ${this.buildMedalHTML(eventMedals,'Silver', MEDAL_COLORS.silver)}
                    ${this.buildMedalHTML(eventMedals, 'Bronze', MEDAL_COLORS.bronze)}
                </div>
            </div>
            `
        }).join("");

        tooltip.innerHTML= `
            <div class="pictogram-tooltip-header">
                <span class="pictogram-tooltip-discipline">${discipline.disciplineFrenchName}</span>
                <span class="pictogram-tooltip-date">${this.dateFilter ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(this.dateFilter)) : 'Tous les jours'}</span>
            </div>
            <div class="pictogram-tooltip-events-container">
                ${eventList || '<div class="pictogram-tooltip-empty">Aucune épreuve détaillée</div>'}
            </div>
        `
        tooltip.style.display = "block";
        this.positionToolTip(event);
    }

    buildMedalHTML(medals, type, color) {
        const winners = medals.filter(d => d.medal_type === type);
        if (winners.length === 0) return "";

        const medalHTML = winners.map(m => `
        <div class="pictogram-tooltip-event-medal">
            <span class="pictogram-tooltip-dot" style="background:${color}"></span>
            <img class="pictogram-tooltip-flag-small" src="${ASSET_BASE}/flags/${m.code.toLowerCase()}.svg"/>
            <span class="pictogram-tooltip-country-name">${m.country}</span>
        </div>    
        `).join("")

        return medalHTML;
    }

    positionToolTip(event) {
        const tooltip = document.getElementById("pictogram-tooltip");
        if (!tooltip || tooltip.style.display === 'none') return;

        const width = tooltip.offsetWidth  || 240;
        const height = tooltip.offsetHeight || 140;
        let left, top;

        if (event.clientX !== undefined && event.clientY !== undefined) {
            left = event.clientX + 14;
            top  = event.clientY - 28;

            if (left + width > window.innerWidth  - 12) left = event.clientX - width - 14;
            if (top  + height > window.innerHeight - 12) top  = event.clientY - height - 8;
        } else {
            const card = event.target.closest ? (event.target.closest('.pictogram-card') || event.target) : event.target;
            const rect = card.getBoundingClientRect();
            
            left = rect.left + (rect.width / 2) - (width / 2);
            top  = rect.top - height - 8;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    hideToolTip() {
        const toolTip = document.getElementById("pictogram-tooltip");
        if(toolTip) toolTip.style.display = "none";
    }


}