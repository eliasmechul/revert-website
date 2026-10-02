/* Revert — offline helper (service worker).
   - The page is fetched fresh whenever there is internet, so updates arrive at once, and a copy is kept for offline use.
   - Recitations and fonts are kept the first time they load, so they also work offline later.
   - The community database, the security check and anything else from other sites always go to the internet.
   The version below changes with every build, which tells phones to pick up the new app. */
const VERSION="2026-10-02T14:47:45.019Z", SHELL="revert-shell-"+VERSION, MEDIA="revert-media-v1";
const SHELL_FILES=["./","index.html","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","icons/favicon-32.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith("revert-shell-")&&k!==SHELL).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const url=new URL(req.url), same=url.origin===location.origin;
  const font=/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if(!same&&!font)return;
  if(same&&url.pathname.startsWith("/.netlify/"))return;   /* Netlify's own files: leave them to Netlify */
  if(same&&url.pathname.includes("/audio/")){e.respondWith(media(req));return;}
  if(font){e.respondWith(keep(req,MEDIA));return;}
  if(req.mode==="navigate"||/\/$|\.html$|config\.js$/.test(url.pathname)){e.respondWith(fresh(req));return;}
  e.respondWith(keep(req,SHELL));
});

/* saved copy first, internet if missing */
async function keep(req,name){
  const c=await caches.open(name), hit=await c.match(req); if(hit)return hit;
  const res=await fetch(req); if(res.ok||res.type==="opaque")c.put(req,res.clone()); return res;
}
/* internet first, saved copy when offline */
async function fresh(req){
  const c=await caches.open(SHELL);
  try{const res=await fetch(req); if(res.ok)c.put(req,res.clone()); return res;}
  catch(err){return (await c.match(req))||(await c.match("index.html"))||(await c.match("./"))||Response.error();}
}
/* recitations: keep the whole file once, then answer the "piece of the file" requests Safari makes for audio */
async function media(req){
  const c=await caches.open(MEDIA), key=req.url.split("#")[0];
  let full=await c.match(key);
  if(!full){
    try{const res=await fetch(key); if(!res.ok)return res; await c.put(key,res.clone()); full=res;}
    catch(err){return Response.error();}
  }
  const range=req.headers.get("range"); if(!range)return full;
  const buf=await full.arrayBuffer(), size=buf.byteLength, m=/bytes=(\d*)-(\d*)/.exec(range)||[];
  const start=m[1]?+m[1]:0, end=m[2]?Math.min(+m[2],size-1):size-1;
  return new Response(buf.slice(start,end+1),{status:206,headers:{
    "Content-Type":full.headers.get("Content-Type")||"audio/mpeg","Content-Range":`bytes ${start}-${end}/${size}`,
    "Content-Length":String(end-start+1),"Accept-Ranges":"bytes"}});
}
