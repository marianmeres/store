"use strict";const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},r=t=>e(t.subscribe),s=(r,s=null)=>{const n=t=>e(s?.persist)&&s.persist(t);let o=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r)=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const s=r(e,(e=>{t(e),s()}));return s},unsubscribeAll:t=>e.delete(t)}})(),i=r;n(i);const c=()=>i,u=e=>{i!==e&&(i=e,n(i),o.publish("change",i))};return{set:u,get:c,update:e=>{t(e,"[update]"),u(e(c()))},subscribe:e=>(t(e,"[subscribe]"),e(i),o.subscribe("change",e))}},n=(e,t="session")=>{const r="session"===t?window?.sessionStorage:window?.localStorage;return{remove:()=>r?.removeItem(e),set:t=>{try{r?.setItem(e,JSON.stringify(t))}catch(e){console.error(e)}},get:()=>{try{return JSON.parse(r?.getItem(e))}catch(e){}}}};exports.createDerivedStore=(n,o,i=null)=>{const c=t=>e(i?.persist)&&i.persist(t),u=s(i?.initialValue),a=[];if(n.forEach((e=>{if(!r(e))throw new TypeError("Expecting array of StoreLike objects");e.subscribe((e=>a.push(e)))()})),!e(o))throw new TypeError("Expecting second argument to be the derivative function");if(!o.length||o.length>2)throw new TypeError("Expecting the derivative function to have exactly 1 or 2 arguments");let g=0,p=[];const b=e=>{t(e,"[derived.subscribe]"),g++||n.forEach(((e,t)=>{p.push(e.subscribe((e=>{a[t]=e,1===o.length?(u.set(o(a)),c(u.get())):o(a,(e=>{u.set(e),c(u.get())}))})))}));const r=u.subscribe(e);return()=>{--g||(p.forEach((e=>e())),p=[]),r()}};return{get:()=>{let e;return b((t=>e=t))(),e},subscribe:b}},exports.createStoragePersistor=n,exports.createStorageStore=(e,t="session",r)=>{["local","session"].includes(t)||(console.warn(`Ignoring invalid storageType '${t}', using 'session' instead.`),t="session");const o=n(e,t);return s(o.get()||r,{persist:o.set})},exports.createStore=s,exports.isStoreLike=r;
