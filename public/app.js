/*! Γειτονιές της Αθήνας · SPDX-License-Identifier: EUPL-1.2 */
(function(){
'use strict';
var D=window.ATHENS, $=function(id){return document.getElementById(id)};
var K={},S={},G={};
D.k.forEach(function(x){K[x.id]=x});D.s.forEach(function(x){S[x.id]=x});D.g.forEach(function(x){G[x.id]=x});
var BY={k:K,s:S,g:G};

/* ---------- theme colours from CSS tokens ---------- */
var C={};
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
  C.lvl={k:C['c-k'],s:C['c-s'],g:C['c-g']};
  C.tint={k:mix(C.land,C['c-k'],.35),s:mix(C.land,C['c-s'],.45),g:mix(C.land,C['c-g'],.55)};
}
readColors();

/* ---------- geometry helpers ---------- */
var pickData=[];D.g.forEach(function(g){g.f.forEach(function(r){pickData.push({g:g,r:r})})});
var base={k:[],s:[],g:[]};
['k','s','g'].forEach(function(l){D[l].forEach(function(x){x.r.forEach(function(r){base[l].push({x:x,r:r})})})});
var b=[180,90,-180,-90];
D.k.forEach(function(k){k.r.forEach(function(r){r.forEach(function(p){
  b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);})})});

/* ---------- view ---------- */
var mobile=matchMedia('(max-width:640px)').matches;
var fit=new deck.WebMercatorViewport({width:innerWidth,height:innerHeight}).fitBounds([[b[0],b[1]],[b[2],b[3]]],
  {padding:mobile?{top:60,bottom:230,left:16,right:16}:{top:60,bottom:60,left:Math.min(400,innerWidth*0.35),right:60}});
var PITCH=42;
var HOME={longitude:fit.longitude,latitude:fit.latitude,zoom:fit.zoom,pitch:PITCH,bearing:-12,maxPitch:65,minZoom:11};
var Z0=HOME.zoom, view=Object.assign({},HOME), is3d=true;

/* ---------- lift animation ---------- */
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
function scale(){return is3d?Math.max(.12,Math.min(2.2,Math.pow(2,Z0-view.zoom))):0}

/* ---------- layers ---------- */
var dashExt=new deck.PathStyleExtension({dash:true});
var DASH=[5,3.5], SOLID=[0,0];
function onChain(l,x){return !active.g||active[l]===x.id}
function baseLayer(l,w){
  return new deck.PathLayer({
    id:'base-'+l,data:base[l],getPath:function(d){return d.r},widthUnits:'pixels',getWidth:w,
    getColor:function(d){var c=C.lvl[l];return c.concat(onChain(l,d.x)?255:active.g?120:235)},
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
      getFillColor:C.ink.concat(110),updateTriggers:{getFillColor:C.ink}}),
    new deck.ScatterplotLayer({id:'pin-head',data:[me],getPosition:function(){return top},radiusUnits:'pixels',getRadius:8,
      stroked:true,getLineColor:C.land,lineWidthUnits:'pixels',getLineWidth:3,getFillColor:C.ink,parameters:{depthTest:false},
      updateTriggers:{getPosition:top.join(),getFillColor:C.ink,getLineColor:C.land}})
  ];
}
function layers(){
  var items=lifted();
  return [
    new deck.SolidPolygonLayer({id:'ground',data:pickData,getPolygon:function(d){return d.r},
      getFillColor:C.land,pickable:true,updateTriggers:{getFillColor:C.land}}),
    new deck.PathLayer({id:'halo-g',data:base.g,getPath:function(d){return d.r},widthUnits:'pixels',getWidth:3,
      getColor:C.halo.concat(active.g?60:110),parameters:{depthTest:false},updateTriggers:{getColor:[C.halo,!!active.g]}}),
    baseLayer('g',1.6),baseLayer('s',2),baseLayer('k',2.8),
    new deck.TextLayer({id:'k-labels',data:D.k,getPosition:function(d){return d.c},getText:function(d){return d.n.split(' ')[0]},
      getSize:13,getColor:C['c-k'].concat(200),fontFamily:'Commissioner, system-ui, sans-serif',fontWeight:600,characterSet:'auto',
      getTextAnchor:'middle',getAlignmentBaseline:'center',parameters:{depthTest:false},updateTriggers:{getColor:C['c-k']}}),
    new deck.SolidPolygonLayer({id:'lift',data:items,extruded:true,getPolygon:function(d){return d.r},
      getElevation:function(d){return d.z},getFillColor:function(d){return C.tint[d.a.l].concat(245)},
      material:{ambient:.55,diffuse:.55,shininess:8,specularColor:[40,40,40]},
      updateTriggers:{getElevation:items.map(function(d){return d.z}).join(),getFillColor:C.tint}}),
    new deck.PathLayer({id:'lift-edge',data:items,getPath:function(d){return d.r.map(function(p){return [p[0],p[1],d.z+0.5]})},
      widthUnits:'pixels',getWidth:function(d){return {k:3,s:2.6,g:2.4}[d.a.l]},getColor:function(d){return C.lvl[d.a.l]},
      getDashArray:function(d){return d.x.pl?DASH:SOLID},dashJustified:true,extensions:[dashExt],jointRounded:true,
      updateTriggers:{getPath:items.map(function(d){return d.z}).join(),getColor:C.lvl}})
  ].concat(pinLayers(items));
}
var deckgl=new deck.Deck({
  parent:$('map'),initialViewState:HOME,controller:{dragRotate:true,touchRotate:true,doubleClickZoom:true},
  views:new deck.MapView({repeat:false}),layers:layers(),
  getCursor:function(s){return pinMode?'crosshair':s.isDragging?'grabbing':s.isHovering?'pointer':'grab'},
  onViewStateChange:function(e){view=e.viewState;render()},
  onHover:function(info){if(locked)return;var id=info.object?info.object.g.id:null;if(id!==active.g)setChain(id)},
  onClick:function(info){
    if(pinMode&&info.coordinate){setPinMode(false);place(info.coordinate[0],info.coordinate[1],'Το σημείο που επιλέξατε');return;}
    var id=info.object?info.object.g.id:null;
    if(!id){locked=false;setChain(null);}
    else if(locked&&id===active.g){locked=false;}
    else{locked=true;setChain(id);}
    panel();
  }
});
function render(){deckgl.setProps({layers:layers()})}

