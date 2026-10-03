# Responsive dashboard stabilization

## Scope
Improve the current HealthReachCare interface on small phones and wide screens without redesigning dashboards or changing workflows.

## Changes
- Strengthen the shared dashboard shell so pages cannot cause horizontal overflow.
- Make the mobile menu fit 320–390 px screens and keep touch targets readable.
- Adjust the patient dashboard’s action cards, tracking header, codes, and table for narrow screens while keeping a constrained wide-screen layout.
- Adjust the Firebase admin header, navigation tiles, records, and action buttons for small phones and wide monitors.
- Fix the highest-impact narrow-screen form grids in address, reminder, and pharmacy screens.

## Validation
- Check representative public, patient, and admin screens at mobile and desktop widths.
- Confirm the app builds cleanly and no controls overlap or clip.

## Larger redesign
A full visual replacement of every dashboard is outside this pass. With about 8 build credits remaining, use shared responsive fixes now and redesign one role dashboard at a time later.
