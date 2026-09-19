# MediSync

AI-assisted healthcare information management. MediSync pulls a patient's
scattered documents — prescriptions, lab reports, consultation notes, scans,
discharge summaries — into one chronological timeline, and automatically
flags missing or conflicting information (allergy/medication matches,
inconsistent dosages, undated documents) for a clinician to review.

**MediSync organizes and surfaces information. It does not diagnose,
prescribe, or make medical decisions — those stay with qualified healthcare
professionals**, and every automated flag is designed to be checked in a
few seconds, not trusted blindly.

This repository contains a complete, runnable full-stack implementation:

- `backend/` — FastAPI + SQLite REST API: multi-role authentication (Doctor, Patient, Admin),
  UIDAI E-KYC doctor verification, language-based matchmaking, clinical consultation & prescriptions
  (problem, cure, medications), in-app notifications, and document OCR timeline.
- `frontend/` — Light Theme single-page application with accessible typography, 11-language
  localization (i18n), WebRTC video consultation with camera access, and role-specific portals.

---

## Quick Demo Accounts (1-Click Fill on Login Page)

The login screen includes one-click demo login buttons for all roles:

- **Doctor Account**: `doctor@medisync.local` / `DoctorPass123!` (Dr. Rajesh Sharma, MD, Hindi/Punjabi/English, UIDAI Verified)
- **Doctor 2 (South India languages)**: `doctor2@medisync.local` / `DoctorPass123!` (Dr. Priya Sundaram, Tamil/Malayalam/Telugu/English)
- **Doctor 3 (Pending KYC for Admin review)**: `doctor.pending@medisync.local` / `DoctorPass123!` (Dr. Amit Patel, Gujarati/Marathi/Hindi)
- **Patient Account 1**: `patient@medisync.local` / `PatientPass123!` (Asha Verma, Preferred: Hindi)
- **Patient Account 2**: `patient2@medisync.local` / `PatientPass123!` (Kavitha Murugan, Preferred: Tamil)
- **Administrator Account**: `admin@medisync.local` / `AdminPass123!` (System Admin - observes operations & verifies doctor KYC)

---

## 1. Run the backend

Requires **Python 3.10+**.

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
python seed_demo.py              # Seeds demo accounts, KYC documents & sample consultations
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000`. Interactive API docs (Swagger
UI) are auto-generated at `http://localhost:8000/docs`.

## 2. Run the frontend

No build step — it's plain HTML/CSS/JS. Simplest option, from the
`frontend/` directory:

```bash
cd frontend
python3 -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

By default the frontend calls the API at `http://localhost:8000`. To point
it elsewhere (e.g. a deployed backend), set this before `app.js` loads —
add a line to `index.html` right above `<script src="app.js">`:

```html
<script>window.MEDISYNC_API_BASE = "https://your-api-host.example.com";</script>
```

## 3. Try it out

1. Sign in with the seeded demo account, or register a new one.
2. Create a patient (or use the seeded "Asha Verma").
3. Upload a document — try a `.txt` file first since it needs no OCR setup.
   A sample is below.
4. Watch it appear on the **Timeline** tab, and check the **Flags** tab for
   anything MediSync noticed automatically.

**Sample prescription text** (save as `sample_rx.txt` and upload as type
"Prescription" to see extraction + a conflict flag against the seeded
patient's Penicillin allergy):

```
Consultation Note - City Clinic
Date: 2024-03-15

Diagnosis: Upper respiratory tract infection

Medications:
Amoxicillin 500mg - twice daily

Allergies: none reported by patient today
```

---

## How the "AI" layer works, and how to extend it

Document intelligence lives entirely in `backend/app/services/`:

- **`extraction.py`** — turns a file into text (PDF text layer, else OCR via
  Tesseract) and then into structured fields (medications, dosages,
  diagnoses, allergies, lab values, dates) using a transparent, inspectable
  set of regex/keyword rules. Every router and the conflict engine depend
  only on the `structured_data` dict shape documented at the top of that
  file — **not** on how it was produced. That means you can swap
  `extract_fields()` for a call to a real medical NLP model or an LLM (for
  example the Anthropic API) without touching anything else in the app.
- **`conflicts.py`** — re-scans a patient's full document set on every
  upload/edit/delete and raises explainable flags: allergy vs. prescribed
  medication matches, conflicting dosages for the same drug across
  prescriptions, undated documents, and missing allergy status. Each flag
  names exactly which document(s) and field(s) triggered it.

## Architecture notes / production hardening checklist

This is a complete, working MVP, not a production deployment. Before real
patient data touches this:

- **Compliance**: handling real PHI requires HIPAA (or local equivalent)
  compliant infrastructure — encryption at rest, audit logging of every
  record access, a signed BAA with any cloud provider, access controls
  beyond the simple role field here, etc. None of that is in place yet.
- **Secrets**: set `MEDISYNC_SECRET_KEY` to a strong random value via
  environment variable; the default in `config.py` is dev-only.
- **CORS**: `main.py` currently allows all origins for local development —
  restrict `allow_origins` to your real frontend domain.
- **File storage**: documents are stored on local disk under
  `backend/storage/`. For production, use encrypted object storage
  (e.g. S3 with server-side encryption) instead.
- **Extraction pipeline**: runs synchronously inside the upload request.
  Move it to a background worker (Celery, RQ, or FastAPI `BackgroundTasks`
  backed by a queue) once documents are large/numerous, and add retry logic.
- **Database**: SQLite is fine for a demo; move to PostgreSQL for
  concurrent multi-user use.
- **Auth**: add password reset, MFA, and session revocation before any
  real clinical use; the current JWT setup is intentionally minimal.
