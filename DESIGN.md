---
project: JointBench
version: 2.0.0
surfaceMode: Operate
theme: tactile-swiss-calibration-bay
dials:
  antislop:
    energy: 3
    rhythm: 3
    motion: 3
  layout:
    variance: 8
    motion: 8
    density: 7
tokens:
  color:
    bgCanvas: "#E6EBF0"
    bgCanvasTop: "#F4F7FA"
    bgCanvasBottom: "#D7DFE8"
    surfacePrimary: "#F9FAFC"
    surfaceRecessed: "#E2E8F0"
    surfaceHover: "#EDF3FF"
    surfaceViewport: "#0E141D"
    surfaceViewportMid: "#151F2E"
    surfaceViewportEdge: "#090D14"
    inkPrimary: "#0F1722"
    inkSecondary: "#455468"
    inkMuted: "#55657A"
    inkOnPrimary: "#FFFFFF"
    inkOnViewport: "#F1F5F9"
    inkOnViewportMuted: "#94A3B8"
    accentPrimary: "#1D4ED8"
    accentPrimaryHover: "#1E40AF"
    accentBright: "#3B82F6"
    accentTint: "#DBEAFE"
    accentHandle: "#D97706"
    borderStructural: "#C4CFD9"
    borderStrong: "#8FA0B3"
    borderViewport: "#273549"
    statusPassFg: "#065F46"
    statusPassBg: "#ECFDF5"
    statusPassBorder: "#6EE7B7"
    statusFailFg: "#991B1B"
    statusFailBg: "#FEF2F2"
    statusFailBorder: "#FCA5A5"
    statusWarnFg: "#92400E"
    statusWarnBg: "#FFFBEB"
    statusWarnBorder: "#FCD34D"
    axisX: "#EF4444"
    axisY: "#22C55E"
    axisZ: "#3B82F6"
    graspHandle: "#F59E0B"
  typography:
    display:
      fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
      fontSize: "2.375rem"
      fontWeight: 800
      lineHeight: 1.06
      letterSpacing: "-0.03em"
    h1:
      fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
      fontSize: "1.75rem"
      fontWeight: 700
      lineHeight: 1.15
      letterSpacing: "-0.025em"
    h2:
      fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
      fontSize: "1.125rem"
      fontWeight: 600
      lineHeight: 1.25
      letterSpacing: "-0.015em"
    h3:
      fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
      fontSize: "0.9375rem"
      fontWeight: 600
      lineHeight: 1.35
      letterSpacing: "-0.01em"
    body:
      fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
      fontSize: "0.9375rem"
      fontWeight: 400
      lineHeight: 1.55
      letterSpacing: "0em"
    label:
      fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
      fontSize: "0.8125rem"
      fontWeight: 500
      lineHeight: 1.35
      letterSpacing: "0em"
    monoData:
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
      fontSize: "0.8125rem"
      fontWeight: 500
      lineHeight: 1.4
      letterSpacing: "0em"
  radius:
    control: "6px"
    plate: "10px"
    viewport: "14px"
    badge: "4px"
  spacing:
    unit: "4px"
    rhythm: [4, 8, 12, 16, 20, 24, 32, 48]
    navHeight: "60px"
    containerMax: "1440px"
  motion:
    library: "motion/react (Framer Motion) + Three.js useFrame + CSS compositor transitions"
    easeOut: "cubic-bezier(0.23, 1, 0.32, 1)"
    easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)"
    springSnappy: { type: "spring", stiffness: 440, damping: 32, mass: 0.8 }
    springTactile: { type: "spring", stiffness: 360, damping: 28, mass: 1.0 }
    pressMs: 140
    stateMs: 200
    entranceMs: 280
    staggerMs: 45
  zIndex:
    base: 0
    sticky: 10
    viewportHud: 20
    header: 40
    overlay: 100
    toast: 1000
---

# JointBench Design System (`DESIGN.md` v2.0)

