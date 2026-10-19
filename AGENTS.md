# Architecture rules

- Patient medicine discovery, cart and checkout use only `medications_public`; raw pharmacy inventory stays private to its owner.
- Medicine publication and legacy normalization run in the authenticated Firebase action dispatcher, with transactional pharmacy approval and ownership checks; the token-forwarding Firestore adapter is not a privileged write boundary.
- Legacy recovery requires an explicit pharmacy request and preserves archived, demo and explicit bulk-publication opt-out states; missing prescription classification requires pharmacy review.
- Doctor slots, reservations and verified confirmation run in the authenticated Firebase action dispatcher; calendar and admin reads use the canonical doctor_appointments record, not client mirrors.
- Delivery assignment and pickup codes are created by trusted driver acceptance, never fabricated by the pharmacy UI; package tracking matches order_group_id as well as legacy order_id.
- Quotation and grouped medication payments are initialized and verified in the authenticated Firebase dispatcher against persisted patient, target, reference and exact ZAR amount; only transactional verification unlocks assignment or delivery.
- Shared headers, booking screens and footers use Brand so the logo and name remain consistent across roles.