const VERSION = '0.3.0';
const SHELL_CACHE = `youface-shell-${VERSION}`;
const RUNTIME_CACHE = `youface-runtime-${VERSION}`;
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/runtime-config.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>![SHELL_CACHE,RUNTIME_CACHE].includes(key)).map(key=>caches.delete(key)));await self.clients.claim();})()); });
async function networkFirst(request){try{const response=await fetch(request);if(response.ok){const cache=await caches.open(RUNTIME_CACHE);await cache.put(request,response.clone());}return response;}catch{return (await caches.match(request))??caches.match('/index.html');}}
async function staleWhileRevalidate(request){const cached=await caches.match(request);const network=fetch(request).then(async response=>{if(response.ok){const cache=await caches.open(RUNTIME_CACHE);await cache.put(request,response.clone());}return response;}).catch(()=>null);return cached??network??Response.error();}
self.addEventListener('fetch',event=>{const {request}=event;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/media-files/'))return;if(request.mode==='navigate'){event.respondWith(networkFirst(request));return;}if(['script','style','image','font'].includes(request.destination))event.respondWith(staleWhileRevalidate(request));});
