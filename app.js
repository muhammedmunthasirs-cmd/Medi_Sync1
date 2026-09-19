// app.js — MediSync Frontend Controller
// Pure vanilla JS with no build step required.
// Talks to the FastAPI backend defined in /backend.

const API_BASE = window.MEDISYNC_API_BASE || `http://${window.location.hostname || "localhost"}:8000`;

const state = {
  token: localStorage.getItem("medisync_token") || null,
  user: JSON.parse(localStorage.getItem("medisync_user") || "null"),
  notifications: [],
  activeConsultationId: null,
  activeConsultation: null,
  mediaStream: null,
  isCameraOn: true,
  isMicOn: true,
  callTimerInterval: null,
  callSeconds: 0,
  patients: [],
  selectedPatientId: null,
};

// ---------------------------------------------------------------
// API Helper
// ---------------------------------------------------------------
async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

async function apiLoginForm(email, password) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login failed");
  return data;
}

// ---------------------------------------------------------------
// Toast & Notifications
// ---------------------------------------------------------------
let toastTimer = null;
function showToast(message, type = "normal") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast";
  if (type === "error") el.classList.add("toast-error");
  if (type === "success") el.classList.add("toast-success");
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

async function loadNotifications() {
  if (!state.token) return;
  try {
    const notifs = await api("/api/notifications");
    state.notifications = notifs;
    renderNotifications();
  } catch (err) {
    console.warn("Notifications error:", err);
  }
}

function renderNotifications() {
  const listEl = document.getElementById("notif-list");
  const badgeEl = document.getElementById("notif-badge");
  const unread = state.notifications.filter((n) => !n.is_read);

  if (unread.length > 0) {
    badgeEl.textContent = unread.length;
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }

  if (state.notifications.length === 0) {
    listEl.innerHTML = `<p class="muted" style="padding: 1rem; text-align: center;">${I18N.t("noNotifications")}</p>`;
    return;
  }

  listEl.innerHTML = "";
  for (const n of state.notifications) {
    const item = document.createElement("div");
    item.className = `notif-item ${n.is_read ? "" : "unread"}`;
    const timeStr = new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `
      <div class="notif-item-title">${escapeHtml(n.title)}</div>
      <div class="notif-item-msg">${escapeHtml(n.message)}</div>
      <div class="notif-item-time">${timeStr} · ${n.category.toUpperCase()}</div>
    `;
    item.addEventListener("click", async () => {
      if (!n.is_read) {
        await api(`/api/notifications/${n.id}/read`, { method: "POST" });
        n.is_read = true;
        renderNotifications();
      }
    });
    listEl.appendChild(item);
  }
}

// ---------------------------------------------------------------
// Auth & Session
// ---------------------------------------------------------------
function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("medisync_token", token);
  localStorage.setItem("medisync_user", JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("medisync_token");
  localStorage.removeItem("medisync_user");
}

function showAuth() {
  document.getElementById("main-app").classList.add("hidden");
  document.getElementById("user-header-info").classList.add("hidden");
  document.getElementById("notif-wrapper").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  document.getElementById("user-header-info").classList.remove("hidden");
  document.getElementById("notif-wrapper").classList.remove("hidden");

  // User details in header
  document.getElementById("user-name").textContent = state.user.full_name;
  const roleBadge = document.getElementById("user-role-badge");
  roleBadge.textContent = capitalize(state.user.role);
  roleBadge.className = `user-role-pill role-${state.user.role}`;

  // Route to role view
  document.getElementById("patient-view").classList.add("hidden");
  document.getElementById("doctor-view").classList.add("hidden");
  document.getElementById("admin-view").classList.add("hidden");

  if (state.user.role === "doctor" || state.user.role === "clinician") {
    document.getElementById("doctor-view").classList.remove("hidden");
    loadDoctorDashboard();
  } else if (state.user.role === "admin") {
    document.getElementById("admin-view").classList.remove("hidden");
    loadAdminDashboard();
  } else {
    document.getElementById("patient-view").classList.remove("hidden");
    loadPatientDashboard();
  }

  loadNotifications();
}

// Quick 1-Click Demo Logins
document.getElementById("demo-doctor-btn").addEventListener("click", async () => {
  document.getElementById("login-email").value = "doctor@medisync.local";
  document.getElementById("login-password").value = "DoctorPass123!";
  await executeLogin("doctor@medisync.local", "DoctorPass123!");
});

document.getElementById("demo-patient-btn").addEventListener("click", async () => {
  document.getElementById("login-email").value = "patient@medisync.local";
  document.getElementById("login-password").value = "PatientPass123!";
  await executeLogin("patient@medisync.local", "PatientPass123!");
});

