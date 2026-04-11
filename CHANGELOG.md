# Changelog

## [1.4.0](https://github.com/RyRy79261/intake-tracker/compare/v1.3.0...v1.4.0) (2026-04-11)


### Features

* **quick-260410-ho9:** add caffeine and alcohol rows to weekly summary grid (GH-35) ([c3386d5](https://github.com/RyRy79261/intake-tracker/commit/c3386d5f766e5c03308a646217b37cdb444951a1))
* **quick-260410-ho9:** ai parse returns explicit salt vs sodium indicator (GH-33) ([761a320](https://github.com/RyRy79261/intake-tracker/commit/761a32083a1d9ab7cd755b17f78bcb3e21dc0ef3))
* **quick-260410-ho9:** display heart rate and BP delta in quick view header ([287e9ef](https://github.com/RyRy79261/intake-tracker/commit/287e9ef4fafeaaeb038399db504a2ae4b1464dd7))
* **quick-260410-ho9:** inline editing replaces modal dialogs in card components (GH-34) ([08bdf96](https://github.com/RyRy79261/intake-tracker/commit/08bdf96abae34f1c0508f33915b3be1810cf68f4))
* show beverage labels in recent entries and add water tab presets ([1900d1e](https://github.com/RyRy79261/intake-tracker/commit/1900d1ee7d7c918f31430daab7c228aea1ce21c7))


### Bug Fixes

* address CodeRabbit review findings (a11y, types, keys) ([6c8d5f7](https://github.com/RyRy79261/intake-tracker/commit/6c8d5f7b81b342e8f18eeea2d1c63056e2d674c9))
* address CodeRabbit review findings (a11y, types, keys) ([9fd7e52](https://github.com/RyRy79261/intake-tracker/commit/9fd7e5294d7d676e6ac7a651eb7da2f67b1247f3))
* **quick-260410-ho9:** remove default auto-generated insights (GH-32) ([7491f97](https://github.com/RyRy79261/intake-tracker/commit/7491f97269e9d2c81c0680f79852c920660a9fc0))
* resolve issues [#31](https://github.com/RyRy79261/intake-tracker/issues/31)-[#35](https://github.com/RyRy79261/intake-tracker/issues/35) (BP view, insights, AI salt, inline edit, weekly summary) ([81eaf78](https://github.com/RyRy79261/intake-tracker/commit/81eaf78ec192fffee799ae6c58fff93000e556b6))
* use shadcn Checkbox component in BP inline edit form ([5378d5f](https://github.com/RyRy79261/intake-tracker/commit/5378d5f9e2d7c33096ebde8b032df909b5bff6c1))

## [1.3.0](https://github.com/RyRy79261/intake-tracker/compare/v1.2.0...v1.3.0) (2026-04-09)


### Features

* **260409-hqu:** add Footer Items drag-reorder list to Quick Nav settings ([7a15ffe](https://github.com/RyRy79261/intake-tracker/commit/7a15ffe2df7b76d243387373cb15aab3ed55b65f))
* **260409-hqu:** add quickNavItems to settings store ([e61550d](https://github.com/RyRy79261/intake-tracker/commit/e61550d5f958edb7dfef82c6d8ad064411e5b1a6))
* configurable quick-nav footer with drag-reorder ([393c896](https://github.com/RyRy79261/intake-tracker/commit/393c8964d7115b625b8ae4ebbf5bc40d27f1ef38))


### Bug Fixes

* **260409-hqu:** count full beverage volume as water intake ([6701286](https://github.com/RyRy79261/intake-tracker/commit/6701286076305ff0ee927adea0b5a9b3b22cf4d1))
* **260409-hqu:** narrow quick-nav footer to 6 root-card items ([e8d0efe](https://github.com/RyRy79261/intake-tracker/commit/e8d0efe5f8c3b589591e6410b7b4cafbde4da9c0))

## [1.2.0](https://github.com/RyRy79261/intake-tracker/compare/v1.1.0...v1.2.0) (2026-04-09)


### Features

* **01-02:** extend Prescription with compound fields, Dexie v16 ([6c8f88d](https://github.com/RyRy79261/intake-tracker/commit/6c8f88dbc0b63cf32f92ae59ba18dd88ef44fe95))
* **01-05:** compound details drawer with AI refresh diff, expandable indication ([3209139](https://github.com/RyRy79261/intake-tracker/commit/3209139ab9c941407bbdb3540a29a18932fbc957))
* **01-07:** settings restructure with accordion presets, remove dead sections ([23ab603](https://github.com/RyRy79261/intake-tracker/commit/23ab6036cabe28bbab9f5ec5dabce7332245d120))
* **260409-0l6:** move recent entries to card level, add beverage quick-set sizes ([e950009](https://github.com/RyRy79261/intake-tracker/commit/e95000994afae46984a673d688f27e09044a836f))
* liquid tracker bug fixes and UX improvements ([cac4350](https://github.com/RyRy79261/intake-tracker/commit/cac43507dac195088bc328a03097333e21514ad5))


### Bug Fixes

* **01-01:** remove caffeine/alcohol from quick-nav, wrap med tabs, stack export buttons ([12835d0](https://github.com/RyRy79261/intake-tracker/commit/12835d007d66cadf960b5367e9016f7b5a45d3b1))
* **01-03:** inventory deduction, creation-day filter, Mark All time picker ([e6ce7c3](https://github.com/RyRy79261/intake-tracker/commit/e6ce7c3a3b1e8e1a524a11d3b339039c6e38c2c4))
* **01-04:** dose formatting to parenthetical, brand name display, pill organizer collapsed view ([49b77fa](https://github.com/RyRy79261/intake-tracker/commit/49b77fa3e693f527b6be3f0f36b703d572615044))
* **01-06:** adherence excludes future doses, editable insight thresholds ([b8907f8](https://github.com/RyRy79261/intake-tracker/commit/b8907f83deae7f66ca4c7ce47f2da234ee70da74))
* **01:** revise plans based on checker feedback ([ee59284](https://github.com/RyRy79261/intake-tracker/commit/ee59284fce448bea71efc93bdbcc604b52ed3553))
* **260409-0l6:** prevent double water record on preset tap ([8ca6a7d](https://github.com/RyRy79261/intake-tracker/commit/8ca6a7d1214c963e1846a99863eaf1d5a0f647f6))
* truncate long labels in recent entries list ([05a74a7](https://github.com/RyRy79261/intake-tracker/commit/05a74a7ae50f341f5c2354833b0ab36edd4cc53b))

## [1.1.0](https://github.com/RyRy79261/intake-tracker/compare/v1.0.0...v1.1.0) (2026-04-06)


### Features

* v1.4 Post-Release Fixes ([59dbdb6](https://github.com/RyRy79261/intake-tracker/commit/59dbdb69779a2a9eddf4eae86252cb367bf80f77))


### Bug Fixes

* **e2e:** update dashboard tests for food section restructure ([c071cfb](https://github.com/RyRy79261/intake-tracker/commit/c071cfb47a94826781e6dbb122f200a2379a2e34))
* **lint:** move db query from food-section to useSaltTotalsByGroupIds hook ([2a27932](https://github.com/RyRy79261/intake-tracker/commit/2a279324a8f8f914b9d6c74a1c775ce1698e7160))
* **presets:** make addLiquidPreset return generated UUID ([7c03b74](https://github.com/RyRy79261/intake-tracker/commit/7c03b749a000b58e9a68c9e4f19af3a434164737))
* **presets:** pass new preset ID to composable entry on save-and-log ([6b57b84](https://github.com/RyRy79261/intake-tracker/commit/6b57b840ac673c6a49c769b46a3b052298d189aa))
* **release:** sync version to 1.4.0 in manifest and package.json ([5984ba7](https://github.com/RyRy79261/intake-tracker/commit/5984ba796cd449826bb3ab2e21826bb001b6ea49))

## 1.0.0 (2026-04-06)


### Features

* **06-01:** add compound list and compound card components ([3241e3f](https://github.com/RyRy79261/intake-tracker/commit/3241e3f4b2edfb07361e9832dd7290c376bb69d6))
* **06-01:** restructure medication tabs and add shared utilities ([226836e](https://github.com/RyRy79261/intake-tracker/commit/226836e5c969f4b863976154b61aebb5f583dc03))
* **06-02:** add expanded compound card view and brand switch picker ([890a962](https://github.com/RyRy79261/intake-tracker/commit/890a962c8d1d1828dc7ce465855b48245fbd527c))
* **06-02:** wire expand/collapse into compound card with chevron ([4dee4e4](https://github.com/RyRy79261/intake-tracker/commit/4dee4e44c555b86bac656f248641feb9d980e693))
* **06-03:** add dose sub-components for schedule dashboard ([27bde99](https://github.com/RyRy79261/intake-tracker/commit/27bde99a011854348dba7fb1929d54e213f54f41))
* **06-03:** rebuild schedule view with DoseSlot data and inline actions ([672b50a](https://github.com/RyRy79261/intake-tracker/commit/672b50ac8f6085be38ed8c3f1c2c8883471c0ae9))
* **06-04:** dose detail dialog with Untake action and DoseSlot migration ([d2a17af](https://github.com/RyRy79261/intake-tracker/commit/d2a17af4cb0d0f411a208c13efea1884cc01b664))
* **06-04:** retroactive time picker and past-date Take flow ([dab144f](https://github.com/RyRy79261/intake-tracker/commit/dab144f617dfb9c40912547446544dc29f1e3d99))
* **06-05:** expanded card dosage display, add-med button, editable refills ([84a4dd5](https://github.com/RyRy79261/intake-tracker/commit/84a4dd59677075ac92859a3f6b5af2fbe21b3776))
* **06-06:** prescription card and prescriptions list view ([368ebf2](https://github.com/RyRy79261/intake-tracker/commit/368ebf2f400162a0e81ae490961638048db14caf))
* **06-06:** prescription detail drawer with phases and notes ([6c8cea3](https://github.com/RyRy79261/intake-tracker/commit/6c8cea32507e399b9f39a31f24ea0f07780e6646))
* **06-07:** AI auto-select dosage strength and prescription assignment flow ([75dcb72](https://github.com/RyRy79261/intake-tracker/commit/75dcb7245b8a65272019b300cc347290ebe3dee9))
* **06-07:** compound card shows prescription indication and medication count ([1761869](https://github.com/RyRy79261/intake-tracker/commit/17618695e282dcf193056df93273bf22197c44b8))
* **06.1-01:** redesign weight card with increment/decrement pattern ([3d88410](https://github.com/RyRy79261/intake-tracker/commit/3d88410bdd1247b766554bb94099e4b30e1ea125))
* **06.1-01:** reorganize BP card with expandable details section ([197e4f5](https://github.com/RyRy79261/intake-tracker/commit/197e4f53cdd03d829b0b803d7aeecebb1dd4d91e))
* **06.1-02:** replace eating card dialog with inline expandable details ([0364a43](https://github.com/RyRy79261/intake-tracker/commit/0364a430287869f1844fdaa316f638017dd3c10f))
* **06.1-02:** replace urination/defecation dialogs with inline amount buttons ([2f9ce80](https://github.com/RyRy79261/intake-tracker/commit/2f9ce80684f66b8e87f747e3ddf4f555fa871da7))
* **06:** restore prescription card with expand, fix dark mode dropdowns, AI refresh, last refill date ([a6a04dc](https://github.com/RyRy79261/intake-tracker/commit/a6a04dc8e2735691d7c66edff3c94d589cca91ec))
* **06:** titrations system, PRN meds, Rx grid layout, and medication settings ([ff71103](https://github.com/RyRy79261/intake-tracker/commit/ff71103194cb72cdb547646148e8b5be24813bab))
* **06:** UAT fixes — tab bar layout, prescription-first dosage step, schedule simplification, medication vs prescription separation ([ca8b4dd](https://github.com/RyRy79261/intake-tracker/commit/ca8b4dd3fecd27d60c25b341617905ab526936e9))
* **07-01:** create PhaseTimeline component with vertical timeline visualization ([5e785c4](https://github.com/RyRy79261/intake-tracker/commit/5e785c4166bb4fb6cb246bf5495e32f13d93337f))
* **07-01:** wire PhaseTimeline into PrescriptionDetailDrawer ([cfcb411](https://github.com/RyRy79261/intake-tracker/commit/cfcb411eafa69b6465e34f9f2aa37d6253724cff))
* **08-01:** add interaction-check API route and localStorage cache utility ([066c61f](https://github.com/RyRy79261/intake-tracker/commit/066c61f04fa2d59007a588386413eb78d0a1e759))
* **08-01:** add React hooks for interaction checking and prescription refresh ([85f9567](https://github.com/RyRy79261/intake-tracker/commit/85f9567caf70e556310fcb0b603fd4e37c24c6aa))
* **08-02:** add conflict check interstitial to add-medication wizard ([95c2385](https://github.com/RyRy79261/intake-tracker/commit/95c23855f299046b2644dd4e6b2d77095317f45a))
* **08-02:** add InteractionsSection component and integrate into prescription drawer ([5e8e543](https://github.com/RyRy79261/intake-tracker/commit/5e8e54395714c687aae84e61538631c2d9b68238))
* **08-03:** add InteractionSearch component for ad-hoc substance lookups ([471a7a2](https://github.com/RyRy79261/intake-tracker/commit/471a7a258be24115b7f3bfa4472e5a9f75780c7c))
* **08-03:** integrate InteractionSearch into CompoundList ([313af7d](https://github.com/RyRy79261/intake-tracker/commit/313af7db0280ffa34c797a964ae61e4aab9b325a))
* **09-01:** extend backup service with all 16 tables and conflict detection ([b8f11ac](https://github.com/RyRy79261/intake-tracker/commit/b8f11ac75c8b4550c973473c225ad836f4e4e9df))
* **09-02:** add conflict review drawer and resolve conflicts hook ([f3129ce](https://github.com/RyRy79261/intake-tracker/commit/f3129ce2f6faf33c4c85be4145be3b93117070fb))
* **09-02:** add import confirmation and conflict review flow to data management ([e751412](https://github.com/RyRy79261/intake-tracker/commit/e75141210b3fb93ccaf04779963a7fe65d80a783))
* **10-03:** add timezone dual-pass test scripts to package.json ([a17a059](https://github.com/RyRy79261/intake-tracker/commit/a17a059c0dd1c1b88f3576e3f0dd52795437bafa))
* **11-01:** add push and notificationclick handlers to service worker ([4fae073](https://github.com/RyRy79261/intake-tracker/commit/4fae073bbe75ac8524c2ecc07564813c271dd27b))
* **11-01:** add push notification server infrastructure ([716a1e7](https://github.com/RyRy79261/intake-tracker/commit/716a1e7ed2b465c6021a05566ad89176a8aae233))
* **11-02:** add cron send route and client push subscription management ([3510a6a](https://github.com/RyRy79261/intake-tracker/commit/3510a6af3354c804f49044e7a447f5a5c3bb165c))
* **11-02:** add subscribe, unsubscribe, and sync-schedule push API routes ([2b8c204](https://github.com/RyRy79261/intake-tracker/commit/2b8c20465c4ff536c7fb53d0e0cadb97019055f6))
* **11-03:** add dose reminder settings and schedule sync hook ([7e4ed9f](https://github.com/RyRy79261/intake-tracker/commit/7e4ed9fd81ae7bf5e922089e1f1c2307898ad98f))
* **11-03:** add dose reminders UI and wire schedule sync into medications page ([0fe37a4](https://github.com/RyRy79261/intake-tracker/commit/0fe37a44935b56e55348b1fefe371886e5547ba6))
* **12-01:** Dexie v15 schema migration with groupId index on 3 tables ([35a19c6](https://github.com/RyRy79261/intake-tracker/commit/35a19c61bca7e7b84fe3b2dfd6c381ef11000bd3))
* **12-01:** soft-delete standardization for intake-service and eating-service ([43e8a7e](https://github.com/RyRy79261/intake-tracker/commit/43e8a7e2467bcd8c32bc4e4f899336618c8aab24))
* **12-01:** wire undo toasts into individual delete hooks per D-08 ([46a7799](https://github.com/RyRy79261/intake-tracker/commit/46a7799b5dfe61943803ca39bb56a8a878e0a56f))
* **12-02:** add composable entry hooks and fix SubstanceRecord interface ([738bbb1](https://github.com/RyRy79261/intake-tracker/commit/738bbb16d4bc8dce58799c54583ef5888c3fc487))
* **12-02:** implement composable entry service with full CRUD + tests ([7ef0bd2](https://github.com/RyRy79261/intake-tracker/commit/7ef0bd279958f188a13de3b8f3746a8ca84cfc36))
* **13-01:** add DEFAULT_LIQUID_PRESETS constant and shared Claude client ([636e8c5](https://github.com/RyRy79261/intake-tracker/commit/636e8c5e0c9126ef94f27c1884fed2af5fdc94aa))
* **13-01:** add liquidPresets CRUD to settings-store with persist v2 migration ([1f4cc79](https://github.com/RyRy79261/intake-tracker/commit/1f4cc79b84a249ec39e72e49cdb7319bdf5df4bc))
* **13-02:** migrate interaction-check, titration-warnings to Claude + create substance-lookup route ([30096cc](https://github.com/RyRy79261/intake-tracker/commit/30096ccccbf6f7b0d3385954e551b19d4034ee00))
* **13-02:** migrate parse, substance-enrich, medicine-search routes to Claude ([8fcda7f](https://github.com/RyRy79261/intake-tracker/commit/8fcda7fa6abe0b86dc1604d332073b02ad2f17d7))
* **13-03:** rename perplexity.ts to ai-client.ts and update all source imports ([a7c75d7](https://github.com/RyRy79261/intake-tracker/commit/a7c75d78ab014caeb806d287bad0889d9f97d95e))
* **14-01:** create BeverageTab with volume controls and name field ([e80d713](https://github.com/RyRy79261/intake-tracker/commit/e80d71338dd6f92942e39066887cfb303a9494db))
* **14-01:** create LiquidsCard shell with Radix Tabs and WaterTab ([45c62ce](https://github.com/RyRy79261/intake-tracker/commit/45c62ce97b16ec30e7e37b606359ee341384e1f2))
* **14-02:** create PresetTab component for Coffee and Alcohol tabs ([20e05cf](https://github.com/RyRy79261/intake-tracker/commit/20e05cf3edfa2a20360b4addb0a0b166d1207851))
* **14-02:** wire PresetTab into LiquidsCard and swap dashboard ([91ec064](https://github.com/RyRy79261/intake-tracker/commit/91ec064748565dcbe1dea89d7700fb0b72d5efb6))
* **15-01:** create ComposablePreview and FoodSection components ([2629612](https://github.com/RyRy79261/intake-tracker/commit/2629612771e0ca278fa0a56f4907c1a264bdc053))
* **15-01:** create SaltSection component (exact lift of IntakeCard salt UX) ([c39cb0e](https://github.com/RyRy79261/intake-tracker/commit/c39cb0e83c7bd1305128b64905189feebe920d40))
* **15-02:** create FoodSaltCard shell component ([861c3b8](https://github.com/RyRy79261/intake-tracker/commit/861c3b81a62d47294115b523767d64fa24ad6c56))
* **15-02:** wire FoodSaltCard into dashboard replacing EatingCard + IntakeCard(salt) ([9dad5d8](https://github.com/RyRy79261/intake-tracker/commit/9dad5d89493a2c84133749a9b7c426c57086c32b))
* **16-01:** extend LiquidPreset for multi-substance and add substances[] to composable entry service ([824c315](https://github.com/RyRy79261/intake-tracker/commit/824c315f396fd861cd9ee8e2924fc204af0e37f5))
* **16-01:** Zustand persist migration v2 to v3 with preset format conversion ([e192d2c](https://github.com/RyRy79261/intake-tracker/commit/e192d2ca81a894c5119da94255449ccfbf93d401))
* **16-02:** create TextMetrics component, useIntakeRecordsByDateRange hook, and update PresetTab for multi-substance model ([f98de3b](https://github.com/RyRy79261/intake-tracker/commit/f98de3b467061fa63bd5c0a79722289f88bc75b8))
* **16-02:** promote BP heart rate, replace Coffee tab with Liquid Presets, reorder dashboard cards ([d8c0cb5](https://github.com/RyRy79261/intake-tracker/commit/d8c0cb5393186a98dd936757112a6047b6f2d2ff))
* **17-01:** add clearTimezoneCache and timezone_adjusted audit action ([44dc80b](https://github.com/RyRy79261/intake-tracker/commit/44dc80bfb4a4e63602b324bf2494cc292b4f65f1))
* **17-01:** add recalculateScheduleTimezones service with comprehensive tests ([81bdc5d](https://github.com/RyRy79261/intake-tracker/commit/81bdc5da016b924f5a746a37bb613f4bb02e28cb))
* **17-02:** create timezone detection hook, dialog component, and unit tests ([6653cff](https://github.com/RyRy79261/intake-tracker/commit/6653cffa2bedaa53e93e53b793ba5319058d9b3d))
* **17-02:** wire TimezoneGuard into providers.tsx ([ff6bd51](https://github.com/RyRy79261/intake-tracker/commit/ff6bd51281fe82ddccf32a7468f50d656f33440a))
* **18-01:** add missing settings store fields and actions ([b7064ce](https://github.com/RyRy79261/intake-tracker/commit/b7064ced2c24cb733bb61fc4edc6d92760eb6af2))
* **19-01:** add waterContentPercent to substance-lookup API ([114e46f](https://github.com/RyRy79261/intake-tracker/commit/114e46ff2a4de7ec236af95dd4de5216b6796ae1))
* **20-01:** add typecheck script and Neon DB bundle security patterns ([10ce94e](https://github.com/RyRy79261/intake-tracker/commit/10ce94ebe0f8552f6048b0f041f32c175a28464d))
* **20-02:** create CI workflow with 5 parallel jobs and gate ([7a207a0](https://github.com/RyRy79261/intake-tracker/commit/7a207a095bd0ec58f50a4f5d81b30cb1f120b4bf))
* **21-01:** create static schema parser for db.ts ([4b01d03](https://github.com/RyRy79261/intake-tracker/commit/4b01d03e4a9cbed25d1d56273ec8f59d3dfb9751))
* **21-02:** add data-integrity CI job and wire to ci-pass gate (DATA-05) ([4a4a05f](https://github.com/RyRy79261/intake-tracker/commit/4a4a05fb7f1feeaad11c0ab6c32d6c3e1be73c81))
* **22-01:** add e2e job to CI workflow and wire into merge gate ([5522ff6](https://github.com/RyRy79261/intake-tracker/commit/5522ff6e7452993402c77ae7c7a0a9f11f1319eb))
* **22-01:** create settings persistence E2E test ([818a4d9](https://github.com/RyRy79261/intake-tracker/commit/818a4d9b82b1d85017f05c79abcd9c4236389bfc))
* **22-01:** update Playwright config for CI dual-mode and service worker blocking ([45b99c9](https://github.com/RyRy79261/intake-tracker/commit/45b99c9baa37c83d80ac140f1201a8053fbbeba6))
* **23-01:** add pnpm supply chain security settings and fix vulnerabilities ([968c325](https://github.com/RyRy79261/intake-tracker/commit/968c3259681bd96159eac2eb95ea3e3eafc65b1c))
* **23-02:** add supply-chain CI job with config drift check and audit gate ([b655779](https://github.com/RyRy79261/intake-tracker/commit/b65577902e2aad06cba8bdc7027b5348fcf3cfc7))
* **23-03:** add --ignore flags to CI audit step for documented false-positives ([1c3fc84](https://github.com/RyRy79261/intake-tracker/commit/1c3fc84413f71dfeee80fd19ac2f7efa5e4d2107))
* **23-03:** document unfixable GHSAs in auditConfig.ignoreCves ([8db53dc](https://github.com/RyRy79261/intake-tracker/commit/8db53dcf8bf800f3351a4cef8a096dfa661ba4c5))
* **24-01:** create benchmark test files and generate baseline JSON ([fa6a1fd](https://github.com/RyRy79261/intake-tracker/commit/fa6a1fd8e72717c4f4d22626fee3cf878d211ddd))
* **24-02:** add path filtering, coverage reporting, build caching, and benchmarking to CI ([deb3d2a](https://github.com/RyRy79261/intake-tracker/commit/deb3d2a0ea9b9f1ac1cb9fee35c4aadba64365b9))
* **26-02:** create analytics page E2E tests ([8bb99f7](https://github.com/RyRy79261/intake-tracker/commit/8bb99f784b96abc0cd342617d7a920eb7cf7fd63))
* **26-02:** expand settings E2E tests with export and account coverage ([5b16980](https://github.com/RyRy79261/intake-tracker/commit/5b16980ab77c78830cf455d49874d9aedbf89846))
* **28-01:** disable service worker on non-production Vercel environments ([7f93733](https://github.com/RyRy79261/intake-tracker/commit/7f937334f4af5d816b0c50a6a253b44fc04981ba))
* **28-02:** add Neon staging branch reset workflow ([7f2428f](https://github.com/RyRy79261/intake-tracker/commit/7f2428f886d1a1cf3be168b41cf850e15956457d))
* **28-03:** add staging branch to CI pull_request targets ([2a3765b](https://github.com/RyRy79261/intake-tracker/commit/2a3765b47a6aa24825d9d806a5902f3c0fe9512a))
* **quick-260330-131:** create Playwright auth setup and update config ([5146f2f](https://github.com/RyRy79261/intake-tracker/commit/5146f2f74a7b5d02bc2b872515ad8b24e1d60d84))
* rename Salt to Sodium with source presets for accurate tracking ([5467bd4](https://github.com/RyRy79261/intake-tracker/commit/5467bd464869f1fd2ce802739cd9159bc79a6038))
* session improvements — dose timing, Rx cards, titration editing, AI upgrades ([5892733](https://github.com/RyRy79261/intake-tracker/commit/58927338a33c71ca4910c032e67f71a8a3f15f16))


### Bug Fixes

* **06-04:** resolve pre-existing build errors blocking verification ([a18527c](https://github.com/RyRy79261/intake-tracker/commit/a18527c59516383692d0cc0294d2a1ce159bbf1e))
* **06-05:** boolean indexing bug, transaction CRUD, 4th tab routing ([46830d3](https://github.com/RyRy79261/intake-tracker/commit/46830d30ca522b52fd7af7d1822072b01ce3286d))
* **06.1-01:** guard recentRecords[0] access for strict build check ([348283a](https://github.com/RyRy79261/intake-tracker/commit/348283a844b01dca8742862b78e1b08802a55d32))
* **12:** revise plans based on checker feedback ([e675c54](https://github.com/RyRy79261/intake-tracker/commit/e675c5462ecab8b8f3c93188897a1687d9a9fb77))
* **13-02:** resolve TypeScript readonly array incompatibility with Anthropic SDK ([2dc608e](https://github.com/RyRy79261/intake-tracker/commit/2dc608e465d5d6447cb98a6cc3e2f9d4abbacad8))
* **14:** fix water tab recent entries destructuring (useLiveQuery returns array, not {data}) ([f62fa59](https://github.com/RyRy79261/intake-tracker/commit/f62fa595fc34ca1b971e3855f0c7d2d7cd32d271))
* **16:** revise plans based on checker feedback ([bec39a7](https://github.com/RyRy79261/intake-tracker/commit/bec39a7c3c783613d6d915f41ab1977975524498))
* **17:** revise plans based on checker feedback ([92feafa](https://github.com/RyRy79261/intake-tracker/commit/92feafabb4a96d705c335797985f323b4c80bcf8))
* **18-01:** fix ESLint import boundary violations for ComposableEntryInput ([d17d006](https://github.com/RyRy79261/intake-tracker/commit/d17d006ffc807a5114a1c7044be14449184a0d00))
* **18:** add weightIncrement to settings store and wrap analytics useSearchParams in Suspense ([1119962](https://github.com/RyRy79261/intake-tracker/commit/1119962a6ede157730f84fe97762c80b8722b073))
* **20-01:** resolve 57 TypeScript strict-mode errors in test files ([a0eba41](https://github.com/RyRy79261/intake-tracker/commit/a0eba417f43aed04c9b3b5f14d33759590d3a983))
* **22:** revise plans based on checker feedback ([378ed0c](https://github.com/RyRy79261/intake-tracker/commit/378ed0cf686ffce78294cd2d408f1c7d8fc9daa3))
* **24:** add base-branch coverage comparison to plan 02 per D-07/D-08 ([6cd503d](https://github.com/RyRy79261/intake-tracker/commit/6cd503db5bf801569b3e0adf19fbac4967db0aaa))
* **25-01:** add ES2020 target to tsconfig and complete supply chain drift check ([4e6bbd2](https://github.com/RyRy79261/intake-tracker/commit/4e6bbd24bffaf2229d2e681012c7f601b9398186))
* **25-01:** regenerate benchmark baselines with clean repo paths ([9abeac6](https://github.com/RyRy79261/intake-tracker/commit/9abeac60b4257dfac022cc217e4129c526cf281e))
* **26:** revise plans based on checker feedback ([1edcbcc](https://github.com/RyRy79261/intake-tracker/commit/1edcbcccc54f115f411db509133c0083f67c7319))
* **ci:** bound ajv override to 6.x to prevent ESLint crash ([921d51e](https://github.com/RyRy79261/intake-tracker/commit/921d51e3edf9a74f4a9eaa76fa23f006a991dfb6))
* **ci:** bump Node to 22 and fix DST-sensitive timezone test ([c9e37df](https://github.com/RyRy79261/intake-tracker/commit/c9e37df37b5afff9629d00811566dd191068cc21))
* **ci:** correct Privy secret name in e2e workflow ([2378675](https://github.com/RyRy79261/intake-tracker/commit/2378675e3a3f56d32422401dffc8b98cbe13d437))
* **ci:** resolve ajv conflict, coverage baseline, and E2E selectors ([b73cd74](https://github.com/RyRy79261/intake-tracker/commit/b73cd744dc9151618be1f31d8c0c26898f9ef456))
* **ci:** restore NEXT_PUBLIC_PRIVY_APP_ID secret name ([8de3696](https://github.com/RyRy79261/intake-tracker/commit/8de36967a11c6f5fa63eb6acd3b79ecc3d15c29b))
* **ci:** revert secret name to PRIVY_APP_ID ([2f19f20](https://github.com/RyRy79261/intake-tracker/commit/2f19f20b7d83f1eb8f60bb14458b62dac2290d2d))
* **ci:** simplify coverage job and fix E2E tab panel selector ([4c2ef16](https://github.com/RyRy79261/intake-tracker/commit/4c2ef16751036b687692bba9b7c14eaef13ac175))
* **ci:** use eslint directly, fix coverage checkout, exact E2E matchers ([9e5ee53](https://github.com/RyRy79261/intake-tracker/commit/9e5ee5378d39a65535d6d5f20e4a3aec7c7ea6ce))
* **e2e:** add Origin header to Privy auth request ([3dd947c](https://github.com/RyRy79261/intake-tracker/commit/3dd947cdce28c7df6fb4cb01dca113862fe4577e))
* **e2e:** add Origin header to Privy authenticate endpoint ([45401a5](https://github.com/RyRy79261/intake-tracker/commit/45401a517835934dad3dec7add0ad5c8c8388e8c))
* **e2e:** add Origin header to Privy SDK for CI auth ([a2c2ca9](https://github.com/RyRy79261/intake-tracker/commit/a2c2ca9140e64b8bd6465793cea642b1a6b8babf))
* **e2e:** align medication wizard tests with current UI ([1bb80ee](https://github.com/RyRy79261/intake-tracker/commit/1bb80eea60b39d6e517333cef0979da3f8872888))
* **e2e:** bypass Privy modal with server-side token injection ([6b5bf67](https://github.com/RyRy79261/intake-tracker/commit/6b5bf67e3d57f034d5669b23ac3b8141ea1b5227))
* **e2e:** inject full Privy token set for CI auth ([fe48aa4](https://github.com/RyRy79261/intake-tracker/commit/fe48aa4b334d4641d7c2219bcae11a7397926415))
* **e2e:** remove Privy auth from e2e tests, skip auth in CI ([ca55425](https://github.com/RyRy79261/intake-tracker/commit/ca55425c9b57ad2ff1cac6a1a8cbc13eff20cc57))
* **e2e:** scope Log Entry button to active tab panel ([966818c](https://github.com/RyRy79261/intake-tracker/commit/966818c32176bbb64d8c069d3e60fa362bab2fa5))
* **e2e:** set full Privy token set in localStorage for auth setup ([91a9b49](https://github.com/RyRy79261/intake-tracker/commit/91a9b49d0bcb5413913daf3177fcd3824bf0ae1d))
* **e2e:** skip dialog visibility check, wait for inputs directly ([5c3c1fa](https://github.com/RyRy79261/intake-tracker/commit/5c3c1fa72f84ba3b71fb551e1d4519b611ca5ab3))
* **e2e:** use @privy-io/node SDK instead of raw fetch ([fdc464d](https://github.com/RyRy79261/intake-tracker/commit/fdc464da9342f604c1256cd5e1881917c9c50b2c))
* **e2e:** use actual Privy login flow instead of token injection ([8054fe6](https://github.com/RyRy79261/intake-tracker/commit/8054fe6fa8f5b6b3f1e516dcf85d446de70f66c0))
* **e2e:** use data-state=active selector for tabpanel in history tests ([36bc2c0](https://github.com/RyRy79261/intake-tracker/commit/36bc2c0fc04bfac9987c2d353d994de61ea0e631))
* **e2e:** use production domain as Origin for Privy SDK auth ([4c56a84](https://github.com/RyRy79261/intake-tracker/commit/4c56a84e7506a4be1bcd9307ee55d1a0a29fc532))
* **lint:** remove eslint-disable comments for non-existent @typescript-eslint/no-explicit-any rule ([668a6ce](https://github.com/RyRy79261/intake-tracker/commit/668a6ce242b7691d6acd4a9e8117694c89e7b2b9))
* **quick-260330-131:** remove all LOCAL_AGENT_MODE references from source code ([4a5e468](https://github.com/RyRy79261/intake-tracker/commit/4a5e46865913c0a6392e5c337b446f06b3ce7bc0))
* remove hover zoom, "I ate" button, and change alcohol to % ABV ([66781c9](https://github.com/RyRy79261/intake-tracker/commit/66781c98777c1e2221184aabc87540d000c50bd2))
* resolve code review issues — orphaned dose logs and silent wizard failure ([1e7043e](https://github.com/RyRy79261/intake-tracker/commit/1e7043e7830a86e92e2942b4b10fab4e74a68de2))
* resolve milestone audit items — analytics prerender, test fixtures, DST tests, CLAUDE.md ([b75f702](https://github.com/RyRy79261/intake-tracker/commit/b75f7021b0d6b28fbc68023b76e06b5057959235))
* restore correct vitest.config.ts after merge conflict ([499ddc0](https://github.com/RyRy79261/intake-tracker/commit/499ddc0404e4d74b6fa71444834b1c31e35bd49b))
* skip bundle-security test without build artifacts, use relative benchmark paths ([8ecaaee](https://github.com/RyRy79261/intake-tracker/commit/8ecaaeea81493014da6d29d27f9618fb1faa4848))
* **tests:** add non-null assertions for TypeScript strict mode ([b72a311](https://github.com/RyRy79261/intake-tracker/commit/b72a3110e2a520d7ad2caa654ab23de1fea4e0a9))
* **titration:** add doseLogs to updateTitrationPlan transaction scope ([deed59e](https://github.com/RyRy79261/intake-tracker/commit/deed59ec1d9e4b5e19fcb4b7acab31c3be0ce0fe))
* update AI model, reorder detail sections, fix weight default ([157bb4f](https://github.com/RyRy79261/intake-tracker/commit/157bb4ff85070751676a8b6c036b8cd55e0e29d9))


### Performance Improvements

* **ci:** cache Playwright Chromium binary between CI runs ([2f3664f](https://github.com/RyRy79261/intake-tracker/commit/2f3664f08b5818eb21a4b453f9d1d851f44331ab))
