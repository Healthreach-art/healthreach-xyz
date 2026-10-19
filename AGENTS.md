# Architecture rules

- Patient medicine discovery, cart and checkout use only `medications_public`; raw pharmacy inventory stays private to its owner.
- Medicine publication and legacy normalization run in the authenticated Firebase action dispatcher, with transactional pharmacy approval and ownership checks; the token-forwarding Firestore adapter is not a privileged write boundary.
- Legacy recovery requires an explicit pharmacy request and preserves archived, demo and explicit bulk-publication opt-out states; missing prescription classification requires pharmacy review.