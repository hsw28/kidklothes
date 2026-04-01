# BST + Pro Launch Rules

This note documents the intended BST monetization rules for the public launch-learning phase.

## Free vs Pro

Free users can:
- Create 1 active BST sale draft at a time
- Generate and share full collage pages
- Generate item cards for up to 2 chosen items per draft
- Edit all items in the draft
- Add 1 photo per inventory item

Pro users can:
- Create unlimited BST sale drafts
- Generate item cards for every item in a draft
- Add multiple photos per inventory item

Developer override:
- Hidden developer mode can force Pro access on locally
- The override bypasses all BST and photo limits

## What counts as an active draft

An active BST draft is any sale draft whose status is not `archived`.

That means:
- `draft` counts toward the free limit
- `exported` also still counts unless product rules change later
- `archived` does not count toward the free limit

## Free item-card selection rule

Free users can choose any 2 included items in a draft for generated item cards.

Important behavior:
- The selection is stored on the draft as `freeGeneratedCardItemIds`
- If one of those selected draft items is removed from the draft later, that id is cleaned up automatically
- The freed slot becomes available again, so the user can choose another included item within the same 2-card allowance

This is the intended product behavior for launch.

## Photo limits for downgraded / non-Pro users

If an item already has multiple photos from a prior Pro or developer session:
- All existing photos remain visible
- The user can still view and remove photos
- The app must not silently delete extra photos
- Adding additional photos remains locked unless the user currently has Pro access

Free-plan messaging should explain:
- Free includes 1 photo per item
- Pro is for adding back/tag/flaw/detail photos

## BST photo resolution

BST uses item photos in this order:
1. `sale_draft_items.selectedPhotoUri`, but only if that URI still matches one of the item’s current photos
2. Otherwise the item’s primary display photo, which resolves from the canonical item image fields

If a previously selected BST photo disappears from the item, BST should fall back gracefully to the current first/display image.

## Analytics expectations

Launch-readiness analytics should answer:
- How often users reach BST from Sell Bin
- How often they create drafts
- Where free users hit card, draft, or photo limits
- Whether the paywall converts after those limit hits
- Whether free users understand collage vs card behavior