/* ---------- panel ---------- */
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

/* ---------- search ---------- */
var opts={},dl=$('places');
D.g.slice().sort(function(a,b){return a.n.localeCompare(b.n,'el')}).forEach(function(g){
  var label=g.n+' · '+S[g.s].n;opts[label]=g.id;var o=document.createElement('option');o.value=label;dl.appendChild(o);
});
$('find').addEventListener('input',function(e){var id=opts[e.target.value];if(id){locked=true;setChain(id);e.target.blur();}});
addEventListener('keydown',function(e){if(e.key==='Escape'){if(pinMode){setPinMode(false);return;}clearPin();locked=false;$('find').value='';setChain(null);}});

/* ---------- address / my location ---------- */
// Δικός μας proxy (public/api/geocode.php): ρωτά το Nominatim του OpenStreetMap, με cache και όρια χρήσης.
var GEOCODER='api/geocode.php', searching=false;
var GEO_ERR={rate_limited:'Έγιναν πολλές αναζητήσεις σε λίγο χρόνο. Δοκιμάστε ξανά σε ένα λεπτό.',
  too_short:'Γράψτε οδό και αριθμό, π.χ. Πατησίων 76.'};
var GEO_DOWN='Η αναζήτηση διεύθυνσης δεν είναι διαθέσιμη αυτή τη στιγμή. Πατήστε <b>Σημείωση στον χάρτη</b> για να δείξετε το σημείο.';
function inRing(x,y,r){var c=false;for(var i=0,j=r.length-1;i<r.length;j=i++){var a=r[i],q=r[j];
  if(((a[1]>y)!==(q[1]>y))&&(x<(q[0]-a[0])*(y-a[1])/(q[1]-a[1])+a[0]))c=!c;}return c}
function locate(x,y){for(var i=0;i<D.g.length;i++){var g=D.g[i];for(var k=0;k<g.f.length;k++)if(inRing(x,y,g.f[k]))return g;}return null}
function msg(html,kind){var m=$('msg');m.innerHTML=html||'';m.dataset.kind=kind||'';m.hidden=!html}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML}
function place(lon,lat,label,approx){
  var g=locate(lon,lat);me={lon:lon,lat:lat,label:label};$('results').hidden=true;$('bclear').hidden=false;
  if(!g){locked=false;setChain(null);msg('<b>'+esc(label)+'</b> βρίσκεται εκτός των ορίων του Δήμου Αθηναίων.','warn');}
  else{locked=true;setChain(g.id);
    msg('<b>'+esc(label)+'</b> ανήκει στη γειτονιά <b>'+esc(g.n)+'</b>, στη συνοικία <b>'+esc(S[g.s].n)+'</b> της <b>'+esc(K[g.k].n.replace('η Δημοτική Κοινότητα','ης Δημοτικής Κοινότητας'))+'</b>.'+(g.pl?' Το σημείο είναι σε χώρο και όχι σε κατοικημένη γειτονιά.':'')
      +(approx?' <br><b>Προσοχή:</b> το OpenStreetMap δεν γνωρίζει τον ακριβή αριθμό, οπότε η πινέζα είναι στο κέντρο της οδού. Αν δεν είναι σωστή, πατήστε <b>Σημείωση στον χάρτη</b>.':''),approx?'warn':'ok');}
  go({longitude:lon,latitude:lat,zoom:Math.max(view.zoom,Z0+1.4),pitch:is3d?PITCH:0,bearing:is3d?view.bearing:0});
  render();
}
function clearPin(){me=null;$('bclear').hidden=true;msg('');$('results').hidden=true;render()}
function setPinMode(on){pinMode=on;$('bpin').setAttribute('aria-pressed',String(on));
  if(on){msg('Πατήστε στον χάρτη το σημείο όπου μένετε. Esc για ακύρωση.','info');}else if($('msg').dataset.kind==='info')msg('');}
