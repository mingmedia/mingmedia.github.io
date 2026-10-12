// Builds the site into _site/, filling index.html with live data
// (name, icon, visits, players) from the Roblox APIs.
// Usage: node scripts/build.mjs

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';

const OUT = '_site';
const STATIC = ['404.html', 'CNAME', 'css', 'assets'];

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

const list = placeIds.map((placeId, i) => {
    const game = games.data.find(g => g.id === universeIds[i]);
    const icon = icons.data.find(t => t.targetId === universeIds[i]);
    if (!game) throw new Error(`No game data for place ${placeId}`);
    return {
        placeId,
        name: escapeHtml(cleanName(game.name)),
        img: icon?.state === 'Completed' ? icon.imageUrl : '/assets/favicon.png',
        visits: game.visits,
        playing: game.playing,
    };
}).sort((a, b) => b.visits - a.visits);

const cards = list.map(g => `
                <a class="card" href="https://www.roblox.com/games/${g.placeId}" target="_blank">
                    <img src="${g.img}" alt="${g.name}" width="512" height="512" loading="lazy">
                    <h3>${g.name}</h3>
                    <div class="meta">
                        <span>${compact(g.visits)} plays</span>${g.playing > 0 ? `
                        <span class="on">● ${g.playing.toLocaleString('en')}</span>` : ''}
                    </div>
                </a>`).join('').trimStart();

// The hero collage scrolls through three identical sets so the loop is seamless
const set = `<div class="set">${list.map(g => `<img src="${g.img}" alt="">`).join('')}</div>`;
const collage = [set, set, set].join('\n                ');

const replacements = {
    '<!-- GAMES -->': cards,
    '<!-- COLLAGE -->': collage,
    '{{TOTAL_VISITS}}': compact(list.reduce((sum, g) => sum + g.visits, 0)) + '+',
    '{{TOTAL_PLAYING}}': list.reduce((sum, g) => sum + g.playing, 0).toLocaleString('en'),
    '{{GAME_COUNT}}': String(list.length),
};

let index = readFileSync('index.html', 'utf8');
for (const [token, html] of Object.entries(replacements)) {
    if (!index.includes(token)) throw new Error(`index.html is missing ${token}`);
    index = index.replaceAll(token, html);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const path of STATIC) cpSync(path, `${OUT}/${path}`, { recursive: true });
writeFileSync(`${OUT}/index.html`, index);

console.log(`Built ${placeIds.length} games into ${OUT}/`);
