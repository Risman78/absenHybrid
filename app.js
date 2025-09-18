const GAS_URL = "https://script.google.com/macros/s/AKfycbzZLMlM58rCFiOi2beJ3KuhIpymBOxxf3uKW5ab4VYsPGxxpOqqlovTlshhVNXJc1pe/exec";

// Cek token saat load
window.addEventListener("load", () => {
  const token = localStorage.getItem("userToken");
  if (token) {
    document.getElementById("scan-area").style.display = "none";
    document.getElementById("absen-area").style.display = "block";
    document.getElementById("savedToken").textContent = token;
  } else {
    document.getElementById("scan-area").style.display = "block";
    document.getElementById("absen-area").style.display = "none";
  }
  updateStatus();
});

function saveToken() {
  const token = document.getElementById("tokenInput").value.trim();
  if (!token) return alert("Token tidak boleh kosong.");
  localStorage.setItem("userToken", token);
  location.reload();
}

async function submitAbsensi() {
  const token = localStorage.getItem("userToken");
  const empId = document.getElementById("employeeId").value.trim();

  if (!token) {
    return alert("Token belum terdaftar. Scan QR dulu.");
  }
  if (!empId) {
    return alert("Masukkan ID karyawan.");
  }

  const data = {
    token,
    employeeId: empId,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" }
    });

    if (res.ok) {
      alert("Absensi berhasil terkirim ke server!");
    } else {
      throw new Error("Gagal kirim, simpan offline.");
    }
  } catch (e) {
    saveOffline(data);
    alert("Offline. Absensi disimpan sementara.");
  }
}

// Simpan offline
function saveOffline(data) {
  let queue = JSON.parse(localStorage.getItem("offlineQueue") || "[]");
  queue.push(data);
  localStorage.setItem("offlineQueue", JSON.stringify(queue));
}

// Sync offline queue saat online
window.addEventListener("online", syncOffline);

async function syncOffline() {
  let queue = JSON.parse(localStorage.getItem("offlineQueue") || "[]");
  if (queue.length === 0) return;

  for (let item of queue) {
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(item),
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        console.log("Terkirim:", item);
        queue = queue.filter(q => q !== item);
        localStorage.setItem("offlineQueue", JSON.stringify(queue));
      }
    } catch (err) {
      console.log("Gagal sync, coba lagi nanti");
    }
  }
}

// Update status online/offline
function updateStatus() {
  const statusDiv = document.getElementById("status");
  if (navigator.onLine) {
    statusDiv.textContent = "🟢 Online";
  } else {
    statusDiv.textContent = "🔴 Offline";
    document.body.style.backgroundImage = "url('assets/images/prambanan.jpg')";
    document.body.style.backgroundSize = "cover";
  }
}
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);