$('bpin').addEventListener('click',function(){setPinMode(!pinMode)});
$('bclear').addEventListener('click',function(){clearPin();locked=false;setChain(null);$('addr').value=''});
$('faddr').addEventListener('submit',function(e){
  e.preventDefault();var q=$('addr').value.trim();if(q.length<3){msg('Γράψτε οδό και αριθμό, π.χ. Πατησίων 76.','warn');return;}
  if(searching)return;searching=true;$('baddr').disabled=true;
  setPinMode(false);msg('Αναζήτηση…','info');
  function done(){searching=false;$('baddr').disabled=false}
  fetch(GEOCODER+'?q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}})
  .then(function(r){return r.json().catch(function(){return {error:'bad'}})})
  .then(function(res){
    done();
    if(res.error){msg(GEO_ERR[res.error]||GEO_DOWN,'warn');return;}
    var list=res.results||[],ul=$('results');ul.innerHTML='';
    if(!list.length){msg('Δεν βρέθηκε η διεύθυνση μέσα στον Δήμο Αθηναίων. Δοκιμάστε άλλη γραφή (π.χ. «Πατησίων 76» ή «28ης Οκτωβρίου 76») ή πατήστε <b>Σημείωση στον χάρτη</b>.','warn');return;}
    if(list.length===1){place(list[0].lon,list[0].lat,list[0].label||q,!list[0].exact);return;}
    msg('Βρέθηκαν '+list.length+' αποτελέσματα. Διαλέξτε το σωστό:','info');
    list.forEach(function(it){var li=document.createElement('li'),bt=document.createElement('button');bt.type='button';
      bt.textContent=it.label;bt.addEventListener('click',function(){place(it.lon,it.lat,it.label,!it.exact)});
      li.appendChild(bt);ul.appendChild(li);});
    ul.hidden=false;
  }).catch(function(){done();msg(GEO_DOWN,'warn')});
});
$('bgeo').addEventListener('click',function(){
  setPinMode(false);
  if(!navigator.geolocation){msg('Ο browser σας δεν υποστηρίζει εντοπισμό θέσης.','warn');return;}
  msg('Εντοπισμός θέσης…','info');
  navigator.geolocation.getCurrentPosition(function(p){place(p.coords.longitude,p.coords.latitude,'Η τοποθεσία σας')},
    function(err){msg(err&&err.code===1?'Δεν δόθηκε άδεια πρόσβασης στη θέση σας. Μπορείτε να γράψετε τη διεύθυνση ή να πατήσετε <b>Σημείωση στον χάρτη</b>.'
      :'Η θέση σας δεν βρέθηκε. Δοκιμάστε ξανά σε ανοιχτό χώρο ή γράψτε τη διεύθυνση.','warn')},
    {enableHighAccuracy:true,timeout:10000});
});

/* ---------- tools ---------- */
function go(v){deckgl.setProps({initialViewState:Object.assign({},v,{transitionDuration:reduce?0:700,
  transitionInterpolator:new deck.FlyToInterpolator(),maxPitch:65,minZoom:11})})}
$('b3d').addEventListener('click',function(){
  is3d=!is3d;this.setAttribute('aria-pressed',String(is3d));
  go(Object.assign({},view,{pitch:is3d?PITCH:0,bearing:is3d?view.bearing:0}));render();
});
$('bhome').addEventListener('click',function(){is3d=true;$('b3d').setAttribute('aria-pressed','true');go(HOME)});

/* ---------- theme changes ---------- */
function retheme(){readColors();render()}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',retheme);
new MutationObserver(retheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(render);
panel();
})();
