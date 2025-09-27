const API_URL = (window.APP_CONFIG||{}).GOOGLE_SCRIPT_URL;
const state = { route:"", catalog:null, pending: JSON.parse(localStorage.getItem("invQueue")||"[]") };
const $ = s=>document.querySelector(s);
function toast(m,t="info"){const n=$("#toast");n.textContent=m;n.style.display="block";setTimeout(()=>n.style.display="none",1800);}
function setStatus(s){const b=$("#statusBadge");b.textContent=s;b.style.background=s==="connected"?"#10361f":s==="syncing"?"#3b2a03":"#3a1115";}
function dateYMD(d=new Date()){return d.toISOString().slice(0,10);}
function post(action, body){return fetch(API_URL,{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})}).then(r=>r.json());}

$("#routeSelect").addEventListener("change", async e=>{
  state.route = e.target.value||"";
  if (!state.route) return;
  await ensureCatalog();
  buildUI();
  loadToday();
});

async function ensureCatalog(){
  if (state.catalog) return;
  try{ const r = await post("getCatalog",{}); if(r.status==="success") state.catalog=r.data; }catch(_){}
  if (!state.catalog) state.catalog = {
    "Sunflower Seeds":[
      {code:"4402",name:"200g",unit:"Bag",price:58,bundle:5},
      {code:"4401",name:"100g",unit:"Bag",price:34,bundle:5},
      {code:"1129",name:"25g",unit:"Bag",price:16,bundle:6},
      {code:"1116",name:"800g",unit:"Bag",price:17,carton:12},
      {code:"1145",name:"130g",unit:"Box",price:54,carton:6},
      {code:"1126",name:"10KG",unit:"Sack",price:160}
    ],
    "Pumpkin Seeds":[
      {code:"8001",name:"15g",unit:"Box",price:16,carton:6},
      {code:"8002",name:"110g",unit:"Box",price:54,carton:6},
      {code:"1142",name:"10KG",unit:"Sack",price:230}
    ],
    "Melon Seeds":[
      {code:"9001",name:"15g",unit:"Box",price:16,carton:6},
      {code:"9002",name:"110g",unit:"Box",price:54,carton:6}
    ],
    "Popcorn":[
      {code:"1701",name:"Cheese",unit:"Bag",price:5,carton:8},
      {code:"1702",name:"Butter",unit:"Bag",price:5,carton:8},
      {code:"1703",name:"Lightly Salted",unit:"Bag",price:5,carton:8}
    ]
  };
}

function buildUI(){
  const wrap = $("#invContainer"); wrap.innerHTML="";
  for (const [cat, products] of Object.entries(state.catalog)){
    const card = document.createElement("div"); card.className="card";
    card.innerHTML = `<h3>${cat}</h3>`;
    products.forEach(p=>{
      const row = document.createElement("div");
      row.className="grid";
      row.innerHTML = `
        <label>Code <input value="${p.code}" disabled></label>
        <label>Name <input value="${p.name}" disabled></label>
        <label>Physical <input id="physical-${p.code}" type="number" step="0.01"></label>
        <label>P.Unit <select id="physical-unit-${p.code}"><option>${p.unit}</option></select></label>
        <label>Transfer <input id="transfer-${p.code}" type="number" step="0.01"></label>
        <label>T.Unit <select id="transfer-unit-${p.code}"><option>${p.unit}</option></select></label>
        <label>System <input id="system-input-${p.code}" type="number" step="0.01"></label>
        <label>S.Unit <select id="system-unit-${p.code}"><option>${p.unit}</option></select></label>
        <label>Reimbursed <input id="reimbursed-${p.code}" type="number" step="0.01"></label>
      `;
      card.appendChild(row);
    });
    wrap.appendChild(card);
  }
}

function collectPayload(){
  const items=[];
  for (const [cat, products] of Object.entries(state.catalog||{})){
    products.forEach(p=>{
      const g=id=>document.getElementById(id);
      const phys=+g(`physical-${p.code}`)?.value||0;
      const physUnit=g(`physical-unit-${p.code}`)?.value||p.unit;
      const trans=+g(`transfer-${p.code}`)?.value||0;
      const transUnit=g(`transfer-unit-${p.code}`)?.value||p.unit;
      const sys=+g(`system-input-${p.code}`)?.value||0;
      const sysUnit=g(`system-unit-${p.code}`)?.value||p.unit;
      const reimb=+g(`reimbursed-${p.code}`)?.value||0;
      if (phys||trans||sys||reimb) items.push({category:cat,code:p.code,name:p.name,physical:phys,physUnit,transfer:trans,transUnit,system:sys,sysUnit,difference:(sys-phys),reimburse:reimb,reimbUnit:"Pieces"});
    });
  }
  return { route: state.route, date: dateYMD(), items };
}

$("#btnSaveInv").addEventListener("click", async ()=>{
  if(!state.route) return toast("Pick a route first","error");
  try{
    setStatus("syncing");
    const r = await post("saveInventoryData", collectPayload());
    if (r.status==="success"){ setStatus("connected"); toast("Inventory saved","success"); }
    else throw new Error(r.data||"save failed");
  }catch(e){
    setStatus("offline"); toast("Save failed. Queued.","error");
    queue({action:"saveInventoryData",body:collectPayload()});
  }
});
$("#btnSubmitInv").addEventListener("click", ()=>$("#btnSaveInv").click());
$("#btnLoadPrev").addEventListener("click", loadToday);
async function loadToday(){
  if(!state.route) return;
  try{
    const r = await post("getInventoryData",{route:state.route,date:dateYMD()});
    if (r.status!=="success") return;
    (r.data.items||[]).forEach(it=>{
      const set=(id,v)=>{const el=document.getElementById(id); if(el) el.value=v??"";};
      set(`physical-${it.code}`,it.physical);
      set(`physical-unit-${it.code}`,it.physUnit);
      set(`transfer-${it.code}`,it.transfer);
      set(`transfer-unit-${it.code}`,it.transUnit);
      set(`system-input-${it.code}`,it.system);
      set(`system-unit-${it.code}`,it.sysUnit);
      set(`reimbursed-${it.code}`,it.reimburse);
    });
    toast("Loaded today from Sheet","success");
  }catch(_){}
}

// Offline queue + heartbeat
function queue(x){ const q=JSON.parse(localStorage.getItem("invQueue")||"[]"); q.push(x); localStorage.setItem("invQueue",JSON.stringify(q)); }
async function flush(){
  const q=JSON.parse(localStorage.getItem("invQueue")||"[]"); if(!q.length) return;
  try{
    const r = await post(q[0].action,q[0].body);
    if (r.status==="success"){ q.shift(); localStorage.setItem("invQueue",JSON.stringify(q)); toast("Synced pending","success"); }
  }catch(_){}
}
async function heartbeat(){
  if(!API_URL) return;
  try{ const r=await post("testConnection",{}); setStatus(r.status==="success"?"connected":"offline"); }
  catch(_){ setStatus("offline"); }
  flush();
}
setInterval(heartbeat, 8000);
heartbeat();
