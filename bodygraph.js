// Designed to Thrive - Bodygraph renderer.
// Draws the standard Human Design body diagram as SVG from chart data:
//   { defined_centers:[...], active_gates:[...], active_channels:[[g,g],...] }
// Colors come from the site's CSS palette. Defined centers fill; defined
// channels (both gates active) color in; active gates get a filled dot.
//
// Geometry note: the bodygraph layout is standardized. Center positions and
// the gate points on each center edge are fixed. Coordinates below are on a
// 520 x 760 canvas, tuned to the conventional arrangement.

(function (global) {
  'use strict';

  // ---- palette (matches style.css) ----
  const COL = {
    warmWhite: '#FAF6F0',
    charcoal: '#2C2824',
    gold: '#B08D4F',
    goldDeep: '#94733B',
    rule: '#D8C9B4',
    ink: '#5A534A',
    // center fills by awareness family (kept on-brand, not rainbow)
    definedFill: '#2C2824',
    definedStroke: '#2C2824',
    openFill: 'none',
    openStroke: '#D8C9B4',
  };

  // ---- center definitions ----
  // shape: 'triangle-up','triangle-down','diamond','square'
  // Each center has a polygon (points) and a label. Coordinates on 520x760.
  const CENTERS = {
    Head:        { shape:'tri-down', cx:260, cy:60,  pts:'260,30 232,82 288,82' },
    Ajna:        { shape:'tri-up',   cx:260, cy:130, pts:'232,108 288,108 260,160' },
    Throat:      { shape:'square',   cx:260, cy:225, pts:'222,193 298,193 298,258 222,258' },
    G:           { shape:'diamond',  cx:260, cy:340, pts:'260,300 308,348 260,396 212,348' },
    Heart:       { shape:'tri-left', cx:352, cy:368, pts:'330,348 384,368 330,392' },
    'Solar Plexus':{ shape:'square', cx:404, cy:470, pts:'372,440 436,440 436,510 372,510' },
    Sacral:      { shape:'square',   cx:260, cy:470, pts:'222,440 298,440 298,510 222,510' },
    Spleen:      { shape:'square',   cx:116, cy:470, pts:'84,440 148,440 148,510 84,510' },
    Root:        { shape:'square',   cx:260, cy:590, pts:'222,560 298,560 298,628 222,628' },
  };

  // ---- gate points ----
  // Position (x,y) where each gate's dot sits, on its center's edge.
  // Only the gates that participate in channels need precise points; others
  // sit inside their center. This map covers all 64 gates at their conventional
  // spots around each center.
  const GATE_PT = {
    // Head (bottom edge -> Ajna)
    64:[244,80], 61:[260,80], 63:[276,80],
    // Ajna (top -> Head ; bottom -> Throat)
    47:[244,112], 24:[260,112], 4:[276,112],
    17:[244,156], 11:[260,156], 43:[276,156],
    // Throat
    62:[236,200], 23:[252,200], 56:[268,200], 35:[286,200],
    16:[228,218], 20:[244,218], 31:[276,218], 8:[260,236], 33:[290,236],
    12:[290,218], 45:[290,250],
    // G
    7:[236,330], 1:[260,308], 13:[284,330], 10:[224,348],
    25:[296,348], 15:[236,366], 2:[260,388], 46:[284,366],
    // Heart
    21:[352,352], 51:[352,360], 26:[352,376], 40:[376,384],
    // Solar Plexus
    36:[404,448], 22:[420,452], 37:[388,456], 6:[372,476],
    49:[388,500], 55:[404,504], 30:[420,500], 39:[436,476],
    // Sacral
    5:[244,448], 14:[260,448], 29:[276,448], 59:[244,504],
    9:[260,504], 3:[276,504], 42:[228,470], 27:[292,470], 34:[228,490],
    // Spleen
    48:[116,448], 57:[100,452], 44:[132,452], 50:[116,504],
    32:[100,500], 28:[132,500], 18:[116,470],
    // Root
    53:[236,568], 60:[260,568], 52:[284,568], 19:[228,588],
    54:[228,610], 38:[236,628], 58:[260,628], 41:[284,628], 39:[292,588],
  };

  // Which center each gate belongs to (for the fallback dot if no precise point).
  const GATE_CENTER = {
    64:'Head',61:'Head',63:'Head',
    47:'Ajna',24:'Ajna',4:'Ajna',17:'Ajna',11:'Ajna',43:'Ajna',
    62:'Throat',23:'Throat',56:'Throat',35:'Throat',16:'Throat',20:'Throat',31:'Throat',8:'Throat',33:'Throat',12:'Throat',45:'Throat',
    7:'G',1:'G',13:'G',10:'G',25:'G',15:'G',2:'G',46:'G',
    21:'Heart',51:'Heart',26:'Heart',40:'Heart',
    36:'Solar Plexus',22:'Solar Plexus',37:'Solar Plexus',6:'Solar Plexus',49:'Solar Plexus',55:'Solar Plexus',30:'Solar Plexus',39:'Solar Plexus',
    5:'Sacral',14:'Sacral',29:'Sacral',59:'Sacral',9:'Sacral',3:'Sacral',42:'Sacral',27:'Sacral',34:'Sacral',
    48:'Spleen',57:'Spleen',44:'Spleen',50:'Spleen',32:'Spleen',28:'Spleen',18:'Spleen',
    53:'Root',60:'Root',52:'Root',19:'Root',54:'Root',38:'Root',58:'Root',41:'Root',
  };

  // 36 channels as gate pairs (matches the API).
  const CHANNELS = [
    [1,8],[2,14],[3,60],[4,63],[5,15],[6,59],[7,31],[9,52],[10,20],[10,34],
    [10,57],[11,56],[12,22],[13,33],[16,48],[17,62],[18,58],[19,49],[20,34],
    [20,57],[21,45],[23,43],[24,61],[25,51],[26,44],[27,50],[28,38],[29,46],
    [30,41],[32,54],[34,57],[35,36],[37,40],[39,55],[42,53],[47,64],
  ];

  function el(tag, attrs, children){
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (children) (Array.isArray(children)?children:[children]).forEach(c=> e.appendChild(c));
    return e;
  }

  function render(chart, opts){
    opts = opts || {};
    const W = 520, H = 760;
    const defined = new Set(chart.defined_centers || []);
    const activeGates = new Set(chart.active_gates || []);
    const activeChannels = (chart.active_channels || []).map(p=>p.slice().sort((a,b)=>a-b).join('-'));
    const activeSet = new Set(activeChannels);

    const svg = el('svg', {
      viewBox:`0 0 ${W} ${H}`, width:'100%', xmlns:'http://www.w3.org/2000/svg',
      'font-family':'Inter, system-ui, sans-serif', role:'img',
      'aria-label':'Human Design bodygraph'
    });

    // ---- channels first (under centers) ----
    const chLayer = el('g', {});
    CHANNELS.forEach(([a,b])=>{
      const pa = GATE_PT[a], pb = GATE_PT[b];
      if (!pa || !pb) return;
      const key = [a,b].slice().sort((x,y)=>x-y).join('-');
      const on = activeSet.has(key);
      // a channel half is "hanging" (gate active but channel not complete) -> subtle
      const aOn = activeGates.has(a), bOn = activeGates.has(b);
      const color = on ? COL.gold : COL.rule;
      const wdt = on ? 6 : 2;
      const opacity = on ? 1 : 0.5;
      chLayer.appendChild(el('line',{
        x1:pa[0],y1:pa[1],x2:pb[0],y2:pb[1],
        stroke:color,'stroke-width':wdt,'stroke-linecap':'round',opacity
      }));
    });
    svg.appendChild(chLayer);

    // ---- centers ----
    const cLayer = el('g', {});
    Object.keys(CENTERS).forEach(name=>{
      const c = CENTERS[name];
      const isDef = defined.has(name);
      cLayer.appendChild(el('polygon',{
        points:c.pts,
        fill: isDef ? COL.definedFill : 'none',
        stroke: isDef ? COL.definedStroke : COL.rule,
        'stroke-width': isDef ? 2 : 1.5,
      }));
    });
    svg.appendChild(cLayer);

    // ---- active gate dots + numbers ----
    const gLayer = el('g', {});
    Object.keys(GATE_PT).forEach(gStr=>{
      const g = parseInt(gStr,10);
      const [x,y] = GATE_PT[g];
      const on = activeGates.has(g);
      if (on){
        gLayer.appendChild(el('circle',{cx:x,cy:y,r:7,fill:COL.gold,stroke:COL.charcoal,'stroke-width':1}));
        const t = el('text',{x:x,y:y+3,'text-anchor':'middle','font-size':8,'font-weight':600,fill:COL.charcoal});
        t.textContent = g; gLayer.appendChild(t);
      }
    });
    svg.appendChild(gLayer);

    return svg;
  }

  global.Bodygraph = { render };
})(window);
