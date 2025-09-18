let deferredPrompt = null;
let empId = '';
let token = '';
let history = [];
const kantor1 = { lat:-6.953445, lng:107.798894 };
const kantor2 = { lat:-6.950100, lng:107.804500 };
const maxDistanceMeters = 200;
const maxAccuracyMeters = 500;

// ===== PWA Install Prompt =====
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const promptDiv = document.getElementById('installPrompt');
  if(!localStorage.getItem('pwa_installed')) promptDiv.style.display = 'block';
});

document.getElementById('btnInstall')?.addEventListener('click', async () => {
  if(deferredPrompt){
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if(choiceResult.outcome==='accepted'){
      localStorage.setItem('pwa_installed','true');
    }
    deferredPrompt = null;
    document.getElementById('installPrompt').style.display='none';
  }
});

// ===== IndexedDB untuk offline =====
let dbPromise = null;
function openDb(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const req = indexedDB.open('AbsensiPWA',1);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('offlineAbsensi')){
        const store = db.createObjectStore('offlineAbsensi',{keyPath:'localId',autoIncrement:true});
        store.createIndex('synced','synced',{unique:false});
      }
    };
    req.onsuccess = e=>resolve(e.target.result);
    req.onerror = e=>reject(e.target.error);
  });
  return dbPromise;
}

async function saveOfflineRecord(record){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('offlineAbsensi','readwrite');
    const store = tx.objectStore('offlineAbsensi');
    record.synced=false;
    record.createdAt=new Date().toISOString();
    const r = store.add(record);
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

async function getAllPending(){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('offlineAbsensi','readonly');
    const store = tx.objectStore('offlineAbsensi');
    const req = store.getAll();
    req.onsuccess=()=>resolve(req.result.filter(r=>!r.synced));
    req.onerror=()=>reject(req.error);
  });
}

// ===== Utilities =====
function isOnline(){ return navigator.onLine; }

function getDistanceInMeters(lat1,lng1,lat2,lng2){
  const R = 6371000, toRad = Math.PI/180;
  const dLat = (lat2-lat1)*toRad;
  const dLng = (lng2-lng1)*toRad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function updateHistoryTable(){
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML='';
  history.forEach(h=>{
    const tr = document.createElement('tr');
    tr.innerHTML=`<td>${h.date}</td><td>${h.arrival||''}</td><td>${h.leave||''}</td><td>${h.synced?'✓':'⏳'}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Absensi =====
document.getElementById('btnContinue').addEventListener('click', ()=>{
  empId = document.getElementById('empId').value.trim();
  if(!empId) return alert('Masukkan ID karyawan.');
  token = localStorage.getItem('token') || '';
  document.getElementById('menu').style.display='flex';
  document.getElementById('appContainer').style.display='block';
  document.body.style.backgroundImage = "url('assets/images/prambanan.jpg')";
});

async function submitAttendance(type){
  if(!empId) return alert('ID belum diisi.');

  // Ambil GPS
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    if(accuracy>maxAccuracyMeters){
      return alert(`Gagal: Akurasi GPS rendah ±${Math.round(accuracy)} m. Pindah ke area terbuka.`);
    }

    const minDistance = Math.min(
      getDistanceInMeters(kantor1.lat,kantor1.lng,lat,lng),
      getDistanceInMeters(kantor2.lat,kantor2.lng,lat,lng)
    );

    if(isOnline()){
      // Panggil Google Apps Script
      const url = "https://script.google.com/macros/s/AKfycbzZLMlM58rCFiOi2beJ3KuhIpymBOxxf3uKW5ab4VYsPGxxpOqqlovTlshhVNXJc1pe/exec"; // ganti dengan URL GAS
      const params = {employeeId:empId,type:type,lat:lat,lng:lng,token:token,accuracy:accuracy};
      try{
        const res = await fetch(url+"?"+new URLSearchParams(params));
        const text = await res.text();
        console.log(text);
        addHistoryEntry(type,true);
      }catch(e){
        console.error(e);
        // fallback offline
        await saveOfflineRecord({employeeId:empId,type,type,lat,lng,accuracy});
        addHistoryEntry(type,false);
      }
    } else {
      // Offline → simpan lokal
      await saveOfflineRecord({employeeId:empId,type,type,lat,lng,accuracy});
      addHistoryEntry(type,false);
    }
  }, err=>{
    alert('Tidak bisa mendapatkan lokasi. Pastikan GPS aktif.');
  }, {enableHighAccuracy:true});
}

function addHistoryEntry(type,synced){
  const now = new Date();
  let dateStr = now.toLocaleDateString('id-ID');
  let timeStr = now.toLocaleTimeString('id-ID');
  let entry = history.find(h=>h.date===dateStr);
  if(!entry){
    entry={date:dateStr,arrival:'',leave:'',synced:synced};
    history.push(entry);
  }
  if(type==='datang') entry.arrival = timeStr;
  if(type==='pulang') entry.leave = timeStr;
  if(synced) entry.synced = true;
  updateHistoryTable();
}

document.getElementById('btnDatang').addEventListener('click', ()=>submitAttendance('datang'));
document.getElementById('btnPulang').addEventListener('click', ()=>submitAttendance('pulang'));

// ===== Sinkronisasi Otomatis saat Online =====
window.addEventListener('online', async ()=>{
  const pending = await getAllPending();
  for(const p of pending){
    try{
      const url = "https://script.google.com/macros/s/AKfycbzZLMlM58rCFiOi2beJ3KuhIpymBOxxf3uKW5ab4VYsPGxxpOqqlovTlshhVNXJc1pe/exec"; // ganti dengan URL GAS
      const params = {employeeId:p.employeeId,type:p.type,lat:p.lat,lng:p.lng,token:token,accuracy:p.accuracy};
      const res = await fetch(url+"?"+new URLSearchParams(params));
      const text = await res.text();
      p.synced=true;
    }catch(e){
      console.error('Sync gagal',e);
    }
  }
  updateHistoryTable();
});
