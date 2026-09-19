import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("Running automated end-to-end verification...")

# 1. Health check
res = client.get("/api/health")
assert res.status_code == 200, f"Health check failed: {res.text}"
print("[PASS] Health check OK:", res.json())

# 2. Doctor Login
res = client.post("/api/auth/login", data={"username": "doctor@medisync.local", "password": "DoctorPass123!"})
assert res.status_code == 200, f"Doctor login failed: {res.text}"
doc_token = res.json()["access_token"]
doc_user = res.json()["user"]
assert doc_user["role"] == "doctor"
print("[PASS] Doctor Login OK:", doc_user["full_name"], f"({doc_user['role']})")

# 3. Patient Login
res = client.post("/api/auth/login", data={"username": "patient@medisync.local", "password": "PatientPass123!"})
assert res.status_code == 200, f"Patient login failed: {res.text}"
pat_token = res.json()["access_token"]
pat_user = res.json()["user"]
assert pat_user["role"] == "patient"
print("[PASS] Patient Login OK:", pat_user["full_name"], f"({pat_user['role']})")

# 4. Admin Login
res = client.post("/api/auth/login", data={"username": "admin@medisync.local", "password": "AdminPass123!"})
assert res.status_code == 200, f"Admin login failed: {res.text}"
admin_token = res.json()["access_token"]
admin_user = res.json()["user"]
assert admin_user["role"] == "admin"
print("[PASS] Admin Login OK:", admin_user["full_name"], f"({admin_user['role']})")

# 5. Language Matchmaking - Tamil
res = client.get("/api/doctors/match?language=Tamil", headers={"Authorization": f"Bearer {pat_token}"})
assert res.status_code == 200, f"Matchmaking failed: {res.text}"
tamil_docs = res.json()
assert len(tamil_docs) > 0
top_doc = tamil_docs[0]
assert "Tamil" in top_doc["languages"]
print(f"[PASS] Language Matchmaking (Tamil) OK: Top match is {top_doc['full_name']} with {top_doc['match_score']}% match")

# 6. Language Matchmaking - Hindi
res = client.get("/api/doctors/match?language=Hindi", headers={"Authorization": f"Bearer {pat_token}"})
assert res.status_code == 200
hindi_docs = res.json()
assert "Hindi" in hindi_docs[0]["languages"]
print(f"[PASS] Language Matchmaking (Hindi) OK: Top match is {hindi_docs[0]['full_name']} with {hindi_docs[0]['match_score']}% match")

# 7. Admin Stats
res = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
assert res.status_code == 200
stats = res.json()
assert stats["total_doctors"] >= 3
assert stats["pending_kyc_count"] >= 1
print("[PASS] Admin Stats OK:", stats)

# 8. Admin Pending KYC Review & Approve
res = client.get("/api/admin/doctors/pending-kyc", headers={"Authorization": f"Bearer {admin_token}"})
assert res.status_code == 200
pending_docs = res.json()
assert len(pending_docs) >= 1
target_pending_id = pending_docs[0]["id"]
print(f"[PASS] Found pending doctor for verification: {pending_docs[0]['full_name']} (Reg: {pending_docs[0]['registration_number']})")

# Approve doctor KYC
res = client.post(
    "/api/admin/doctors/verify",
    headers={"Authorization": f"Bearer {admin_token}"},
    json={"doctor_id": target_pending_id, "action": "approve", "verification_notes": "UIDAI biometric and degree verified."},
)
assert res.status_code == 200, f"KYC approval failed: {res.text}"
print("[PASS] Admin Doctor KYC Verification Approved OK:", res.json())

# 9. Consultation creation & Clinical Prescribing (Problem, Cure & Medications)
res = client.post(
    "/api/consultations",
    headers={"Authorization": f"Bearer {pat_token}"},
    json={"doctor_id": doc_user["id"], "patient_id": pat_user["id"], "language_used": "Hindi"},
)
assert res.status_code == 201, f"Create consultation failed: {res.text}"
consultation_id = res.json()["id"]
print(f"[PASS] Patient initiated video consultation ID: {consultation_id}")

# Doctor writes Problem, Diagnosis/Cure, and Prescribes Medications
res = client.post(
    "/api/consultations/prescribe",
    headers={"Authorization": f"Bearer {doc_token}"},
    json={
        "consultation_id": consultation_id,
        "patient_id": pat_user["id"],
        "problem_description": "High fever, chills, persistent dry cough, body aches for 3 days.",
        "diagnosis_cure": "Viral Upper Respiratory Infection. Advised rest, steam inhalation twice daily, and oral hydration.",
        "follow_up_date": "2026-09-26",
        "medications": [
            {"name": "Paracetamol 650mg", "dosage": "1 tablet", "frequency": "1-0-1 (Morning & Night)", "duration": "3 days", "instructions": "After meals"},
            {"name": "Azithromycin 500mg", "dosage": "1 tablet", "frequency": "1-0-0 (Once daily)", "duration": "3 days", "instructions": "After lunch"},
        ],
        "general_advice": "Drink warm water, avoid chilled foods.",
    },
)
assert res.status_code == 200, f"Prescription failed: {res.text}"
consult_result = res.json()
assert consult_result["prescription"] is not None
assert len(consult_result["prescription"]["medications"]) == 2
print("[PASS] Doctor prescribed Problem, Cure, and Medications OK! Prescription count:", len(consult_result["prescription"]["medications"]))

# 10. Patient retrieves their Prescriptions
res = client.get("/api/consultations", headers={"Authorization": f"Bearer {pat_token}"})
assert res.status_code == 200
pat_consults = res.json()
assert len(pat_consults) >= 1
print("[PASS] Patient retrieved their digital prescriptions list OK! Total consults:", len(pat_consults))

# 11. Notifications
res = client.get("/api/notifications", headers={"Authorization": f"Bearer {pat_token}"})
assert res.status_code == 200
notifs = res.json()
assert len(notifs) >= 1
print(f"[PASS] Notifications retrieved for patient OK: {len(notifs)} notification(s)")

print("\nAll 11 automated test suites PASSED with 100% success!")
