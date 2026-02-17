# Runtime Validation Report (Post-refactor)

Date: 2026-02-17
Scope: Beer log / Exercise log / Daily check / Aggregation / PWA-offline runtime path

## Executed runtime checks

1. Launch app with onboarding bypass (`nomutore_onboarding_complete=true`) and real browser runtime.
2. Trigger save flows using UI custom events actually consumed by `ui/index.js` listeners:
   - `save-beer` (add + update)
   - `save-exercise` (add + update)
   - `save-check` (save)
   - `request-delete-log` (delete)
3. Verify IndexedDB (`NomutoreDB`) records after each event via Dexie in browser context.
4. Verify dry-day contradiction behavior by saving dry day then adding beer on same day.
5. Verify custom beer edit round-trip by opening edit modal from saved log.

## Observed confirmed breakage

### 1) Custom beer amount is lost on edit (critical)
- Runtime result:
  - Stored log has `rawAmount: 500`, `ml: null`
  - Edit modal input `#custom-amount` shows `350`
- Why it breaks:
  - Save path stores amount into `rawAmount` (`Service.saveBeerLog`)
  - Edit path reads `log.ml` instead of `log.rawAmount` (`openBeerModal`)
  - Therefore custom amount silently resets to default when edited and re-saved.

## Observed consistency checks (passed)

- Dry-day contradiction auto resolution works:
  - `save-check` with `isDryDay:true` then `save-beer` same day results in `checks.isDryDay=false`.
- Exercise/beer CRUD runtime with returned result object + UI refresh path works through event listeners in `ui/index.js`.

## Risk notes (potential)

1. Check `weight` is stored as string in DB from `saveDailyCheck` input payload.
   - It often works due JS coercion, but numeric assumptions can break in strict comparisons/formatting.
2. Daily check date matching uses calendar day (`startOf('day')` / `endOf('day')`) while beer dry-day cancellation uses virtual day (`getVirtualDate`), which can diverge around midnight-4AM.
3. Save-check listener has no submit lock in `ui/index.js`; rapid double taps can race before dedup/update logic settles.