document.getElementById("demo-admin-btn").addEventListener("click", async () => {
  document.getElementById("login-email").value = "admin@medisync.local";
  document.getElementById("login-password").value = "AdminPass123!";
  await executeLogin("admin@medisync.local", "AdminPass123!");
});

async function executeLogin(email, password) {
  const errorEl = document.getElementById("auth-error");
  errorEl.classList.add("hidden");
  try {
    const data = await apiLoginForm(email, password);
    setSession(data.access_token, data.user);
    showToast(`Welcome back, ${data.user.full_name}!`, "success");
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
}

// Auth Forms
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  await executeLogin(email, password);
});

document.getElementById("register-patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const full_name = document.getElementById("reg-pat-name").value.trim();
  const phone = document.getElementById("reg-pat-phone").value.trim();
  const email = document.getElementById("reg-pat-email").value.trim();
  const password = document.getElementById("reg-pat-password").value;
  const errorEl = document.getElementById("auth-error");
  errorEl.classList.add("hidden");
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: { full_name, phone, email, password, role: "patient" },
    });
    setSession(data.access_token, data.user);
    showToast("Patient account created successfully!", "success");
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

// Doctor Registration with UIDAI E-KYC
document.getElementById("register-doctor-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const full_name = document.getElementById("reg-doc-name").value.trim();
  const phone = document.getElementById("reg-doc-phone").value.trim();
  const email = document.getElementById("reg-doc-email").value.trim();
  const password = document.getElementById("reg-doc-password").value;
  const registration_number = document.getElementById("reg-doc-regno").value.trim();
  const medical_council = document.getElementById("reg-doc-council").value.trim();
  const specialization = document.getElementById("reg-doc-spec").value;
  const experience_years = parseInt(document.getElementById("reg-doc-exp").value) || 1;
  const clinic_name = document.getElementById("reg-doc-clinic").value.trim();
  const aadhaar_masked = document.getElementById("reg-doc-aadhaar").value.trim();

  // Selected languages
  const checkedBoxes = document.querySelectorAll("#doc-languages-selection input[type='checkbox']:checked");
  const languages = Array.from(checkedBoxes).map((c) => c.value);

  const errorEl = document.getElementById("auth-error");
  errorEl.classList.add("hidden");

  try {
    const data = await api("/api/doctors/register", {
      method: "POST",
      body: {
        email,
        full_name,
        phone,
        password,
        registration_number,
        medical_council,
        specialization,
        experience_years,
        languages,
        clinic_name,
        aadhaar_masked,
        uidai_doc_name: "UIDAI_Aadhaar_Submission.xml",
        degree_doc_name: "Medical_Registration_Cert.pdf",
      },
    });

    setSession(data.access_token, data.user);
    showToast("Doctor application submitted! Verification pending by Admin.", "success");
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  showAuth();
});

// Auth Tabs Switcher
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("login-form").classList.toggle("hidden", target !== "login");
    document.getElementById("register-patient-form").classList.toggle("hidden", target !== "register-patient");
    document.getElementById("register-doctor-form").classList.toggle("hidden", target !== "register-doctor");
    document.getElementById("auth-error").classList.add("hidden");
  });
});

// Language Switcher Selector
const langSelect = document.getElementById("lang-select");
langSelect.value = I18N.currentLang;
langSelect.addEventListener("change", (e) => {
  I18N.setLanguage(e.target.value);
  showToast(`Language switched to ${e.target.options[e.target.selectedIndex].text}`, "normal");
  // Reload current views
  if (state.user) {
    if (state.user.role === "patient") loadPatientDashboard();
    if (state.user.role === "doctor") loadDoctorDashboard();
    if (state.user.role === "admin") loadAdminDashboard();
  }
});

// Notification Bell Click
document.getElementById("notif-bell-btn").addEventListener("click", () => {
  const drawer = document.getElementById("notif-drawer");
  drawer.classList.toggle("hidden");
});

document.getElementById("mark-read-btn").addEventListener("click", async () => {
  await api("/api/notifications/read-all", { method: "POST" });
  for (const n of state.notifications) n.is_read = true;
  renderNotifications();
});

// ---------------------------------------------------------------
// PATIENT VIEW & LANGUAGE MATCHMAKING
// ---------------------------------------------------------------
async function loadPatientDashboard() {
  await searchMatchingDoctors();
  await loadPatientPrescriptions();
  await loadPatientTimeline();
}

// Subtab switcher for Patient
document.querySelectorAll("[data-ptab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-ptab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.ptab;
    document.getElementById("patient-matchmaker-tab").classList.toggle("hidden", target !== "matchmaker");
    document.getElementById("patient-prescriptions-tab").classList.toggle("hidden", target !== "prescriptions");
    document.getElementById("patient-timeline-tab").classList.toggle("hidden", target !== "timeline");
  });
});

