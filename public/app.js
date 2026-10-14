/*! Γειτονιές της Αθήνας · SPDX-License-Identifier: EUPL-1.2 */
(function(){
'use strict';
var CFG=Object.assign({tiles:'tiles/athens.pmtiles',glyphs:'glyphs/{fontstack}/{range}.pbf',addresses:'data/addresses.json'},window.ATHENS_CONFIG||{});
var D=window.ATHENS, $=function(id){return document.getElementById(id)};
var K={},S={},G={};
D.k.forEach(function(x){K[x.id]=x});D.s.forEach(function(x){S[x.id]=x});D.g.forEach(function(x){G[x.id]=x});
var BY={k:K,s:S,g:G};
function abs(u){return new URL(u,location.href).href.replace(/%7B/g,'{').replace(/%7D/g,'}')}

/* ---------- χρώματα από τα CSS tokens ---------- */
var C={},T={};
function rgb(str){
  str=str.trim();
  if(str[0]==='#'){var h=str.slice(1);if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  var m=str.match(/[\d.]+/g)||[0,0,0];return [+m[0],+m[1],+m[2]];
}
function mix(a,b,t){return [0,1,2].map(function(i){return Math.round(a[i]*(1-t)+b[i]*t)})}
function readColors(){
  var cs=getComputedStyle(document.documentElement);
  ['bg','land','ink','c-k','c-s','c-g','halo'].forEach(function(n){C[n]=rgb(cs.getPropertyValue('--'+n))});
  ['m-bg','m-road','m-road-major','m-casing','m-green','m-water','m-rail','m-text','m-text-halo','m-mask']
    .forEach(function(n){T[n]=cs.getPropertyValue('--'+n).trim()});
  C.mask=rgb(T['m-mask']);
  C.lvl={k:C['c-k'],s:C['c-s'],g:C['c-g']};
  C.tint={k:mix(C.land,C['c-k'],.35),s:mix(C.land,C['c-s'],.45),g:mix(C.land,C['c-g'],.55)};
}
readColors();

/* ---------- γεωμετρίες ---------- */
var pickData=[];D.g.forEach(function(g){g.f.forEach(function(r){pickData.push({g:g,r:r})})});
var base={k:[],s:[],g:[]};
['k','s','g'].forEach(function(l){D[l].forEach(function(x){x.r.forEach(function(r){base[l].push({x:x,r:r})})})});
var b=[180,90,-180,-90];
D.k.forEach(function(k){k.r.forEach(function(r){r.forEach(function(p){
  b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);})})});
// μάσκα: ό,τι είναι έξω από τον Δήμο σβήνει απαλά
var mask=[[[23.3,37.7],[24.2,37.7],[24.2,38.3],[23.3,38.3],[23.3,37.7]]];
D.k.forEach(function(k){k.r.forEach(function(r){mask.push(r.slice().reverse())})});

/* ---------- υπόβαθρο (MapLibre + PMTiles, όλα από τον δικό μας server) ---------- */
var FONT_R=['Commissioner-Regular'],FONT_B=['Commissioner-SemiBold'];
function width(extra){
  extra=extra||0;
  function v(n){return extra?['+',n,extra]:n}
  return ['interpolate',['exponential',1.6],['zoom'],
    11,v(['match',['get','class'],['motorway','trunk'],1.4,['primary'],1,['secondary'],.7,.4]),
    14,v(['match',['get','class'],['motorway','trunk'],5,['primary','primary_link'],4,['secondary','secondary_link'],3.2,['tertiary','tertiary_link'],2.6,1.6]),
    17,v(['match',['get','class'],['motorway','trunk'],16,['primary','primary_link'],14,['secondary','secondary_link'],12,['tertiary','tertiary_link'],10,7])];
}
var MAJOR=['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link'];
function mapStyle(){
  return {
    version:8,glyphs:abs(CFG.glyphs),
    sources:{osm:{type:'vector',url:'pmtiles://athens',attribution:''}},
    layers:[
      {id:'bg',type:'background',paint:{'background-color':T['m-bg']}},
      {id:'green',type:'fill',source:'osm','source-layer':'green',paint:{'fill-color':T['m-green']}},
      {id:'water',type:'fill',source:'osm','source-layer':'water',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':T['m-water']}},
      {id:'waterway',type:'line',source:'osm','source-layer':'water',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':T['m-water'],'line-width':1.5}},
      {id:'rail-tunnel',type:'line',source:'osm','source-layer':'rail',filter:['==',['get','tunnel'],true],minzoom:12,
        paint:{'line-color':T['m-rail'],'line-width':['interpolate',['linear'],['zoom'],12,.8,16,1.6],'line-dasharray':[3,3],'line-opacity':.7}},
      {id:'road-casing',type:'line',source:'osm','source-layer':'roads',filter:['match',['get','class'],MAJOR,true,false],
        layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':T['m-casing'],'line-width':width(1.6)}},
      {id:'road',type:'line',source:'osm','source-layer':'roads',layout:{'line-join':'round','line-cap':'round'},
        paint:{'line-color':['match',['get','class'],MAJOR,T['m-road-major'],T['m-road']],'line-width':width()}},
      {id:'rail',type:'line',source:'osm','source-layer':'rail',filter:['!=',['get','tunnel'],true],
        paint:{'line-color':T['m-rail'],'line-width':['interpolate',['linear'],['zoom'],11,.8,16,2]}},
      {id:'road-label',type:'symbol',source:'osm','source-layer':'roads',minzoom:14,
        filter:['all',['has','name'],['match',['get','class'],MAJOR.concat(['tertiary','tertiary_link']),true,['>=',['zoom'],15.2]]],
        layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':FONT_R,'text-size':['interpolate',['linear'],['zoom'],14,10.5,17,13],
          'text-max-angle':30,'symbol-spacing':260,'text-padding':4},
        paint:{'text-color':T['m-text'],'text-halo-color':T['m-text-halo'],'text-halo-width':1.4}},
      {id:'square-label',type:'symbol',source:'osm','source-layer':'labels',minzoom:15,filter:['all',['==',['get','class'],'square'],['has','name']],
        layout:{'text-field':['get','name'],'text-font':FONT_R,'text-size':11.5,'text-max-width':8,'text-padding':6},
        paint:{'text-color':T['m-text'],'text-halo-color':T['m-text-halo'],'text-halo-width':1.4}},
      {id:'park-label',type:'symbol',source:'osm','source-layer':'labels',minzoom:14,filter:['all',['match',['get','class'],['park','peak'],true,false],['has','name']],
        layout:{'text-field':['get','name'],'text-font':FONT_R,'text-size':11.5,'text-max-width':8,'text-padding':6},
        paint:{'text-color':T['m-text'],'text-halo-color':T['m-text-halo'],'text-halo-width':1.4}},
      {id:'station',type:'circle',source:'osm','source-layer':'labels',minzoom:13,filter:['all',['==',['get','class'],'station'],['match',['get','kind'],['subway','light_rail','station'],true,false]],
        paint:{'circle-radius':['interpolate',['linear'],['zoom'],13,2.5,16,4.5],'circle-color':T['m-text-halo'],'circle-stroke-color':T['m-text'],'circle-stroke-width':1.6}},
      {id:'station-label',type:'symbol',source:'osm','source-layer':'labels',minzoom:14,filter:['all',['==',['get','class'],'station'],['match',['get','kind'],['subway','light_rail','station'],true,false],['has','name']],
        layout:{'text-field':['get','name'],'text-font':FONT_B,'text-size':11.5,'text-offset':[0,1.1],'text-anchor':'top','text-max-width':8,'text-padding':4},
        paint:{'text-color':T['m-text'],'text-halo-color':T['m-text-halo'],'text-halo-width':1.6}}
    ]
  };
}

/* PMTiles: πρώτα με range requests· αν ο server δεν τα υποστηρίζει, φορτώνεται ολόκληρο το αρχείο (~3 MB). */
var protocol=new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles',protocol.tile);
function BufferSource(url){this.url=url;this.p=null}
BufferSource.prototype.getKey=function(){return 'athens'};
BufferSource.prototype.getBytes=function(offset,length){
  if(!this.p)this.p=CFG.tilesBuffer?Promise.resolve(CFG.tilesBuffer):fetch(this.url).then(function(r){if(!r.ok)throw new Error(r.status);return r.arrayBuffer()});
  return this.p.then(function(buf){return {data:buf.slice(offset,offset+length)}});
};
function RangeSource(url){this.inner=new pmtiles.FetchSource(url)}
RangeSource.prototype.getKey=function(){return 'athens'};
RangeSource.prototype.getBytes=function(o,l,s,e){return this.inner.getBytes(o,l,s,e)};
var tilesReady=(function(){
  var url=abs(CFG.tiles);
  if(CFG.tilesBuffer){var bp=new pmtiles.PMTiles(new BufferSource(url));protocol.add(bp);return Promise.resolve(bp);}
  var p=new pmtiles.PMTiles(new RangeSource(url));
  return p.getHeader().then(function(){return p}).catch(function(){return new pmtiles.PMTiles(new BufferSource(url))})
    .then(function(p){protocol.add(p);return p});
})();

/* ---------- κάμερα ---------- */
var mobile=matchMedia('(max-width:640px)').matches;
var PAD=mobile?{top:90,bottom:Math.min(400,innerHeight*0.5),left:16,right:16}:{top:60,bottom:60,left:Math.min(400,innerWidth*0.35),right:60};
var PITCH=42,BEARING=-12;
var map=new maplibregl.Map({
  container:'map',style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':T['m-bg']}}]},
  bounds:[[b[0],b[1]],[b[2],b[3]]],fitBoundsOptions:{padding:PAD},pitch:PITCH,bearing:BEARING,
  maxPitch:65,minZoom:11,maxZoom:18.5,maxBounds:[[23.5,37.85],[23.97,38.13]],attributionControl:false,
  dragRotate:true,pitchWithRotate:true,touchPitch:true,cooperativeGestures:false
});
var HOME=null,Z0=13,is3d=true;
map.once('load',function(){
  var cam=map.cameraForBounds([[b[0],b[1]],[b[2],b[3]]],{padding:PAD,pitch:PITCH,bearing:BEARING});
  HOME={center:cam.center,zoom:cam.zoom,pitch:PITCH,bearing:BEARING};Z0=cam.zoom;
  map.jumpTo(HOME);
  tilesReady.then(function(){map.setStyle(mapStyle())});
});
map.on('move',function(){if(Object.keys(anims).length||me)render()});

/* ---------- ανασήκωμα ---------- */
var H={k:80,s:160,g:240}, STEP=150;
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var anims={}, active={k:null,s:null,g:null}, locked=false, raf=0, last=0, me=null, pinMode=false;
function anim(id){return anims[id]||(anims[id]={id:id,l:id[0],h:0,target:0,start:0})}
function setChain(gid){
  var g=gid?G[gid]:null, next={k:g?g.k:null,s:g?g.s:null,g:g?g.id:null};
  var now=performance.now(), delay=0;
  ['k','s','g'].forEach(function(l){
    if(next[l]===active[l])return;
    if(active[l]){var o=anim(active[l]);o.target=0;o.start=now;}
    if(next[l]){var a=anim(next[l]);a.target=H[l];a.start=now+delay;}
    delay+=STEP;
  });
  active=next;panel();kick();
}
function kick(){if(!raf){last=performance.now();raf=requestAnimationFrame(tick)}}
function tick(t){
  var dt=Math.min(.05,(t-last)/1000);last=t;var busy=false;
  Object.keys(anims).forEach(function(id){
    var a=anims[id];
    if(t<a.start){busy=true;return;}
    if(reduce)a.h=a.target;else a.h+=(a.target-a.h)*(1-Math.exp(-dt*9));
    if(Math.abs(a.target-a.h)<.4)a.h=a.target;else busy=true;
    if(a.h===0&&a.target===0)delete anims[id];
  });
  render();raf=busy?requestAnimationFrame(tick):0;
}
function scale(){return is3d?Math.max(.12,Math.min(2.2,Math.pow(2,Z0-map.getZoom()))):0}

/* ---------- επίπεδα deck.gl ---------- */
var dashExt=new deck.PathStyleExtension({dash:true});
var DASH=[5,3.5], SOLID=[0,0];
function onChain(l,x){return !active.g||active[l]===x.id}
function baseLayer(l,w){
  return new deck.PathLayer({
    id:'base-'+l,data:base[l],getPath:function(d){return d.r},widthUnits:'pixels',getWidth:w,
    getColor:function(d){var c=C.lvl[l];return c.concat(onChain(l,d.x)?255:active.g?110:225)},
    getDashArray:function(d){return d.x.pl?DASH:SOLID},dashJustified:true,extensions:[dashExt],
    jointRounded:true,capRounded:true,parameters:{depthTest:false},
    updateTriggers:{getColor:[active.k,active.s,active.g,C.lvl[l]]}
  });
}
function lifted(){
  var items=[],f=scale();
  Object.keys(anims).forEach(function(id){var a=anims[id];if(a.h<=0)return;
    var z=f?a.h*f:(a.h/H[a.l])*(1+'ksg'.indexOf(a.l))*1.5;
    BY[a.l][id].r.forEach(function(r){items.push({a:a,x:BY[a.l][id],r:r,z:z})})});
  items.sort(function(p,q){return 'ksg'.indexOf(p.a.l)-'ksg'.indexOf(q.a.l)});
  return items;
}
function pinLayers(items){
  if(!me)return [];
  var z=0;items.forEach(function(d){if(d.a.id===active.g||d.a.id===active.s||d.a.id===active.k)z=Math.max(z,d.z)});
  var top=[me.lon,me.lat,z+(is3d?60*scale():2)];
  return [
    new deck.LineLayer({id:'pin-stem',data:[me],getSourcePosition:function(){return [me.lon,me.lat,0]},getTargetPosition:function(){return top},
      getColor:C.ink,getWidth:2,widthUnits:'pixels',updateTriggers:{getTargetPosition:top.join(),getColor:C.ink}}),
    new deck.ScatterplotLayer({id:'pin-foot',data:[me],getPosition:function(){return [me.lon,me.lat,0]},radiusUnits:'pixels',getRadius:4,
      getFillColor:C.ink.concat(130),updateTriggers:{getFillColor:C.ink}}),
    new deck.ScatterplotLayer({id:'pin-head',data:[me],getPosition:function(){return top},radiusUnits:'pixels',getRadius:8,
      stroked:true,getLineColor:C.land,lineWidthUnits:'pixels',getLineWidth:3,getFillColor:C.ink,parameters:{depthTest:false},
      updateTriggers:{getPosition:top.join(),getFillColor:C.ink,getLineColor:C.land}})
  ];
}
function layers(){
  var items=lifted();
  return [
    new deck.SolidPolygonLayer({id:'mask',data:[{p:mask}],getPolygon:function(d){return d.p},getFillColor:C.mask.concat(150),
      updateTriggers:{getFillColor:C.mask}}),
    new deck.SolidPolygonLayer({id:'ground',data:pickData,getPolygon:function(d){return d.r},
      getFillColor:function(d){return C['c-g'].concat(d.g.id===active.g?28:1)},pickable:true,
      updateTriggers:{getFillColor:[active.g,C['c-g']]}}),
    new deck.PathLayer({id:'halo-g',data:base.g,getPath:function(d){return d.r},widthUnits:'pixels',getWidth:3.4,
      getColor:C.halo.concat(active.g?50:95),parameters:{depthTest:false},updateTriggers:{getColor:[C.halo,!!active.g]}}),
    baseLayer('g',1.7),baseLayer('s',2.2),baseLayer('k',3),
    new deck.TextLayer({id:'k-labels',data:D.k,getPosition:function(d){return d.c},getText:function(d){return d.n.split(' ')[0]},
      getSize:13,getColor:C['c-k'].concat(active.g?90:220),fontFamily:'Commissioner, system-ui, sans-serif',fontWeight:600,characterSet:'auto',
      outlineWidth:3,outlineColor:C.land.concat(230),fontSettings:{sdf:true},
      getTextAnchor:'middle',getAlignmentBaseline:'center',parameters:{depthTest:false},updateTriggers:{getColor:[C['c-k'],!!active.g]}}),
    new deck.SolidPolygonLayer({id:'lift',data:items,extruded:true,getPolygon:function(d){return d.r},
      getElevation:function(d){return d.z},getFillColor:function(d){return C.tint[d.a.l].concat(d.a.l==='g'?140:115)},
      material:{ambient:.6,diffuse:.5,shininess:8,specularColor:[30,30,30]},
      updateTriggers:{getElevation:items.map(function(d){return d.z}).join(),getFillColor:C.tint}}),
    new deck.PathLayer({id:'lift-edge',data:items,getPath:function(d){return d.r.map(function(p){return [p[0],p[1],d.z+0.5]})},
      widthUnits:'pixels',getWidth:function(d){return {k:3,s:2.6,g:2.6}[d.a.l]},getColor:function(d){return C.lvl[d.a.l]},
      getDashArray:function(d){return d.x.pl?DASH:SOLID},dashJustified:true,extensions:[dashExt],jointRounded:true,
      updateTriggers:{getPath:items.map(function(d){return d.z}).join(),getColor:C.lvl}})
  ].concat(pinLayers(items));
}
var overlay=new deck.MapboxOverlay({
  interleaved:false,layers:layers(),
  onHover:function(info){
    map.getCanvas().style.cursor=pinMode?'crosshair':info.object?'pointer':'';
    if(locked)return;var id=info.object?info.object.g.id:null;if(id!==active.g)setChain(id);
  },
  onClick:function(info){
    if(pinMode&&info.coordinate){setPinMode(false);place(info.coordinate[0],info.coordinate[1],'Το σημείο που επιλέξατε');return;}
    var id=info.object?info.object.g.id:null;
    if(!id){locked=false;setChain(null);}
    else if(locked&&id===active.g){locked=false;}
    else{locked=true;setChain(id);}
    panel();
  }
});
map.addControl(overlay);
function render(){overlay.setProps({layers:layers()})}

/* ---------- κάρτα ---------- */
var nf=new Intl.NumberFormat('el-GR',{maximumFractionDigits:2});
function row(l,x){
  var nm=$('n'+l),mt=$('m'+l),sw=$('sw'+l);
  nm.textContent=x?x.n:'—';nm.classList.toggle('empty',!x);
  sw.classList.toggle('dash',!!(x&&x.pl));
  mt.innerHTML=x?((x.pl?'<span class="chip">Χώρος</span>':'')+'<span>'+nf.format(x.a)+' km²</span>'):'';
}
function panel(){
  row('k',active.k&&K[active.k]);row('s',active.s&&S[active.s]);row('g',active.g&&G[active.g]);
  $('hint').innerHTML=locked?'<b>Η επιλογή κλειδώθηκε.</b> Πατήστε ξανά στον χάρτη ή Esc για να συνεχίσετε την εξερεύνηση.'
    :'Περάστε τον δείκτη πάνω από τον χάρτη. Σε κινητό, πατήστε ένα σημείο.';
}

/* ---------- επιλογή γειτονιάς ---------- */
var opts={},dl=$('places');
D.g.slice().sort(function(a,b){return a.n.localeCompare(b.n,'el')}).forEach(function(g){
  var label=g.n+' · '+S[g.s].n;opts[label]=g.id;var o=document.createElement('option');o.value=label;dl.appendChild(o);
});
function centerOf(g){var r=g.f[0],x=0,y=0;r.forEach(function(p){x+=p[0];y+=p[1]});return [x/r.length,y/r.length]}
$('find').addEventListener('input',function(e){var id=opts[e.target.value];if(id){locked=true;setChain(id);e.target.blur();
  var c=centerOf(G[id]);go({center:c,zoom:Math.max(map.getZoom(),Z0+1.2)});}});
addEventListener('keydown',function(e){if(e.key==='Escape'){if(pinMode){setPinMode(false);return;}clearPin();locked=false;$('find').value='';setChain(null);}});

/* ---------- διεύθυνση / τοποθεσία ---------- */
var geocoder=null,geoLoading=null,searching=false;
function loadGeocoder(){
  if(geocoder)return Promise.resolve(geocoder);
  if(!geoLoading)geoLoading=fetch(abs(CFG.addresses)).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
    .then(function(ix){geocoder=new AthensGeocoder.Geocoder(ix);return geocoder})
    .catch(function(e){geoLoading=null;throw e});
  return geoLoading;
}
$('addr').addEventListener('focus',function(){loadGeocoder().catch(function(){})},{once:true});
function inRing(x,y,r){var c=false;for(var i=0,j=r.length-1;i<r.length;j=i++){var a=r[i],q=r[j];
  if(((a[1]>y)!==(q[1]>y))&&(x<(q[0]-a[0])*(y-a[1])/(q[1]-a[1])+a[0]))c=!c;}return c}
function locate(x,y){for(var i=0;i<D.g.length;i++){var g=D.g[i];for(var k=0;k<g.f.length;k++)if(inRing(x,y,g.f[k]))return g;}return null}
function msg(html,kind){var m=$('msg');m.innerHTML=html||'';m.dataset.kind=kind||'';m.hidden=!html}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
var APPROX={interpolated:'Ο ακριβής αριθμός δεν υπάρχει στο OpenStreetMap· η θέση εκτιμήθηκε από τους γειτονικούς αριθμούς.',
  nearest:'Ο ακριβής αριθμός δεν υπάρχει στο OpenStreetMap· η πινέζα είναι στον πλησιέστερο γνωστό αριθμό.',
  street:'Ο αριθμός δεν υπάρχει στο OpenStreetMap· η πινέζα είναι στο μέσο της οδού.',
  'street-only':'Δεν δώσατε αριθμό· η πινέζα είναι στο μέσο της οδού.'};
function place(lon,lat,label,how){
  var g=locate(lon,lat);me={lon:lon,lat:lat,label:label};$('results').hidden=true;$('bclear').hidden=false;
  var approx=how&&how!=='exact'&&APPROX[how];
  if(!g){locked=false;setChain(null);msg('<b>'+esc(label)+'</b> βρίσκεται εκτός των ορίων του Δήμου Αθηναίων.','warn');}
  else{locked=true;setChain(g.id);
    msg('<b>'+esc(label)+'</b> ανήκει στη γειτονιά <b>'+esc(g.n)+'</b>, στη συνοικία <b>'+esc(S[g.s].n)+'</b> της <b>'+esc(K[g.k].n.replace('η Δημοτική Κοινότητα','ης Δημοτικής Κοινότητας'))+'</b>.'
      +(g.pl?' Το σημείο είναι σε χώρο και όχι σε κατοικημένη γειτονιά.':'')
      +(approx?'<br><b>Προσοχή:</b> '+approx+' Αν δεν είναι σωστή, πατήστε <b>Σημείωση στον χάρτη</b>.':''),approx?'warn':'ok');}
  go({center:[lon,lat],zoom:Math.max(map.getZoom(),Z0+2.2)});
  render();
}
function clearPin(){me=null;$('bclear').hidden=true;msg('');$('results').hidden=true;render()}
function setPinMode(on){pinMode=on;$('bpin').setAttribute('aria-pressed',String(on));
  map.getCanvas().style.cursor=on?'crosshair':'';
  if(on){msg('Πατήστε στον χάρτη το σημείο όπου μένετε. Esc για ακύρωση.','info');}else if($('msg').dataset.kind==='info')msg('');}
$('bpin').addEventListener('click',function(){setPinMode(!pinMode)});
$('bclear').addEventListener('click',function(){clearPin();locked=false;setChain(null);$('addr').value=''});
$('faddr').addEventListener('submit',function(e){
  e.preventDefault();var q=$('addr').value.trim();if(q.length<3){msg('Γράψτε οδό και αριθμό, π.χ. Πατησίων 76.','warn');return;}
  if(searching)return;searching=true;setPinMode(false);
  if(!geocoder)msg('Φόρτωση οδών…','info');
  loadGeocoder().then(function(gc){
    searching=false;
    var res=gc.search(q,5),list=res.results,ul=$('results');ul.innerHTML='';
    if(!list.length){msg('Δεν βρέθηκε η οδός μέσα στον Δήμο Αθηναίων. Δοκιμάστε άλλη γραφή (π.χ. «Πατησίων 76» ή «Patision 76») ή πατήστε <b>Σημείωση στον χάρτη</b>.','warn');return;}
    if(list.length===1){var r=list[0];place(r.lon,r.lat,r.label,r.how);return;}
    msg('Βρέθηκαν '+list.length+' αποτελέσματα. Διαλέξτε το σωστό:','info');
    list.forEach(function(it){var li=document.createElement('li'),bt=document.createElement('button');bt.type='button';
      var t=document.createElement('span');t.textContent=it.label;var a=document.createElement('small');a.textContent=it.area||'';
      bt.appendChild(t);bt.appendChild(a);
      bt.addEventListener('click',function(){place(it.lon,it.lat,it.label,it.how)});li.appendChild(bt);ul.appendChild(li);});
    ul.hidden=false;
  }).catch(function(){searching=false;msg('Οι οδοί δεν φορτώθηκαν. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά, ή πατήστε <b>Σημείωση στον χάρτη</b>.','warn')});
});
$('bgeo').addEventListener('click',function(){
  setPinMode(false);
  if(!navigator.geolocation){msg('Ο browser σας δεν υποστηρίζει εντοπισμό θέσης.','warn');return;}
  msg('Εντοπισμός θέσης…','info');
  navigator.geolocation.getCurrentPosition(function(p){place(p.coords.longitude,p.coords.latitude,'Η τοποθεσία σας')},
    function(err){msg(err&&err.code===1?'Δεν δόθηκε άδεια πρόσβασης στη θέση σας. Μπορείτε να γράψετε τη διεύθυνση ή να πατήσετε <b>Σημείωση στον χάρτη</b>.'
      :'Η θέση σας δεν βρέθηκε. Δοκιμάστε ξανά ή γράψτε τη διεύθυνση.','warn')},
    {enableHighAccuracy:true,timeout:10000});
});

/* ---------- κουμπιά ---------- */
function go(v){
  var o=Object.assign({pitch:is3d?PITCH:0,bearing:is3d?map.getBearing():0},v);
  if(reduce)map.jumpTo(o);else map.flyTo(Object.assign(o,{duration:900,essential:true}));
}
$('b3d').addEventListener('click',function(){
  is3d=!is3d;this.setAttribute('aria-pressed',String(is3d));
  go({center:map.getCenter(),zoom:map.getZoom(),pitch:is3d?PITCH:0,bearing:is3d?BEARING:0});render();
});
$('bhome').addEventListener('click',function(){is3d=true;$('b3d').setAttribute('aria-pressed','true');if(HOME)go(HOME)});

/* ---------- αλλαγή θέματος ---------- */
function retheme(){readColors();if(map.getSource('osm'))map.setStyle(mapStyle());render()}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',retheme);
new MutationObserver(retheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(render);
panel();
window.__athens={map:map,setChain:setChain,place:place,search:function(q){return loadGeocoder().then(function(g){return g.search(q)})}};
})();
