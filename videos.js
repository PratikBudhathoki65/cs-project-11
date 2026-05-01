/**
 * =============================================
 * COREDECK VIDEO VAULT — videos.js
 * =============================================
 * Works WITHOUT any API key or third-party service.
 * Uses YouTube's own systems:
 * 1. YouTube oEmbed API (always available)
 * 2. YouTube iframe embeds (always works)
 * 3. Direct YouTube thumbnail URLs (i.ytimg.com)
 * 
 * Search method: Scrapes YouTube search results
 * page via a CORS proxy, or falls back to
 * curated channel-based results.
 * =============================================
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────
  const PER_PAGE = 12;

  // CORS proxies — rotates if one fails
  const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest='
  ];

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────
  let currentQuery = '';
  let allResults = [];
  let activeFilter = 'all';
  let nowPlayingId = '';
  let isLoading = false;
  let watchHistory = [];
  let proxyIndex = 0;
  let searchPage = 0;

  // ─────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const DOM = {
    form: $('sForm'),
    input: $('sInput'),
    grid: $('vGrid'),
    empty: $('vEmpty'),
    loading: $('vLoading'),
    status: $('vStatus'),
    count: $('vCount'),
    more: $('vMore'),
    moreBtn: $('vMoreBtn'),
    topBtn: $('vTop'),
    watch: $('watchMode'),
    frame: $('wFrame'),
    title: $('wTitle'),
    stats: $('wStats'),
    ytLink: $('wYT'),
    chRow: $('wChRow'),
    desc: $('wDesc'),
    descToggle: $('wDescToggle'),
    related: $('wRelated'),
    closeBtn: $('watchClose'),
    moreChBtn: $('wMoreCh'),
    backBtn: $('wBack'),
    tags: document.querySelectorAll('.v-tag'),
    filters: document.querySelectorAll('.v-filter')
  };

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  const NEPALI_KEYS = [
    'nepali', 'नेपाली', 'nepal', 'neb', 'hamro', 'sajilo',
    'merospark', 'कक्षा', 'नेपालीमा', 'विज्ञान', 'गणित',
    'रसायन', 'भौतिक', '+2 nepal'
  ];

  function isNepali(text) {
    const t = (text || '').toLowerCase();
    return NEPALI_KEYS.some(k => t.includes(k)) || /[\u0900-\u097F]/.test(text);
  }

  function formatViews(v) {
    const n = parseInt(v);
    if (isNaN(n) || n === 0) return '';
    if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(1) + ' Lakh';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  function formatDuration(text) {
    if (!text) return '';
    // Handle "12:34" format
    if (/^\d+:\d+/.test(text)) return text;
    // Handle seconds
    const sec = parseInt(text);
    if (isNaN(sec)) return text;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function timeAgo(text) {
    if (!text) return '';
    if (typeof text === 'string' && text.includes('ago')) return text;
    const d = new Date(typeof text === 'number' ? text * 1000 : text);
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 1) return 'Today';
    if (days < 7) return days + ' days ago';
    if (days < 30) return Math.floor(days / 7) + ' weeks ago';
    if (days < 365) return Math.floor(days / 30) + ' months ago';
    return Math.floor(days / 365) + ' years ago';
  }

  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function thumb(id, q) {
    return `https://i.ytimg.com/vi/${id}/${q || 'hqdefault'}.jpg`;
  }

  // ─────────────────────────────────────────────
  // FETCH WITH CORS PROXY ROTATION
  // ─────────────────────────────────────────────
  async function proxyFetch(url) {
    let lastErr;
    for (let i = 0; i < PROXIES.length; i++) {
      const idx = (proxyIndex + i) % PROXIES.length;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(PROXIES[idx] + encodeURIComponent(url), {
          signal: controller.signal
        });
        clearTimeout(timer);
        if (resp.ok) {
          proxyIndex = idx;
          return await resp.text();
        }
        lastErr = new Error('Proxy returned ' + resp.status);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('All proxies failed');
  }

  // ─────────────────────────────────────────────
  // YOUTUBE SEARCH — Extracts from YouTube HTML
  // ─────────────────────────────────────────────
  async function youtubeSearch(query) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const html = await proxyFetch(url);

    // Extract ytInitialData JSON from YouTube's HTML
    const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s)
      || html.match(/ytInitialData"\s*:\s*({.+?})\s*,\s*"/s)
      || html.match(/window\["ytInitialData"\]\s*=\s*({.+?});\s*/s);

    if (!match) {
      throw new Error('Could not parse YouTube results');
    }

    const data = JSON.parse(match[1]);

    // Navigate YouTube's nested JSON structure
    const contents = data?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents;

    if (!contents) throw new Error('No search results found');

    const videos = [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;

      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr) continue;

        const videoId = vr.videoId;
        if (!videoId) continue;

        // Extract data
        const title = vr.title?.runs?.[0]?.text || '';
        const channel = vr.ownerText?.runs?.[0]?.text || '';
        const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint
          ?.browseEndpoint?.browseId || '';

        // Views
        let viewsText = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || '';
        let viewCount = 0;
        const viewMatch = viewsText.replace(/,/g, '').match(/(\d+)/);
        if (viewMatch) viewCount = parseInt(viewMatch[1]);

        // Duration
        let duration = vr.lengthText?.simpleText || '';

        // Published
        let published = vr.publishedTimeText?.simpleText || '';

        // Description snippet
        let desc = '';
        if (vr.detailedMetadataSnippets) {
          desc = vr.detailedMetadataSnippets[0]?.snippetText?.runs
            ?.map(r => r.text).join('') || '';
        }

        // Channel thumbnail
        let channelThumb = vr.channelThumbnailSupportedRenderers
          ?.channelThumbnailWithLinkRenderer
          ?.thumbnail?.thumbnails?.[0]?.url || '';
        if (channelThumb.startsWith('//')) channelThumb = 'https:' + channelThumb;

        // Is live
        const isLive = vr.badges?.some(b =>
          b?.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW'
        ) || false;

        videos.push({
          id: videoId,
          title: title,
          channel: channel,
          channelId: channelId,
          channelAvatar: channelThumb,
          description: desc,
          thumbnail: thumb(videoId, 'hqdefault'),
          views: viewCount,
          viewsText: viewsText,
          duration: duration,
          published: published,
          isNepali: isNepali(title + ' ' + channel + ' ' + desc),
          isLive: isLive
        });
      }
    }

    return videos;
  }

  // ─────────────────────────────────────────────
  // FALLBACK SEARCH — Curated channel results
  // ─────────────────────────────────────────────
  function fallbackSearch(query) {
    const channels = [
      { name: 'Physics Wallah', np: false },
      { name: 'Hamro Academy', np: true },
      { name: 'Khan Academy', np: false },
      { name: 'Nepali Physics', np: true },
      { name: 'MeroSpark Education', np: true },
      { name: 'Sajilo Siksha', np: true },
      { name: 'The Organic Chemistry Tutor', np: false },
      { name: 'Unacademy', np: false },
      { name: 'Vedantu', np: false },
      { name: 'Mohit Tyagi', np: false },
      { name: 'ExamFear Education', np: false },
      { name: 'Etoos Education', np: false }
    ];

    const words = query.split(' ').filter(w => w.length > 2);
    const topic = words.join(' ');
    const isNpQuery = query.toLowerCase().includes('nepali') || /[\u0900-\u097F]/.test(query);

    const sorted = isNpQuery
      ? [...channels.filter(c => c.np), ...channels.filter(c => !c.np)]
      : [...channels.filter(c => !c.np), ...channels.filter(c => c.np)];

    return sorted.map(ch => ({
      id: null,
      title: `${topic} — ${ch.np ? 'नेपालीमा' : 'Full Lecture'} | ${ch.name}`,
      channel: ch.name,
      channelId: '',
      channelAvatar: '',
      description: `Search for ${topic} lectures by ${ch.name}`,
      thumbnail: '',
      views: 0,
      viewsText: '',
      duration: '',
      published: '',
      isNepali: ch.np,
      isLive: false,
      isFallback: true,
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' ' + ch.name)}`
    }));
  }

  // ─────────────────────────────────────────────
  // GET RELATED VIDEOS
  // ─────────────────────────────────────────────
  async function getRelated(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const html = await proxyFetch(url);

      const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s)
        || html.match(/ytInitialData"\s*:\s*({.+?})\s*,\s*"/s);

      if (!match) return [];

      const data = JSON.parse(match[1]);

      // Find secondary results (related videos)
      const secondary = data?.contents
        ?.twoColumnWatchNextResults
        ?.secondaryResults
        ?.secondaryResults
        ?.results;

      if (!secondary) return [];

      const related = [];

      for (const item of secondary) {
        const cr = item?.compactVideoRenderer;
        if (!cr || !cr.videoId) continue;

        related.push({
          id: cr.videoId,
          title: cr.title?.simpleText || cr.title?.runs?.[0]?.text || '',
          channel: cr.longBylineText?.runs?.[0]?.text
            || cr.shortBylineText?.runs?.[0]?.text || '',
          channelId: '',
          channelAvatar: '',
          description: '',
          thumbnail: thumb(cr.videoId, 'mqdefault'),
          views: 0,
          viewsText: cr.viewCountText?.simpleText || '',
          duration: cr.lengthText?.simpleText || '',
          published: cr.publishedTimeText?.simpleText || '',
          isNepali: isNepali(
            (cr.title?.simpleText || '') + ' ' +
            (cr.longBylineText?.runs?.[0]?.text || '')
          ),
          isLive: false
        });
      }

      return related;
    } catch (e) {
      console.warn('Related fetch failed:', e);
      return [];
    }
  }

  // ─────────────────────────────────────────────
  // MAIN SEARCH FUNCTION
  // ─────────────────────────────────────────────
  async function search(query, loadMore) {
    if (isLoading) return;
    isLoading = true;

    if (!loadMore) {
      DOM.empty.style.display = 'none';
      DOM.grid.innerHTML = '';
      allResults = [];
      DOM.more.classList.remove('on');
    }

    DOM.status.style.display = 'none';
    DOM.loading.classList.add('on');
    currentQuery = query.trim();

    let sq = currentQuery;
    if (!/class\s*1[12]|कक्षा|neb/i.test(sq)) {
      sq = 'Class 11 ' + sq;
    }

    try {
      // Try YouTube scraping via proxy
      const videos = await youtubeSearch(sq);

      if (videos.length > 0) {
        allResults = loadMore ? [...allResults, ...videos] : videos;
        DOM.loading.classList.remove('on');
        isLoading = false;
        renderGrid();
        DOM.more.classList.remove('on'); // YouTube scraping doesn't paginate easily
        return;
      }

      throw new Error('No results');
    } catch (err) {
      console.warn('YouTube scraping failed:', err.message);
      console.log('Using fallback search...');

      // Fallback: curated channel results
      const fallback = fallbackSearch(sq);
      allResults = fallback;
      DOM.loading.classList.remove('on');
      isLoading = false;
      renderGrid();
      DOM.more.classList.remove('on');
    }
  }

  // ─────────────────────────────────────────────
  // RENDER GRID
  // ─────────────────────────────────────────────
  function renderGrid() {
    let list = allResults;
    if (activeFilter === 'nepali') list = allResults.filter(v => v.isNepali);
    if (activeFilter === 'english') list = allResults.filter(v => !v.isNepali);

    const npC = allResults.filter(v => v.isNepali).length;
    const enC = allResults.filter(v => !v.isNepali).length;

    DOM.status.style.display = 'flex';
    DOM.count.innerHTML = `
      <strong>${list.length}</strong> results for
      <span class="v-query">"${esc(currentQuery)}"</span>
      ${npC > 0 ? `<span class="v-lang-info">(${npC} नेपाली · ${enC} English)</span>` : ''}
    `;

    if (list.length === 0) {
      showNoResults();
      return;
    }

    DOM.grid.innerHTML = list.map((v, i) => {
      const playing = v.id === nowPlayingId;
      const views = v.viewsText || (v.views ? formatViews(v.views) + ' views' : '');
      const isFallback = v.isFallback;

      // Avatar
      const avatar = v.channelAvatar
        ? `<img class="v-avatar" src="${v.channelAvatar}" alt="" loading="lazy"
               onerror="this.outerHTML='<div class=\\'v-avatar-ph\\'>${(v.channel || '?').charAt(0).toUpperCase()}</div>'">`
        : `<div class="v-avatar-ph">${(v.channel || '?').charAt(0).toUpperCase()}</div>`;

      // Badge
      let badge;
      if (playing) {
        badge = `<span class="v-now-playing">
          <span class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>
          Playing</span>`;
      } else if (v.isNepali) {
        badge = '<span class="v-badge-lang np">🇳🇵 नेपाली</span>';
      } else {
        badge = '<span class="v-badge-lang en">EN</span>';
      }

      // Thumbnail or placeholder
      let thumbContent;
      if (v.thumbnail && v.id) {
        thumbContent = `<img src="${v.thumbnail}" alt="" loading="lazy"
                            onerror="this.src='${thumb(v.id, 'mqdefault')}'"/>`;
      } else {
        const colors = [
          ['#1a2332', '#8fa67a'], ['#201a2e', '#a88fd4'], ['#2a1a1a', '#d48f8f'],
          ['#1a2a1e', '#7aad8e'], ['#2a2418', '#c4a864'], ['#18242a', '#6ca8c4']
        ];
        const [bg, ac] = colors[i % colors.length];
        thumbContent = `<div style="width:100%;height:100%;background:linear-gradient(135deg,${bg},${ac}15);display:flex;align-items:center;justify-content:center;">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="opacity:0.2">
            <rect x="4" y="10" width="40" height="28" rx="4" stroke="${ac}" stroke-width="1.5"/>
            <polygon points="20,18 32,24 20,30" fill="${ac}"/>
          </svg>
        </div>`;
      }

      return `
      <div class="v-card${playing ? ' playing' : ''}"
           data-index="${i}" tabindex="0" role="button">
        <div class="v-thumb">
          ${thumbContent}
          ${badge}
          ${!playing && v.isLive ? '<span class="v-badge-live">● LIVE</span>' : ''}
          ${v.duration ? `<span class="v-badge-dur">${v.duration}</span>` : ''}
          <div class="v-play">
            <div class="v-play-circle">
              <svg viewBox="0 0 24 24"><polygon points="8,5 20,12 8,19"/></svg>
            </div>
          </div>
        </div>
        <div class="v-info">
          <h3 class="v-title">${esc(v.title)}</h3>
          <div class="v-ch-row">${avatar}<span class="v-channel">${esc(v.channel)}</span></div>
          <div class="v-stats">
            ${views ? `<span>${views}</span>` : ''}
            ${v.published ? `<span>${v.published}</span>` : ''}
            ${isFallback ? `<span style="color:var(--clr-accent);">Click to search</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    // Attach events
    DOM.grid.querySelectorAll('.v-card').forEach(card => {
      const handler = () => {
        const idx = parseInt(card.dataset.index);
        const filtered = getFiltered();
        const video = filtered[idx];
        if (!video) return;

        if (video.isFallback) {
          // Open YouTube search for fallback cards
          window.open(video.searchUrl, '_blank');
          return;
        }

        playVideo(video);
      };

      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }

  function getFiltered() {
    if (activeFilter === 'nepali') return allResults.filter(v => v.isNepali);
    if (activeFilter === 'english') return allResults.filter(v => !v.isNepali);
    return allResults;
  }

  // ─────────────────────────────────────────────
  // PLAY VIDEO
  // ─────────────────────────────────────────────
  function playVideo(video) {
    if (!video || !video.id) return;

    if (nowPlayingId && nowPlayingId !== video.id) {
      watchHistory.push(nowPlayingId);
    }

    nowPlayingId = video.id;

    // Embed
    DOM.frame.src = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0`;

    DOM.title.textContent = video.title;
    DOM.ytLink.href = `https://www.youtube.com/watch?v=${video.id}`;

    // Stats
    const views = video.viewsText || (video.views ? formatViews(video.views) + ' views' : '');
    let sh = '';
    if (views) sh += `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${views}</span>`;
    if (video.published) sh += `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${video.published}</span>`;
    if (video.duration) sh += `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="3"/><polyline points="10 8 16 12 10 16"/></svg>${video.duration}</span>`;
    DOM.stats.innerHTML = sh;

    // Channel
    const av = video.channelAvatar
      ? `<img class="watch-ch-avatar" src="${video.channelAvatar}" alt=""
             onclick="CoreVault.searchChannel('${esc(video.channel)}')"
             onerror="this.style.display='none'"/>`
      : `<div class="watch-ch-placeholder"
             onclick="CoreVault.searchChannel('${esc(video.channel)}')">
             ${(video.channel || '?').charAt(0).toUpperCase()}</div>`;

    DOM.chRow.innerHTML = `${av}<div>
      <span class="watch-ch-name" onclick="CoreVault.searchChannel('${esc(video.channel)}')">${esc(video.channel)}</span>
    </div>`;

    // Description
    DOM.desc.textContent = video.description || 'No description available.';
    DOM.desc.classList.remove('expanded');
    DOM.descToggle.textContent = 'Show more';

    // Back button
    if (DOM.backBtn) {
      DOM.backBtn.style.display = watchHistory.length > 0 ? 'flex' : 'none';
    }

    // Show watch mode
    DOM.watch.classList.add('on');
    DOM.watch.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.title = `${video.title} — CoreDeck`;

    renderGrid();
    loadRelatedVideos(video.id);
  }

  // ─────────────────────────────────────────────
  // LOAD RELATED
  // ─────────────────────────────────────────────
  async function loadRelatedVideos(videoId) {
    DOM.related.innerHTML = `
      <div style="text-align:center;padding:2rem 0;">
        <div class="v-spinner"></div>
        <p style="font-size:0.78rem;color:var(--clr-text-muted);margin-top:0.5rem;">Loading related…</p>
      </div>`;

    // Try to get real related videos
    let related = await getRelated(videoId);

    if (related.length === 0) {
      // Fallback: use other search results
      related = allResults.filter(v => v.id !== videoId).slice(0, 15);
    }

    if (related.length === 0) {
      DOM.related.innerHTML = '<p style="font-size:0.78rem;color:var(--clr-text-muted);padding:1rem 0;">No related videos found.</p>';
      return;
    }

    DOM.related.innerHTML = related.slice(0, 20).map((v, idx) => {
      const views = v.viewsText || (v.views ? formatViews(v.views) + ' views' : '');
      return `
      <div class="mini-card" data-rel="${idx}" tabindex="0" role="button">
        <div class="mini-thumb">
          <img src="${v.thumbnail || thumb(v.id, 'mqdefault')}" alt="" loading="lazy"
               onerror="this.src='${thumb(v.id, 'default')}'"/>
          ${v.duration ? `<span class="mini-dur">${v.duration}</span>` : ''}
        </div>
        <div class="mini-info">
          <p class="mini-title">${esc(v.title)}</p>
          <p class="mini-ch">${esc(v.channel)}</p>
          <p class="mini-meta">${views}${views && v.published ? ' · ' : ''}${v.published || ''}</p>
        </div>
      </div>`;
    }).join('');

    // Attach events
    DOM.related.querySelectorAll('.mini-card').forEach(card => {
      const handler = () => {
        const idx = parseInt(card.dataset.rel);
        const video = related[idx];
        if (video) playVideo(video);
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }

  // ─────────────────────────────────────────────
  // CLOSE / BACK
  // ─────────────────────────────────────────────
  function closeWatch() {
    DOM.watch.classList.remove('on');
    DOM.frame.src = '';
    nowPlayingId = '';
    watchHistory = [];
    document.title = 'CoreDeck — Video Vault';
    renderGrid();
  }

  function goBack() {
    if (watchHistory.length === 0) return;
    const prevId = watchHistory.pop();
    const video = allResults.find(v => v.id === prevId);
    if (video) {
      nowPlayingId = '';
      playVideo(video);
    }
  }

  function searchChannel(name) {
    DOM.input.value = name;
    closeWatch();
    search(name);
  }

  // ─────────────────────────────────────────────
  // ERROR / EMPTY
  // ─────────────────────────────────────────────
  function showNoResults() {
    DOM.status.style.display = 'none';
    DOM.grid.innerHTML = '';
    DOM.empty.innerHTML = `
      <div class="v-empty-icon">
        <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="35" cy="35" r="22"/><line x1="51" y1="51" x2="70" y2="70"/>
        </svg>
      </div>
      <h3>No results found</h3>
      <p>Couldn't find videos for "${esc(currentQuery)}". Try different keywords.</p>`;
    DOM.empty.style.display = 'block';
  }

  // ─────────────────────────────────────────────
  // EVENT LISTENERS
  // ─────────────────────────────────────────────

  // Search
  DOM.form.addEventListener('submit', e => {
    e.preventDefault();
    const q = DOM.input.value.trim();
    if (!q) return;
    activeFilter = 'all';
    DOM.filters.forEach(b => b.classList.toggle('on', b.dataset.f === 'all'));
    closeWatch();
    search(q);
  });

  // Tags
  DOM.tags.forEach(tag => {
    tag.addEventListener('click', () => {
      DOM.input.value = tag.dataset.q;
      activeFilter = 'all';
      DOM.filters.forEach(b => b.classList.toggle('on', b.dataset.f === 'all'));
      closeWatch();
      search(tag.dataset.q);
    });
  });

  // Filters
  DOM.filters.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.filters.forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      activeFilter = btn.dataset.f;
      renderGrid();
    });
  });

  // Load more
  DOM.moreBtn.addEventListener('click', () => {
    if (currentQuery && !isLoading) {
      DOM.moreBtn.disabled = true;
      DOM.moreBtn.textContent = 'Loading…';
      search(currentQuery, true);
    }
  });

  // Watch controls
  DOM.closeBtn.addEventListener('click', closeWatch);
  DOM.moreChBtn.addEventListener('click', () => {
    const name = DOM.chRow.querySelector('.watch-ch-name');
    if (name) searchChannel(name.textContent);
  });
  if (DOM.backBtn) DOM.backBtn.addEventListener('click', goBack);

  // Description toggle
  DOM.descToggle.addEventListener('click', () => {
    DOM.desc.classList.toggle('expanded');
    DOM.descToggle.textContent = DOM.desc.classList.contains('expanded') ? 'Show less' : 'Show more';
  });

  // Back to top
  window.addEventListener('scroll', () => {
    DOM.topBtn.classList.toggle('show', window.scrollY > 400);
  });
  DOM.topBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ─────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'Escape':
        if (DOM.watch.classList.contains('on')) closeWatch();
        break;
      case '/':
        e.preventDefault();
        DOM.input.focus();
        DOM.input.select();
        break;
      case 'Backspace':
        if (DOM.watch.classList.contains('on') && watchHistory.length > 0) {
          e.preventDefault();
          goBack();
        }
        break;
    }
  });

  // ─────────────────────────────────────────────
  // DEEP LINK: videos.html?q=topic
  // ─────────────────────────────────────────────
  const urlQ = new URLSearchParams(window.location.search).get('q');
  if (urlQ) {
    DOM.input.value = urlQ;
    search(urlQ);
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────
  window.CoreVault = {
    search,
    searchChannel,
    closeWatch,
    goBack
  };

})();