document.getElementById("match-lang-select").addEventListener("change", () => searchMatchingDoctors());
document.getElementById("match-spec-select").addEventListener("change", () => searchMatchingDoctors());

async function searchMatchingDoctors() {
  const lang = document.getElementById("match-lang-select").value;
  const spec = document.getElementById("match-spec-select").value;
  const container = document.getElementById("matched-doctors-list");
  container.innerHTML = `<div class="muted" style="padding: 2rem;">Searching verified doctors...</div>`;

  try {
    const params = new URLSearchParams();
    if (lang) params.set("language", lang);
    if (spec) params.set("specialization", spec);

    const doctors = await api(`/api/doctors/match?${params.toString()}`);
    container.innerHTML = "";

    if (doctors.length === 0) {
      container.innerHTML = `<div class="muted" style="grid-column: 1 / -1; padding: 2rem; text-align: center;">No verified doctors found matching criteria. Try choosing 'Any Language'.</div>`;
      return;
    }

    for (const doc of doctors) {
      const card = document.createElement("div");
      card.className = "doctor-card";
      card.innerHTML = `
        <div class="doc-header">
          <div>
            <div class="doc-name">${escapeHtml(doc.full_name)}</div>
            <div class="doc-spec">${escapeHtml(doc.specialization)} · ${doc.experience_years} ${I18N.t("experience")}</div>
            <div class="doc-clinic">${escapeHtml(doc.clinic_name || "Telehealth Partner Clinic")}</div>
          </div>
          <span class="match-score-badge">★ ${doc.match_score}% ${I18N.t("matchScore")}</span>
        </div>

        <div>
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem;">
            ${I18N.t("speaks")}:
          </div>
          <div class="tag-cloud">
            ${doc.languages.map((l) => `<span class="tag-lang ${doc.matched_languages.includes(l) ? "highlight" : ""}">${escapeHtml(l)}</span>`).join("")}
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light);">
          <span style="font-size: 0.78rem; color: var(--success); font-weight: 600;">✓ ${I18N.t("kycVerified")}</span>
          <button class="btn btn-primary btn-small start-call-btn">
            📹 ${I18N.t("startVideoCall")}
          </button>
        </div>
      `;

      card.querySelector(".start-call-btn").addEventListener("click", () => {
        initiateVideoConsultation({
          doctorId: doc.user_id,
          doctorName: doc.full_name,
          specialization: doc.specialization,
          language: lang || doc.languages[0] || "English",
        });
      });

      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

async function loadPatientPrescriptions() {
  const container = document.getElementById("patient-rx-list");
  container.innerHTML = `<div class="muted" style="padding: 1rem;">Loading your prescriptions...</div>`;
  try {
    const consultations = await api("/api/consultations");
    const rxConsultations = consultations.filter((c) => c.prescription);

    if (rxConsultations.length === 0) {
      container.innerHTML = `<div class="muted" style="padding: 2rem; text-align: center;">${I18N.t("noPrescriptions")}</div>`;
      return;
    }

    container.innerHTML = "";
    for (const c of rxConsultations) {
      const rx = c.prescription;
      const card = document.createElement("div");
      card.className = "rx-card";
      const dateFormatted = new Date(rx.created_at).toLocaleDateString([], { dateStyle: "long" });

      card.innerHTML = `
        <div class="rx-header">
          <div>
            <h3 style="color: var(--primary); font-size: 1.15rem;">${escapeHtml(rx.doctor_name)}</h3>
            <p class="muted" style="font-size: 0.85rem;">Consultation Date: ${dateFormatted} · Language: ${escapeHtml(c.language_used)}</p>
          </div>
          <div class="rx-symbol">℞</div>
        </div>

        <div style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.82rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem;">
            ${I18N.t("problemTitle")}
          </h4>
          <p style="font-size: 0.92rem; color: var(--text-main);">${escapeHtml(c.problem_description || "Not recorded")}</p>
        </div>

        <div style="margin-bottom: 1.25rem;">
          <h4 style="font-size: 0.82rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem;">
            ${I18N.t("diagnosisCureTitle")}
          </h4>
          <p style="font-size: 0.92rem; color: var(--text-main); font-weight: 500; background: var(--bg-subtle); padding: 0.65rem 0.85rem; border-radius: 6px;">
            ${escapeHtml(c.diagnosis_cure || "Under observation")}
          </p>
        </div>

        <h4 style="font-size: 0.82rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">
          ${I18N.t("prescribeMedications")}
        </h4>
        <table class="rx-table">
          <thead>
            <tr>
              <th>${I18N.t("medicineName")}</th>
              <th>${I18N.t("dosage")}</th>
              <th>${I18N.t("frequency")}</th>
              <th>${I18N.t("duration")}</th>
              <th>${I18N.t("foodInstructions")}</th>
            </tr>
          </thead>
          <tbody>
            ${rx.medications.map((m) => `
              <tr>
                <td style="font-weight: 600;">${escapeHtml(m.name)}</td>
                <td>${escapeHtml(m.dosage)}</td>
                <td><span class="tag-lang">${escapeHtml(m.frequency)}</span></td>
                <td>${escapeHtml(m.duration)}</td>
                <td style="font-style: italic;">${escapeHtml(m.instructions)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        ${rx.general_advice ? `
          <div style="margin-top: 1rem; font-size: 0.88rem; color: var(--text-muted);">
            <strong>General Advice:</strong> ${escapeHtml(rx.general_advice)}
          </div>
        ` : ""}

        ${c.follow_up_date ? `
          <div style="margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--primary);">
            Next Follow-up Date: ${escapeHtml(c.follow_up_date)}
          </div>
        ` : ""}

        <div style="display: flex; justify-content: flex-end; margin-top: 1.25rem;">
          <button class="btn btn-ghost btn-small" onclick="window.print()">
            🖨️ ${I18N.t("printRx")}
          </button>
        </div>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

async function loadPatientTimeline() {
  const container = document.getElementById("patient-timeline-events");
  container.innerHTML = `<div class="muted" style="padding: 1rem;">Loading timeline...</div>`;
  try {
    const patients = await api("/api/patients");
    if (patients.length === 0) {
      container.innerHTML = `<div class="muted" style="padding: 1rem;">No patient records registered yet.</div>`;
      return;
    }
    const currentPat = patients[0];
    const timeline = await api(`/api/patients/${currentPat.id}/timeline`);
    container.innerHTML = "";

    if (timeline.length === 0) {
      container.innerHTML = `<div class="muted" style="padding: 1rem;">No timeline records yet. Upload a document to start!</div>`;
      return;
    }

    for (const evt of timeline) {
      const el = document.createElement("div");
      el.className = "timeline-event" + (evt.date ? "" : " undated");
      el.innerHTML = `
        <div class="te-date">${evt.date || "Date unspecified"} ${evt.date_is_estimated ? '<span class="est">(detected)</span>' : ""}</div>
        <div class="te-card">
          <span class="te-type">${escapeHtml(evt.doc_type.replace(/_/g, " "))}</span>
          <div class="te-title">${escapeHtml(evt.title)}</div>
          <div class="te-summary">${escapeHtml(evt.summary)}</div>
        </div>
      `;
      container.appendChild(el);
    }
  } catch (err) {
    container.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

// ---------------------------------------------------------------
// DOCTOR VIEW
// ---------------------------------------------------------------
async function loadDoctorDashboard() {
  await checkDoctorKycStatus();
  await loadDoctorConsultationsQueue();
  await loadDoctorPatientList();
}

// Doctor Subtab switcher
document.querySelectorAll("[data-dtab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-dtab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.dtab;
    document.getElementById("doc-queue-tab").classList.toggle("hidden", target !== "queue");
    document.getElementById("doc-records-tab").classList.toggle("hidden", target !== "records");
  });
});

async function checkDoctorKycStatus() {
  const banner = document.getElementById("doctor-kyc-banner");
  const bannerText = document.getElementById("doctor-kyc-banner-text");
  try {
    const doctors = await api("/api/doctors");
    const myDoc = doctors.find((d) => d.user_id === state.user.id);
    if (myDoc) {
      if (myDoc.kyc_status === "verified") {
        banner.className = "notice-banner verified";
        bannerText.textContent = I18N.t("kycVerifiedBanner");
      } else if (myDoc.kyc_status === "rejected") {
        banner.className = "notice-banner danger";
        bannerText.textContent = `UIDAI E-KYC Rejected. Reason: ${myDoc.verification_notes || "Please re-upload credentials."}`;
      } else {
        banner.className = "notice-banner pending";
        bannerText.textContent = I18N.t("kycPendingBanner");
      }
    }
  } catch (err) {
    console.warn("KYC status error:", err);
  }
}

async function loadDoctorConsultationsQueue() {
  const container = document.getElementById("doc-consultations-list");
  container.innerHTML = `<div class="muted" style="padding: 1rem;">Loading consultation queue...</div>`;
  try {
    const consultations = await api("/api/consultations");
    container.innerHTML = "";

    if (consultations.length === 0) {
      container.innerHTML = `<div class="muted" style="padding: 2rem; text-align: center;">No active patient consultations waiting.</div>`;
      return;
    }

    for (const c of consultations) {
      const card = document.createElement("div");
      card.className = "rx-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <h3 style="font-size: 1.1rem; color: var(--text-main);">Patient: ${escapeHtml(c.patient_name)}</h3>
            <p class="muted" style="font-size: 0.82rem;">Language: ${escapeHtml(c.language_used)} · Status: ${c.status.toUpperCase()}</p>
          </div>
          <span class="user-role-pill ${c.status === 'completed' ? 'role-doctor' : 'role-patient'}">
            ${c.status.toUpperCase()}
          </span>
        </div>

        ${c.problem_description ? `
          <div style="font-size: 0.9rem; margin-bottom: 0.5rem;">
            <strong>${I18N.t("problemTitle")}:</strong> ${escapeHtml(c.problem_description)}
          </div>
        ` : ""}

        ${c.diagnosis_cure ? `
          <div style="font-size: 0.9rem; margin-bottom: 0.75rem;">
            <strong>${I18N.t("diagnosisCureTitle")}:</strong> ${escapeHtml(c.diagnosis_cure)}
          </div>
        ` : ""}

        <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
          <button class="btn btn-primary btn-small launch-doc-call-btn">
            📹 Join Telemedicine Room
          </button>
          <button class="btn btn-ghost btn-small write-doc-rx-btn">
            📝 Open Prescription Drawer
          </button>
        </div>
      `;

      card.querySelector(".launch-doc-call-btn").addEventListener("click", () => {
        openVideoRoom({
          consultationId: c.id,
          patientId: c.patient_id,
          participantName: c.patient_name,
          subtitle: `Patient · Preferred Language: ${c.language_used}`,
          avatar: "👤",
        });
      });

      card.querySelector(".write-doc-rx-btn").addEventListener("click", () => {
        openVideoRoom({
          consultationId: c.id,
          patientId: c.patient_id,
          participantName: c.patient_name,
          subtitle: `Patient · Preferred Language: ${c.language_used}`,
          avatar: "👤",
        });
      });

      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

async function loadDoctorPatientList() {
  const container = document.getElementById("doc-patients-grid");
  try {
    const patients = await api("/api/patients");
    container.innerHTML = "";
    for (const p of patients) {
      const card = document.createElement("div");
      card.className = "doctor-card";
      card.innerHTML = `
        <div>
          <h3 style="font-size: 1.05rem;">${escapeHtml(p.full_name)}</h3>
          <p class="muted" style="font-size: 0.82rem;">MRN: ${escapeHtml(p.mrn)} · ${p.document_count} records</p>
          ${p.known_allergies && p.known_allergies.length > 0 ? `
            <div style="color: var(--danger); font-size: 0.8rem; font-weight: 600; margin-top: 0.35rem;">
              ⚠️ Allergy: ${p.known_allergies.join(", ")}
            </div>
          ` : ""}
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button class="btn btn-primary btn-small doc-call-patient-btn">
            📹 Consult Patient
          </button>
        </div>
      `;
      card.querySelector(".doc-call-patient-btn").addEventListener("click", () => {
        initiateVideoConsultation({
          doctorId: state.user.id,
          doctorName: state.user.full_name,
          patientId: p.id,
          language: "English",
        });
      });
      container.appendChild(card);
    }
  } catch (err) {
    console.warn("Doctor patient list error:", err);
  }
}

document.getElementById("doc-start-instant-call-btn").addEventListener("click", async () => {
  const patients = await api("/api/patients");
  if (patients.length > 0) {
    initiateVideoConsultation({
      doctorId: state.user.id,
      patientId: patients[0].id,
      doctorName: state.user.full_name,
      language: "English",
    });
  } else {
    showToast("No patient currently selected.", "error");
  }
});

// ---------------------------------------------------------------
// ADMIN VIEW & VERIFICATION
// ---------------------------------------------------------------
async function loadAdminDashboard() {
  await loadAdminStats();
  await loadAdminPendingKyc();
  await loadAdminAuditLogs();
  await loadAdminConsultations();
}

// Admin Subtab switcher
document.querySelectorAll("[data-atab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-atab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.atab;
    document.getElementById("admin-kyc-tab").classList.toggle("hidden", target !== "kyc");
    document.getElementById("admin-audit-tab").classList.toggle("hidden", target !== "audit");
    document.getElementById("admin-consultations-tab").classList.toggle("hidden", target !== "consultations");
  });
});

async function loadAdminStats() {
  try {
    const stats = await api("/api/admin/stats");
    document.getElementById("stat-total-patients").textContent = stats.total_patients;
    document.getElementById("stat-total-doctors").textContent = stats.total_doctors;
    document.getElementById("stat-pending-kyc").textContent = stats.pending_kyc_count;
    document.getElementById("stat-total-consultations").textContent = stats.total_consultations;
  } catch (err) {
    console.warn("Admin stats error:", err);
  }
}

async function loadAdminPendingKyc() {
  const tbody = document.getElementById("admin-kyc-tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align: center;">Loading pending KYC queue...</td></tr>`;
  try {
    const doctors = await api("/api/doctors");
    tbody.innerHTML = "";

    if (doctors.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align: center;">No doctors in system.</td></tr>`;
      return;
    }

    for (const doc of doctors) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>Dr. ${escapeHtml(doc.full_name)}</strong><br><span class="muted" style="font-size: 0.78rem;">${escapeHtml(doc.email)}</span></td>
        <td><code>${escapeHtml(doc.registration_number)}</code></td>
        <td>${escapeHtml(doc.medical_council)}</td>
        <td>${escapeHtml(doc.specialization)}</td>
        <td>${doc.languages.map((l) => `<span class="tag-lang">${escapeHtml(l)}</span>`).join(" ")}</td>
        <td><code>${escapeHtml(doc.aadhaar_masked || "XXXX-XXXX-0000")}</code></td>
        <td>
          <span style="font-size: 0.8rem; color: var(--primary); font-weight: 600;">📄 Aadhaar XML</span><br>
          <span style="font-size: 0.8rem; color: #2563eb; font-weight: 600;">📜 Council Cert</span>
        </td>
        <td>
          ${doc.kyc_status === "pending" ? `
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-success btn-small kyc-approve-btn">Approve</button>
              <button class="btn btn-danger btn-small kyc-reject-btn">Reject</button>
            </div>
          ` : `
            <span class="user-role-pill ${doc.kyc_status === 'verified' ? 'role-doctor' : 'role-admin'}">
              ${doc.kyc_status.toUpperCase()}
            </span>
          `}
        </td>
      `;

      const approveBtn = tr.querySelector(".kyc-approve-btn");
      if (approveBtn) {
        approveBtn.addEventListener("click", async () => {
          await api("/api/admin/doctors/verify", {
            method: "POST",
            body: { doctor_id: doc.id, action: "approve", verification_notes: "Aadhaar UIDAI and Medical Council License Verified." },
          });
          showToast(`Dr. ${doc.full_name} verified and approved!`, "success");
          await loadAdminDashboard();
        });
      }

      const rejectBtn = tr.querySelector(".kyc-reject-btn");
      if (rejectBtn) {
        rejectBtn.addEventListener("click", async () => {
          await api("/api/admin/doctors/verify", {
            method: "POST",
            body: { doctor_id: doc.id, action: "reject", verification_notes: "Aadhaar document name mismatch with medical license." },
          });
          showToast(`Dr. ${doc.full_name} KYC rejected.`, "error");
          await loadAdminDashboard();
        });
      }

      tbody.appendChild(tr);
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="error-text">${err.message}</td></tr>`;
  }
}

async function loadAdminAuditLogs() {
  const tbody = document.getElementById("admin-audit-tbody");
  try {
    const logs = await api("/api/admin/audit-logs");
    tbody.innerHTML = "";
    for (const log of logs) {
      const tr = document.createElement("tr");
      const timeStr = new Date(log.created_at).toLocaleString();
      tr.innerHTML = `
        <td style="white-space: nowrap; font-size: 0.82rem;">${timeStr}</td>
        <td><strong>${escapeHtml(log.actor_name || "System")}</strong></td>
        <td><span class="tag-lang">${escapeHtml(log.action)}</span></td>
        <td>${escapeHtml(log.target_type || "-")}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);"><code>${JSON.stringify(log.details)}</code></td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.warn("Audit logs error:", err);
  }
}

async function loadAdminConsultations() {
  const container = document.getElementById("admin-consultations-list");
  try {
    const consultations = await api("/api/consultations");
    container.innerHTML = "";
    if (consultations.length === 0) {
      container.innerHTML = `<div class="muted" style="padding: 1.5rem;">No consultations logged yet.</div>`;
      return;
    }
    for (const c of consultations) {
      const card = document.createElement("div");
      card.className = "rx-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h3 style="font-size: 1.05rem;">Doctor: ${escapeHtml(c.doctor_name)} → Patient: ${escapeHtml(c.patient_name)}</h3>
            <p class="muted" style="font-size: 0.82rem;">Language: ${escapeHtml(c.language_used)} · Scheduled: ${new Date(c.scheduled_at).toLocaleString()}</p>
          </div>
          <span class="user-role-pill role-doctor">${c.status.toUpperCase()}</span>
        </div>
        ${c.problem_description ? `<p style="font-size: 0.88rem; margin-top: 0.5rem;"><strong>Problem:</strong> ${escapeHtml(c.problem_description)}</p>` : ""}
        ${c.diagnosis_cure ? `<p style="font-size: 0.88rem; margin-top: 0.25rem;"><strong>Diagnosis/Cure:</strong> ${escapeHtml(c.diagnosis_cure)}</p>` : ""}
      `;
      container.appendChild(card);
    }
  } catch (err) {
    console.warn("Admin consultations error:", err);
  }
}

// ---------------------------------------------------------------
// VIDEO CALL & CAMERA ACCESS (WebRTC / getUserMedia)
// ---------------------------------------------------------------
async function initiateVideoConsultation({ doctorId, doctorName, patientId, specialization, language }) {
  try {
    const consultation = await api("/api/consultations", {
      method: "POST",
      body: {
        doctor_id: doctorId,
        patient_id: patientId || state.user.id,
        language_used: language || "English",
        status: "in_progress",
      },
    });

    openVideoRoom({
      consultationId: consultation.id,
      patientId: consultation.patient_id,
      participantName: doctorName || `Dr. ${consultation.doctor_name}`,
      subtitle: `${specialization || "Clinician"} · Telemedicine`,
      avatar: "👨‍⚕️",
    });
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function openVideoRoom({ consultationId, patientId, participantName, subtitle, avatar }) {
  state.activeConsultationId = consultationId;
  const modal = document.getElementById("video-modal");
  modal.classList.remove("hidden");

  document.getElementById("remote-participant-name").textContent = participantName || "Consulting Doctor";
  document.getElementById("remote-participant-subtitle").textContent = subtitle || "Verified Healthcare Provider";
  document.getElementById("remote-avatar-icon").textContent = avatar || "👨‍⚕️";

  // Pre-fill initial drug row
  const medsList = document.getElementById("incall-medications-list");
  medsList.innerHTML = "";
  addMedicationRow("Paracetamol 650mg", "1 Tablet", "1-0-1 (Morning & Night)", "3 days", "After food");

  // Start Call Elapsed Timer
  state.callSeconds = 0;
  clearInterval(state.callTimerInterval);
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const mins = String(Math.floor(state.callSeconds / 60)).padStart(2, "0");
    const secs = String(state.callSeconds % 60).padStart(2, "0");
    document.getElementById("call-timer").textContent = `${mins}:${secs}`;
  }, 1000);

  // Acquire Real Camera & Microphone Access via WebRTC getUserMedia
  await startLocalCameraStream();
}

async function startLocalCameraStream() {
  const localVideo = document.getElementById("local-video");
  const camOffBox = document.getElementById("cam-off-placeholder");

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      state.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      localVideo.srcObject = state.mediaStream;
      localVideo.classList.remove("hidden");
      camOffBox.classList.add("hidden");
      state.isCameraOn = true;
      state.isMicOn = true;
      showToast(I18N.t("cameraActive"), "success");
    } else {
      throw new Error("getUserMedia not supported in this environment");
    }
  } catch (err) {
    console.warn("Camera access fallback:", err.message);
    localVideo.classList.add("hidden");
    camOffBox.classList.remove("hidden");
    camOffBox.innerHTML = `<span>📷 Virtual Camera Mode (Live Preview)</span>`;
    showToast(I18N.t("cameraError"), "normal");
  }
}

function stopLocalCameraStream() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
  clearInterval(state.callTimerInterval);
}

// Video Controls
document.getElementById("btn-toggle-cam").addEventListener("click", () => {
  state.isCameraOn = !state.isCameraOn;
  const btn = document.getElementById("btn-toggle-cam");
  const localVideo = document.getElementById("local-video");
  const camOffBox = document.getElementById("cam-off-placeholder");

  if (state.mediaStream) {
    const videoTracks = state.mediaStream.getVideoTracks();
    videoTracks.forEach((t) => (t.enabled = state.isCameraOn));
  }

  if (state.isCameraOn) {
    btn.classList.remove("active-off");
    localVideo.classList.remove("hidden");
    camOffBox.classList.add("hidden");
    showToast("Camera On", "normal");
  } else {
    btn.classList.add("active-off");
    localVideo.classList.add("hidden");
    camOffBox.classList.remove("hidden");
    camOffBox.textContent = "Camera Off";
    showToast("Camera Off", "normal");
  }
});

document.getElementById("btn-toggle-mic").addEventListener("click", () => {
  state.isMicOn = !state.isMicOn;
  const btn = document.getElementById("btn-toggle-mic");
  if (state.mediaStream) {
    const audioTracks = state.mediaStream.getAudioTracks();
    audioTracks.forEach((t) => (t.enabled = state.isMicOn));
  }
  if (state.isMicOn) {
    btn.classList.remove("active-off");
    showToast("Microphone Unmuted", "normal");
  } else {
    btn.classList.add("active-off");
    showToast("Microphone Muted", "normal");
  }
});

document.getElementById("btn-end-call").addEventListener("click", () => {
  closeVideoRoom();
});

document.getElementById("close-video-modal-btn").addEventListener("click", () => {
  closeVideoRoom();
});

function closeVideoRoom() {
  stopLocalCameraStream();
  document.getElementById("video-modal").classList.add("hidden");
  showToast("Consultation call ended.", "normal");
  if (state.user) {
    if (state.user.role === "patient") loadPatientPrescriptions();
    if (state.user.role === "doctor") loadDoctorConsultationsQueue();
  }
}

// Dynamic Medication Row Builder in Clinical Drawer
document.getElementById("btn-add-medication-row").addEventListener("click", () => {
  addMedicationRow();
});

function addMedicationRow(name = "", dose = "", freq = "1-0-1", dur = "5 days", inst = "After food") {
  const container = document.getElementById("incall-medications-list");
  const row = document.createElement("div");
  row.className = "medication-entry-row";
  row.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <input type="text" class="med-name" placeholder="Drug Name (e.g. Amoxicillin 500mg)" value="${escapeHtml(name)}" required style="flex: 1; padding: 0.4rem;" />
      <button type="button" class="btn btn-ghost btn-small remove-med-btn" style="color: var(--danger); margin-left: 0.5rem;">✕</button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
      <input type="text" class="med-dose" placeholder="Dose (1 tab)" value="${escapeHtml(dose)}" style="padding: 0.4rem;" />
      <input type="text" class="med-freq" placeholder="Freq (1-0-1)" value="${escapeHtml(freq)}" style="padding: 0.4rem;" />
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
      <input type="text" class="med-dur" placeholder="Duration (5 days)" value="${escapeHtml(dur)}" style="padding: 0.4rem;" />
      <input type="text" class="med-inst" placeholder="Timing (After food)" value="${escapeHtml(inst)}" style="padding: 0.4rem;" />
    </div>
  `;
  row.querySelector(".remove-med-btn").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

// Doctor submits Clinical Diagnosis, Cure Plan & Prescription
document.getElementById("incall-rx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.activeConsultationId) {
    showToast("No active consultation session found.", "error");
    return;
  }

  const problem_description = document.getElementById("incall-problem").value.trim();
  const diagnosis_cure = document.getElementById("incall-cure").value.trim();
  const general_advice = document.getElementById("incall-advice").value.trim();
  const follow_up_date = document.getElementById("incall-followup").value;

  const rows = document.querySelectorAll("#incall-medications-list .medication-entry-row");
  const medications = [];
  rows.forEach((r) => {
    const name = r.querySelector(".med-name").value.trim();
    const dosage = r.querySelector(".med-dose").value.trim();
    const frequency = r.querySelector(".med-freq").value.trim();
    const duration = r.querySelector(".med-dur").value.trim();
    const instructions = r.querySelector(".med-inst").value.trim();
    if (name) {
      medications.push({ name, dosage, frequency, duration, instructions });
    }
  });

  try {
    await api("/api/consultations/prescribe", {
      method: "POST",
      body: {
        consultation_id: state.activeConsultationId,
        patient_id: state.user.id, // Doctor is prescribing
        problem_description,
        diagnosis_cure,
        medications,
        general_advice,
        follow_up_date,
      },
    });

    showToast("Prescription and cure plan issued successfully!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---------------------------------------------------------------
// DOCUMENT UPLOAD
// ---------------------------------------------------------------
const uploadBtn = document.getElementById("patient-upload-doc-btn");
if (uploadBtn) {
  uploadBtn.addEventListener("click", () => {
    document.getElementById("upload-modal").classList.remove("hidden");
  });
}

document.getElementById("close-upload-modal-btn").addEventListener("click", () => {
  document.getElementById("upload-modal").classList.add("hidden");
});

document.getElementById("upload-doc-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const docType = document.getElementById("up-doc-type").value;
  const docDate = document.getElementById("up-doc-date").value;
  const fileInput = document.getElementById("up-doc-file");
  if (!fileInput.files || fileInput.files.length === 0) return;

  const patients = await api("/api/patients");
  if (patients.length === 0) {
    showToast("No patient profile found.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("doc_type", docType);
  if (docDate) formData.append("document_date", docDate);

  try {
    await api(`/api/documents/upload?patient_id=${patients[0].id}`, {
      method: "POST",
      body: formData,
      isForm: true,
    });
    showToast("Medical file uploaded & processed by OCR engine!", "success");
    document.getElementById("upload-modal").classList.add("hidden");
    await loadPatientTimeline();
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------
// App Initialization
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  I18N.applyTranslations();
  if (state.token && state.user) {
    showApp();
  } else {
    showAuth();
  }
});
