---
name: Design file structure
description: Layout of design/app.pen -- pages, reusable component IDs, screen grid positions, design token values, and Pencil JSON conventions
type: reference
---

## File: design/app.pen (Pencil v2.8 JSON)

### Screen grid layout
- Phone frames: 393x852 (iPhone 14-ish)
- Horizontal gap between screens: 60px
- Row 0 (y=0): Dashboard variants + Settings (x starts at 4571)
- Row 1 (y=960): Medications screens
- Row 2 (y=1920): Prescription flow + Dose/Inventory screens
- Row 3 (y=2880): Auth screens (Sign In, Sign Up, Forgot Password, Forgot PW Success, Reset Password)
- Row 4 (y=3840): Analytics screens (Records, Insights, Correlations, Titration)
- Row 5 (y=4800): Settings Storage & Security, Cloud Sync Active, Migration Wizard (Backup Gate, Upload Progress, Complete)
- Component definition frames at (0,0), (0,300), (0,600)
- Next available row: Row 6 (y=5760)

### Key reusable component IDs
- Button / Primary: qZUwy
- Button / Secondary: XcXof
- Button / Destructive: JUuxF
- Button / Outline: e9DEP
- Button / Ghost: N4rYD
- Card: hxUua
- Input: yGWHq
- Label: pwdOT
- Select: Exa6r
- Chrome / App Header: tmXPq
- Chrome / Quick Nav Footer: y8Gil

### Design tokens (from variables)
- $bg: #F5F6F8, $card-bg: #FFFFFF, $foreground: #1A1D25
- $muted: #E8EAF0, $muted-foreground: #6B7280, $border: #DDE0E8
- $primary: #3B82F6, $primary-foreground: #FFFFFF
- $destructive: #EF4444
- Font: Outfit, sizes: 12/14/16/24, weights: normal/500/600/700
- Button height: 40px, cornerRadius: 12
- Input height: 40px, cornerRadius: 10
- Card cornerRadius: 12, stroke: 1px $border

### Health metric color tokens
- $water: #38BDF8, $salt: #F59E0B, $weight: #10B981, $bp: #F43F5E
- $eating: #F97316, $urination: #8B5CF6, $defecation: #78716C
- $caffeine: #EAB308, $alcohol: #D946EF, $medication: #0D9488
- All have matching $*-foreground tokens (mostly #FFFFFF)

### Additional reusable component IDs
- Switch / On: YK4HO
- Switch / Off: 9zPCb
- Tabs: tyGZp
- Tab / Active: q9CMP
- Tab / Inactive: OiQhy
- Dialog: 2RmRM
- Drawer: BY0J0
- Progress: GQfAg
- Numeric Input: OJZc7
- Textarea: fas04
- Toast / Default: Nq8jl
- Toast / Success: G9ohk
- Toast / Error: KuKus

### Patterns introduced in Row 5
- Section-with-icon: card section with icon+title header row (icon 18px + text 15px/600)
- Modal overlay: frame 393x852, fill #00000080, centered dialog with padding 20
- Badge: pill shape (cornerRadius 9999), padding [4,10], optional icon + text 12px/500
- Checkbox row: square/check-square icon 18px + text 13px
- Progress item rows: status icon (check-circle-2/loader-2/circle) + label + count

### Settings footer descendants (for active Settings tab)
- pfqvc: fill=$muted-foreground (home icon)
- 2wmye: fill=$muted-foreground, fontWeight=500 (home text)
- bXCo0: fill=$primary (settings icon -- active)
- 7oBKc: fill=$primary, fontWeight=600 (settings text -- active)

### Settings header descendants
- Jferh: content override for title text
- A43Zv: enabled=false to hide back button

### Conventions
- Screens use `ref` nodes pointing to reusable component IDs
- `descendants` key on ref nodes overrides child properties by ID (e.g. change header title/icon)
- Footer `descendants` can swap active tab by setting fill/fontWeight on tab icon+text IDs
- Auth screens use inline components (not refs) since auth has unique layout
- Auth shell: $muted background, centered card with $card-bg, 24px padding, 24px gap between sections
- ID format: 5-char alphanumeric random strings
- Avoid null values in JSON -- omit optional keys rather than setting null
- Tab bar pattern: $muted bg, cornerRadius 8, 3px padding, active tab gets $card-bg fill + bold text
