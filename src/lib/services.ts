// Pharmacy services patients can search & book for.
export const PHARMACY_SERVICES = [
  "Vaccinations",
  "Blood Pressure Check",
  "Blood Sugar Test",
  "Cholesterol Test",
  "HIV Testing",
  "Pregnancy Test",
  "Wound Care",
  "Pharmacist Consultation",
  "Medication Review",
  "Family Planning",
  "Chronic Medication",
  "Travel Health",
  "Flu Shots",
  "Minor Ailments",
] as const;

export type PharmacyService = (typeof PHARMACY_SERVICES)[number];

export const DOCTOR_SPECIALTIES = [
  "General Practitioner",
  "Paediatrician",
  "Cardiologist",
  "Dermatologist",
  "Gynaecologist",
  "Psychiatrist",
  "Psychologist",
  "ENT Specialist",
  "Ophthalmologist",
  "Orthopaedic Surgeon",
  "Neurologist",
  "Endocrinologist",
  "Urologist",
  "Dentist",
  "Physiotherapist",
] as const;
