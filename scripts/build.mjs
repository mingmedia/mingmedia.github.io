// Builds the site into _site/, filling the games grid in index.html with
// live data (name, icon, visits, players) from the Roblox APIs.
// Usage: node scripts/build.mjs

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';

const OUT = '_site';
const STATIC = ['404.html', 'CNAME', 'css', 'js', 'assets'];
const PLACEHOLDER = '<!-- GAMES -->';

async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url);
        if (res.ok) return res.json();
        if (attempt === 3) throw new Error(`${res.status} ${res.statusText} for ${url}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
    }
}

// Strip tags like "[🐴]" or "[RUSSIA 🇷🇺]" and emoji from Roblox game names
function cleanName(name) {
    return name
        .replace(/\[[^\]]*\]|\([^)]*\)/g, '')
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}️‍]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(n) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function escapeHtml(s) {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const placeIds = JSON.parse(readFileSync('games.json', 'utf8'));

const universeIds = await Promise.all(placeIds.map(id =>
    getJson(`https://apis.roblox.com/universes/v1/places/${id}/universe`).then(j => j.universeId)
));
const ids = universeIds.join(',');
const [games, icons] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${ids}`),
    getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=512x512&format=Png`),
]);

const cards = placeIds.map((placeId, i) => {
    const game = games.data.find(g => g.id === universeIds[i]);
    const icon = icons.data.find(t => t.targetId === universeIds[i]);
    if (!game) throw new Error(`No game data for place ${placeId}`);
    const name = escapeHtml(cleanName(game.name));
    const img = icon?.state === 'Completed' ? icon.imageUrl : '/assets/favicon.png';
    return `
                    <div class="col-md-6 col-lg-4 mb-5">
                        <div class="portfolio-item mx-auto">
                            <a target="_blank" href="https://www.roblox.com/games/${placeId}">
                                <img class="img-fluid" src="${img}" alt="${name}" width="512" height="512" loading="lazy">
                                <h3 class="title">${name}</h3>
                                <p class="stats">
                                    <span>${compact(game.visits)} visits</span>
                                    <span class="${game.playing > 0 ? 'live' : ''}">${game.playing.toLocaleString('en')} playing</span>
                                </p>
                            </a>
                        </div>
                    </div>`;
}).join('');

const index = readFileSync('index.html', 'utf8');
if (!index.includes(PLACEHOLDER)) throw new Error(`index.html is missing ${PLACEHOLDER}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const path of STATIC) cpSync(path, `${OUT}/${path}`, { recursive: true });
writeFileSync(`${OUT}/index.html`, index.replace(PLACEHOLDER, cards.trimStart()));

console.log(`Built ${placeIds.length} games into ${OUT}/`);
