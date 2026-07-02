---
name: CarStats Mobile
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3fe'
  surface-container: '#ededf8'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e2e1ed'
  on-surface: '#191b23'
  on-surface-variant: '#434654'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fb'
  outline: '#737686'
  outline-variant: '#c3c5d7'
  surface-tint: '#1353d8'
  primary: '#003fb1'
  on-primary: '#ffffff'
  primary-container: '#1a56db'
  on-primary-container: '#d4dcff'
  inverse-primary: '#b5c4ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#694100'
  on-tertiary: '#ffffff'
  tertiary-container: '#895600'
  on-tertiary-container: '#ffd6a8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b5c4ff'
  on-primary-fixed: '#00174d'
  on-primary-fixed-variant: '#003dab'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e2e1ed'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 20px
  card-gap: 16px
---

## Brand & Style

The design system is built on a "Soft Tech" aesthetic, balancing technical precision with human-centric accessibility. The goal is to demystify complex vehicle data, transforming intimidating OBD-II diagnostics into clear, actionable insights for the everyday driver.

The visual narrative focuses on **Trust, Clarity, and Vitality**. We employ a "Modern-Corporate" foundation infused with "Soft-UI" elements: heavy whitespace, high-fidelity iconography, and deep rounded corners. The interface should feel like a premium concierge for your vehicle—reliable enough for a mechanic, yet friendly enough for a first-time car owner.

## Colors

The palette is anchored by **Engine Blue**, a deep and vibrant primary shade that evokes professional reliability. 

- **Status Logic:** We use a high-chroma semantic system. **Emerald Green** denotes "Healthy/Connected," **Warm Amber** signals "Caution/Maintenance Due," and **Crimson Red** indicates "Urgent/Critical Failure."
- **Surfaces:** To maintain the high-end feel, we avoid pure white backgrounds, opting for a very light cool-grey (`#F9FAFB`) to allow white surface cards to "pop" with subtle depth.
- **Localization:** A specialized **Plate Yellow** (`#FFD700`) is reserved exclusively for the Israeli license plate component to provide instant mental mapping for local users.

## Typography

We utilize **Inter** for its exceptional legibility and systematic feel. The type hierarchy is intentionally bold; headers use heavy weights and slight negative letter-spacing to command authority and improve scanning on mobile devices.

- **Headlines:** Reserved for vehicle status and high-level data points.
- **Body:** Generous line-height (1.5x) ensures that technical explanations remain readable even in high-glare environments (like inside a car).
- **Labels:** Small, all-caps, and tracked out for secondary metadata (e.g., VIN numbers, sensor timestamps).
- **Hebrew Support:** Inter provides excellent glyph support for Hebrew, ensuring a seamless transition for local localization.

## Layout & Spacing

This design system employs a **Fluid Mobile Grid** based on an 8px rhythm. 

- **Margins:** Main view containers use a 20px side margin to provide breathing room.
- **Stacking:** Vertical spacing between cards and status groups is standardized at 16px (md) to maintain a dense but organized information flow.
- **Safe Areas:** Ensure all primary actions (like "Start Scan") are within the thumb-zone (bottom 30% of the screen) while status indicators occupy the upper visual field.

## Elevation & Depth

We use **Ambient Shadows** to create a sense of tactile layering. 

- **Level 1 (Base):** White cards feature a 1px soft border (`#E5E7EB`) and a very diffuse shadow (Y: 4, Blur: 12, Opacity: 0.05) to distinguish them from the off-white background.
- **Level 2 (Active/Floating):** Primary action buttons or active status banners use a more pronounced shadow (Y: 8, Blur: 20, Opacity: 0.1) to suggest interactability.
- **Depth:** Avoid heavy gradients. Use subtle background blurs (10px) on modal overlays to maintain context of the car's data underneath.

## Shapes

The shape language is defined by **Extended Rounding**. 

- **Cards & Banners:** Use `rounded-2xl` (1rem / 16px) as the default to soften the "industrial" feel of car data.
- **Buttons:** Use `rounded-xl` (0.75rem / 12px) for a modern, touch-friendly appearance.
- **Inputs:** Maintain a consistent `rounded-lg` (0.5rem / 8px) for form fields, including the specialized license plate input.

## Components

### Status Cards
The centerpiece of the app. Large, white containers with a vertical colored "accent bar" (2px) on the left edge indicating health status. Use `headline-md` for the main metric (e.g., "98%") and `body-sm` for the description.

### Israeli License Plate Input
A specific component styled after local plates. 
- **Background:** `#FFD700` (Plate Yellow).
- **Border:** 2px solid black.
- **Text:** Black, monospaced-style font, centered.
- **Left Tab:** A small blue vertical strip on the left with the "IL" and "Star of David" icons to ground the app in the local context.

### Severity Banners
Full-width alerts placed at the top of the screen.
- **Urgent:** Crimson background with white text; includes a "triangle-exclamation" icon.
- **Warning:** Amber background with black text.

### Action Buttons
- **Primary:** "Engine Blue" background, white text, bold weight. High-height (56px) for easy tapping while in a vehicle.
- **Secondary:** Ghost style (transparent background, blue border).

### Gauges & Rings
Circular progress indicators for "Engine Health" or "Fuel Level." Use a stroke width of 8px with rounded caps to match the overall shape language.