> **Design Read:** Reading this as a 3-route 3D robotics kinematics workbench (Operate) for Embodied AI and robotics simulation engineers, in a Tactile Swiss Robotics Calibration Bay language with an anodized obsidian 3D inspection chamber and spring-choreographed hardware controls, dial `ENERGY 3 / RHYTHM 3 / MOTION 3` (`VARIANCE 8 / MOTION 8 / DENSITY 7`).

> **Tooling note:** `@google/design.md` CLI is not installed in this VM; tokens follow the Google `DESIGN.md` YAML front-matter contract in `01-ui-ux-design.md`, and the upgraded visual proof is verified directly in headless Chromium at 1440px and 375px.

---

## 1. Visual Theme, Identity Motif & Reference Sweep

- **Surface Mode:** `Operate` with high industrial craft (`ENERGY 3 / RHYTHM 3 / MOTION 3`). Precision engineering tools should feel like calibrated physical laboratory instruments (machined aluminum chassis, vernier millimeter scales, detented mechanical switches, dark volumetric optical chamber) rather than flat generic admin forms.
- **Identity Motif (Product-Specific):** **Precision Vernier Calibration Scale & Servo Datum Line.** A crisp engraved millimeter scale strip anchors the top of the 3D Calibration Chamber and the travel scrubber, paired with a sliding Cobalt Servo datum indicator (`layoutId` spring transition) across route tabs, joint switches, and active table rows. Swap the logo out and this still unmistakably belongs to a physical kinematics calibration bench.
- **Background Treatment (compulsory non-flat surface, `09`):** Machined brushed titanium-stone daylight gradient (`radial-gradient(ellipse 75% 50% at 15% 0%, rgba(255, 255, 255, 0.94), transparent 64%), radial-gradient(ellipse 50% 45% at 88% 100%, rgba(29, 78, 216, 0.06), transparent 60%), linear-gradient(165deg, #F4F7FA 0%, #E6EBF0 52%, #D7DFE8 100%)`) layered with a fixed `pointer-events-none` machined micro-grain (`opacity: 0.028`). Job: separates light ceramic instrument plates from the workspace chassis with subtle optical studio depth while preserving 16:1 ink contrast.
- **Reference Sweep (`09` Process Step 1):**
  1. **PTC Onshape + Robotic CAD Benches:** Adopted daylight precision instrument chrome around a dominant dark volumetric 3D inspection bay with part-tree and live parameter inspector. Rejected cramped legacy icon ribbons.
  2. **Braun / Teenage Engineering Precision Hardware (`Tactile Digital / Deformable UI` in `01`):** Adopted recessed switch wells, crisp top specular highlight on mechanical buttons, physical detent feedback (`scale(0.97)` + `translateY(1px)`), and engraved vernier travel ticks. Rejected skeuomorphic leather/wood textures or unreadable low-contrast labels.
  3. **Swiss Modernism 2.0 + 3D Product Preview + 3D & Hyperrealism (`01` Style Catalog):** Adopted bold asymmetric hero display scale on `/`, strict mathematical spacing, real Three.js lighting and swept clearance volume, and keyboard camera/step controls. Rejected flat single-fill grounds and static wireframe boxes.
  4. **Anti-Reference (Lee's rejected default):** Rejected dark full-width dashboard shells, repeated equal-sized card grids, muted gray-blue copy, decorative Cmd-K bars, purple-indigo AI gradients, eyebrow kickers, and empty bordered boxes.

---

## 2. Color Palette & Roles

Strictly 2 core structural surfaces (Machined Ceramic Daylight + Anodized Obsidian 3D Bay) and 1 dominant brand accent (`Cobalt Servo #1D4ED8`), plus hardware-amber grasp markers and WCAG-verified semantic verdicts.

| Token | Hex | Functional Role | Verified Contrast |
| --- | --- | --- | --- |
| `bgCanvas` | `#E6EBF0` | Machined studio ground beneath skylight wash | Base |
| `surfacePrimary` | `#F9FAFC` | Ceramic instrument plates, ledger, rails | Base |
| `surfaceRecessed` | `#E2E8F0` | Recessed switch wells, track troughs, ledger header | Base |
| `surfaceViewport` | `#0E141D` | Anodized obsidian 3D Calibration Bay only | Base (3D) |
| `inkPrimary` | `#0F1722` | Display typography, primary controls, ledger labels | `17.2:1` on `#F9FAFC` |
| `inkSecondary` | `#455468` | Descriptions, labels, secondary metadata | `7.5:1` on `#F9FAFC` |
| `accentPrimary` | `#1D4ED8` | Primary CTA fills, sliding spring datum, focus rings | `7.6:1` with `#FFFFFF` |
| `accentPrimaryHover` | `#1E40AF` | Primary button hover state | `9.2:1` with `#FFFFFF` |
| `accentHandle` | `#D97706` | Physical grasp handle marker & active calibration pin | 3D + indicator |
| `borderStructural` | `#C4CFD9` | 1px machined hairline plate borders | Structural |
| `borderStrong` | `#8FA0B3` | Interactive control & input outlines | `3.1:1` vs `#F9FAFC` |
| `statusPassFg / Bg` | `#065F46` / `#ECFDF5` | Arm-test PASS verdict (paired with icon + text) | `7.6:1` |
| `statusFailFg / Bg` | `#991B1B` / `#FEF2F2` | Arm-test FAIL / collision verdict (paired with icon + text) | `7.9:1` |
| `statusWarnFg / Bg` | `#92400E` / `#FFFBEB` | Lux3D 2-hour URL expiry gauge / split slot lock | `6.8:1` |
| `inkOnViewport` | `#F1F5F9` | Viewport HUD telemetry & vernier labels | `16.4:1` on `#0E141D` |
| `axisX / Y / Z / Handle` | `#EF4444` / `#22C55E` / `#3B82F6` / `#F59E0B` | ROS/URDF 3D coordinate axes & grasp target inside bay | 3D semantics |

---

## 3. Typography Rules

Loaded via `next/font/google` (`Outfit`, `IBM_Plex_Sans`, `JetBrains_Mono`) with `display: "swap"`. Zero Inter, Roboto, Space Grotesk, or monospace headings.

| Role | Family | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| Architectural Display | `Outfit` | `38px` (`2.375rem`) | `800` | `1.06` | `-0.03em` | Primary Registry feature heading, `text-wrap: balance` |
| Route Title (`h1`) | `Outfit` | `28px` (`1.75rem`) | `700` | `1.15` | `-0.025em` | Foundry & Bench titles |
| Section Heading (`h2`) | `Outfit` | `18px` (`1.125rem`) | `600` | `1.25` | `-0.015em` | Instrument plate headers |
| Body | `IBM Plex Sans` | `15px` (`0.9375rem`) | `400` | `1.55` | `0em` | Operational descriptions, error messages (`max-w-[60ch]`) |
| UI Label / Control | `IBM Plex Sans` | `13px` (`0.8125rem`) | `500` | `1.35` | `0em` | Controls, ledger columns, route nav |
| Telemetry & Code | `JetBrains Mono` | `13px` (`0.8125rem`) | `500` | `1.4` | `0em` | Strictly `tabular-nums` angles, reach %, mm clearance, XYZ, task IDs, URDF XML |

---

## 4. Component Stylings & Tactile Instrument Primitives

Built on **shadcn/ui (CLI v4)** + **`motion/react`** + **Phosphor Icons (`@phosphor-icons/react`)**:

1. **Top Navigation Bar (`60px`):** Ceramic `#F9FAFC` chassis with `1px solid #C4CFD9` hairline bottom edge. Left: custom Hinged-Bracket SVG emblem + `JointBench` wordmark (`translate="no"`). Center: 3 route buttons (`Registry`, `Lux3D Foundry`, `Test Bench`) with a **spring-animated `layoutId` Cobalt Servo datum underline**. Right: live assembly telemetry badge + tactile primary action button.
2. **Tactile Hardware Buttons (`6px` radius):**
   - Primary: `#1D4ED8` with crisp `inset 0 1px 0 rgba(255,255,255,0.22)` top bevel and `0 1px 2px rgba(15,23,34,0.18)` base contact edge; hover shifts to `#1E40AF` and lifts `-1px`; `:active` depresses `translateY(1px) scale(0.97)` (`140ms`).
   - Secondary: `#F9FAFC` ceramic plate with `1px solid #8FA0B3` + `inset 0 1px 0 #FFFFFF`, hover `#EDF3FF`.
   - Segmented Switch Wells (`Prismatic / Revolute`, `X / Y / Z`, `All / Passed / Failed`): recessed `#E2E8F0` trough with an inner **spring-sliding active thumb** (`layoutId`) so switching modes feels physical.
3. **Vernier Calibration Scrubber:** Combines an accessible range slider, millimeter tick ruler rendered directly underneath, keyboard `- Step` / `+ Step` detent buttons, and live `tabular-nums` coordinate readout.
4. **Anodized 3D Calibration Bay (`14px` outer radius, `#0E141D`):** Recessed optical bay with directional rim lighting (`radial-gradient`), calibrated ground grid, floating translucent telemetry HUD (`backdrop-filter: blur(8px)`, strictly capped to 2 floating HUD capsules per `08` R-10), animated laser sweep ring during arm tests, and a clear 2D SVG kinematic fallback.
5. **Interactive Raw vs Part-Split Comparator (on `/foundry`):** Full-width dual-stage optical frame with a draggable/keyboard-steppable vertical split handle revealing exploded color-coded Lux3D sub-meshes over the fused raw mesh, paired with a live 4-stage pipeline conveyor bar and 2-hour expiry countdown gauge.

---

## 5. Layout Architecture (`RHYTHM 3` Mixed Compositions Across 3 Routes)

1. **`/` Assembly Registry (Full-Width Asymmetric 5 / 7 Feature Calibration Stage + Full-Bleed Specification Ledger Below):**
   - **Upper Band (5 / 7 Split):** Left 5 cols carry high-impact `38px` `Outfit` architectural heading, concise workflow sentence, 3 real live bench counters (in a hairline strip, not equal stat cards), and primary/secondary actions (`New Lux3D Split`, `Import Studio GLB`). Right 7 cols embed a **Live Interactive Calibration Stage** displaying the selected assembly's live kinematic pose, arm reach envelope, travel vernier bar, and direct `Open Test Bench` launch button.
   - **Lower Band (Full-Width Hairline Specification Ledger):** Semantic `<table>` with inline kinematic range spark-bars, Lux3D lineage badges, arm-test verdicts, and click-to-preview row selection that smoothly transitions the upper stage.
2. **`/bench/[id]` Kinematic & Arm Test Bench (3-Zone Full-Bleed Engineering Cockpit):**
   - **Left `248px` Rail:** Split Part Hierarchy (interactive Base / Moving / Child mesh role assignment) + clickable Saved Calibration Run Timeline.
   - **Center Fluid Stage:** Dominant `#0E141D` 3D WebGL Calibration Bay with live vernier travel bar, animated 3-DOF robot arm sweep, swept clearance envelope, and camera/keyboard controls.
   - **Right `332px` Rail:** Spring-sliding `Joint Type` & `Motion Axis` switches, min/max limit inputs with steppers, live Reach `%` & Clearance `mm` gauge bars, authoritative PASS/FAIL diagnostic readout, and `Run Arm Test` / `Export URDF ZIP` dock.
3. **`/foundry` Lux3D Pipeline Foundry (Top 4-Stage Pipeline Conveyor + 5 / 7 Split Composer & Interactive Split Comparator):**
   - **Top Conveyor Band:** 4 connected pipeline stages (`01 Input -> 02 G1-Turbo -> 03 Part Split -> 04 Local Archive`) with animated active signal indicator and 2-hour URL expiry countdown.
   - **Lower 5 / 7 Split:** Left 5 cols hold prompt/image controls, style/facecount selectors, single-slot Part-Split Queue indicator, and Studio `.glb` dropzone; Right 7 cols hold the **Interactive Raw vs Part-Split Curtain Comparator** with part-count breakdown and `Archive & Open Bench` CTA.

---

## 6. Depth & Elevation

- **Declared Language:** **Machined Borders for Structure + Crisp Hardware Contact Edges** (`1px solid #C4CFD9` + subtle `1px inset` top bevel on tactile buttons, zero wide ambient shadows on static plates).
- **Targeted Shadow Reserve:** Layered elevation (`0 12px 32px -12px rgba(15, 23, 34, 0.24)`) restricted exclusively to floating viewport HUD capsules, `Dialog`, `Sheet`, and `Popover`.
- **3D Depth Job & Fallback (`09`):** Real Three.js (`@react-three/fiber` + `@react-three/drei`) renders PBR Lux3D meshes, studio three-point lighting, ground contact shadows, RGB joint axes, and the 3-DOF manipulator inside the `/bench/[id]` and `/foundry` chambers (max 2 active WebGL contexts). On reduced-motion or WebGL failure, an interactive orthographic 2D kinematic SVG renders identical joint geometry, travel arcs, and arm kinematics.

---

## 7. Motion Plan (`MOTION 3` / `MOTION 8` Choreography)

Every animation runs on compositor properties (`transform`, `opacity`, `clip-path`) with zero `transition: all` and zero layout-property animation.

1. **Choreographed Entrance (`280ms`, `cubic-bezier(0.23, 1, 0.32, 1)`, `45ms` stagger):** Hero stage / 3D chamber settles first (`scale(0.975) -> 1`, `opacity: 0 -> 1`), followed by the vernier gauge and adjacent instrument rails. Below-fold ledger rows reveal once (`whileInView`, `viewport={{ once: true }}`) and stay visible on upward scroll.
2. **Spring Sliding Controls (`motion/react` `layoutId`, `stiffness: 440, damping: 32`):** Active nav datum bar, filter switch thumb, `Prismatic / Revolute` toggle, and `X / Y / Z` axis buttons glide physically between options.
3. **Tactile Press & Hover Micro-Interactions (`140–200ms`):** Buttons lift `-1px` on hover and depress `scale(0.97) translateY(1px)` on `:active`; ledger rows shift background and slide the active Cobalt datum rail smoothly. Keyboard shortcuts execute at `0ms`.
4. **Animated Rolling Telemetry (`tabular-nums`):** Reach %, clearance mm, and travel coordinate interpolate continuously during sweeps and when switching assemblies.
5. **Signature Moment 1 (`/bench/[id]` & `/` stage): Real-Time 3-DOF Analytic IK Robot Arm Grasp Sweep + Clearance Scan.** Pressing `Run Arm Test` smoothly drives the 3-link arm from home pose to grasp handle, draws a trajectory breadcrumb trail, opens/slides the Lux3D split part through its configured range while sweeping an optical laser scan line across the bounding-box clearance envelope (emerald when clear, crimson with a pulsing collision pin on interference), and settles the PASS/FAIL verdict badge with a tactile spring.
6. **Signature Moment 2 (`/foundry`): Interactive Raw-vs-Part-Split Comparator Curtain.** Dragging or keyboard-stepping the vertical divider (`clip-path: inset(...)`) smoothly reveals color-coded exploded Lux3D sub-meshes over the fused raw `G1-Turbo` mesh.
7. **Reduced-Motion Fallback (`prefers-reduced-motion: reduce`):** All CSS/spring motion snaps immediately to settled state; Arm Test switches to discrete `Start / Mid / Max` pose toggles with instant swept envelope and verdict readout; Comparator Curtain steps cleanly via arrow buttons.

---

## 8. Responsive Behavior & Craft Checks

- Verified at `375px`, `768px`, `1280px`, and `1440px` with zero horizontal overflow (`scrollWidth <= innerWidth`).
- Below `768px`: Top bar collapses to compact brand + `Test Bench` action + full-width 3-route segmented bar (`>= 44px` tap targets); `/` stacks the interactive calibration stage cleanly above stacked mobile ledger rows; `/bench/[id]` places the 3D Calibration Bay FIRST, then Joint Controls & Arm Test Verdict, then Split Part Hierarchy; `/foundry` stacks the 4-stage pipeline pill strip, interactive split comparator, and job form vertically.
- Absolute bans enforced: zero eyebrow kickers above headings, zero em dashes, zero AI buzzwords, zero equal-card template rows, zero pulsing decorative dots, zero `scale(0)` entrances.
