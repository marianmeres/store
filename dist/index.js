const e=e=>"function"==typeof e,r=(r,t="")=>{if(!e(r))throw new TypeError(`${t} Expecting function arg`.trim())},t=r=>e(r.subscribe),s=(t=undefined,s=null)=>{const n=r=>e(s?.persist)&&s.persist(r);let c=(()=>{const e=new Map,r=r=>(e.has(r)||e.set(r,new Set),e.get(r)),t=(e,t)=>{if("function"!=typeof t)throw new TypeError("Expecting callback function as second argument");return r(e).add(t),()=>r(e).delete(t)};return{publish:(e,t={})=>{r(e).forEach((e=>e(t)))},subscribe:t,subscribeOnce:(e,r)=>{const s=t(e,(e=>{r(e),s()}));return s},unsubscribeAll:r=>e.delete(r)}})(),i=t;n(i);const u=()=>i,o=e=>{i!==e&&(i=e,n(i),c.publish("change",i))};return{set:o,get:u,update:e=>{r(e,"[update]"),o(e(u()))},subscribe:e=>(r(e,"[subscribe]"),e(i),c.subscribe("change",e))}},n=(n,c,i=null)=>{const u=s(i?.initialValue),o=[];n.forEach((e=>{if(!t(e))throw new TypeError("Expecting array of StoreLike objects");o.push(e.get())}));let b=0,a=[];const p=()=>{b++||n.forEach(((r,t)=>{a.push(r.subscribe((r=>{var s;o[t]=r,u.set(c(o)),s=u.get(),e(i?.persist)&&i.persist(s)})))}))};return{get:u.get,subscribe:e=>{r(e,"[derived.subscribe]"),p();const t=u.subscribe(e);return()=>{--b||(a.forEach((e=>e())),a=[]),t()}}}};export{n as createDerivedStore,s as createStore,t as isStoreLike};
