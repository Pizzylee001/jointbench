# JointBench

**Kinematics Calibration, 3-DOF Robot Arm Clearance Verification, and URDF Packaging Workbench for Aholo Lux3D Part-Split Assets.**

Built for the **Manycore Aholo Global 3D AI Hackathon** (Embodied AI / Robotics Track).

---

## What Problem JointBench Solves

Text-to-3D generators produce realistic visual meshes, yet almost every generated object fails immediately when imported into MuJoCo, PyBullet, or NVIDIA Isaac Sim for robotic manipulation training:

1. **Monolithic geometry cannot articulate.** A drawer fused into a cabinet body cannot slide open.
2. **Even split meshes lack kinematic semantics.** A part-split `.glb` still has no parent/child link bindings, joint type (`prismatic` vs `revolute`), motion axis, physical travel limits, or grasp handle frame.
3. **Unchecked travel limits break robot policies.** An over-extended hinge limit (for example, opening a storage chest lid to 125 deg) causes the moving link to collide with its own base or forces a tabletop robotic arm past its kinematic reach limit.

**JointBench** closes the gap between **Aholo Lux3D** and real robotics simulation in one browser-based engineering workbench:

- Generates PBR 3D meshes via **Aholo Lux3D `G1-Turbo`** and splits them into independent links via **Aholo Lux3D Part Split** (or imports local `.glb` exports from Aholo 3D Studio).
- Inspects Raw Monolith vs. Part-Split topology with an interactive 3D split curtain and exploded-link view.
- Binds individual sub-meshes to `base` and `moving` links, calibrates `Prismatic` / `Revolute` joints, axes, pivots, and physical travel limits in a real-time Three.js 3D viewport.
- Sweeps a **3-DOF spatial robotic manipulator** (`L1 = 0.44 m`, `L2 = 0.41 m`, `0.85 m` max reach) across 24 trajectory waypoints to compute exact workspace reach percentage and swept body clearance in millimeters.
- Exports a self-contained **Sim-Ready URDF `.zip` package** containing valid URDF 1.0 XML (with `grasp_handle_frame`), the split `.glb` mesh, `grasp-spec.json`, `test-report.json`, and a simulator loading guide.

---

## Application Routes & Workflow

JointBench is structured as a three-route Next.js 16 engineering suite:

| Route | Purpose | Key Capabilities |
| :--- | :--- | :--- |
| `/` | **Assembly Registry** | Tracks archived Lux3D assets and user imports with live 2D kinematic preview, URL-synced status filters (`All`, `Passed`, `Flagged`), search, and one-click entry into the 3D bench. |
| `/foundry` | **Lux3D Pipeline Foundry** | 4-stage pipeline conveyor (`Prompt/Upload -> Lux3D G1-Turbo -> Lux3D Part Split -> Local Archive`), live Aholo API job runner with 1-active-slot Part-Split guard and 2-hour CDN TTL countdown, local Studio `.glb` dropzone with client-side binary glTF 2.0 parser, and an interactive **3D Raw vs. Part-Split Curtain Comparator**. |
| `/bench/[id]` | **3D Kinematic & Robot Arm Test Bench** | Three-zone calibration cockpit: Split Parts hierarchy + saved run history (left), interactive Three.js 3D Calibration Chamber with live articulated GLB sub-meshes, 3-DOF robot arm, swept clearance volume, and RGB pivot triad (center), plus Joint Spec controls, live Reach/Clearance gauges, one-click `Apply Recommended Safe Limit`, live `URDF XML` inspector, and `.zip` packager (right). |

---

## Verified Aholo Lux3D API Integration

All Aholo Lux3D calls execute server-side through validated Next.js App Router endpoints (`src/app/api/lux3d/*`) with Zod payload validation and an HTTPS SSRF domain allowlist (`*.kujiale.com`, `*.aholo.ai`, `*.aholo3d.cn`):

| Next.js Endpoint | Upstream Aholo Lux3D Endpoint | Role |
| :--- | :--- | :--- |
| `GET /api/lux3d/status` | Server environment check | Reports whether `AHOLO_API_KEY` is configured server-side (never exposes the key). |
| `POST /api/lux3d/generate` | `POST /global/lux3d/v1/generate/text-to-3d/task/create` | Queues `G1-Turbo` or `G1` PBR `.glb` generation (`aiPredictSize: true`). |
| `POST /api/lux3d/part-split` | `POST /global/lux3d/v1/part-split/task/create` | Separates a monolithic `.glb` into independent sub-meshes (respects 1-active-slot account concurrency). |
| `POST /api/lux3d/articulate` | `POST /global/lux3d/v1/articulation-animation/task/create` | Optional Lux3D articulation animation generation on split assets. |
| `GET /api/lux3d/task/[id]` | `GET /global/lux3d/v1/generate/task/get?taskid={id}` | Polls task status (`queued`, `running`, `succeeded`, `failed`) and returns temporary CDN URLs with 2-hour TTL tracking. |
| `GET /api/lux3d/fetch-glb` | Allowlisted Aholo/Kujiale CDN proxy | Fetches temporary `.glb` binaries cleanly for permanent local IndexedDB archival. |

### Archived Real Lux3D Raw -> Part-Split Benchmarks

Because Aholo temporary CDN URLs expire after 2 hours, JointBench permanently archives three real Lux3D `G1-Turbo` Raw + Part-Split `.glb` pairs in `public/assets/lux3d/` (with exact vertex-computed bounding boxes in `public/assets/lux3d/manifest.json`) so judges can test the full 3D workbench immediately on cold load:

| Assembly | Raw Task ID (Meshes) | Split Task ID (Links) | Triangles | Dimensions (W x H x D) | Calibrated Joint | Initial Arm Test Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Bedside Drawer Cabinet** | `#8414321` (1) | `#8419896` (**3 links**) | 55,048 | `0.50 x 0.50 x 0.44 m` | Prismatic `+Z` (`0.00..0.24 m`) | **PASS** (61% reach, `+80 mm` clearance) |
| **Retro Countertop Microwave** | `#8419899` (1) | `#8420171` (**4 links**) | 48,268 | `0.48 x 0.35 x 0.33 m` | Revolute `-Y` (`0..88 deg`) | **PASS** (61% reach, `+45 mm` clearance) |
| **Brass-Clasped Storage Chest** | `#8419904` (1) | `#8420433` (**6 links**) | 52,776 | `0.35 x 0.17 x 0.20 m` | Revolute `-X` (`0..125 deg` -> `0..92 deg`) | **FAIL** at 125 deg (`99% reach, -59 mm`) -> **PASS** at 92 deg (`+34 mm`) |

> **Why the Storage Chest starts in `FAIL`:** It ships with an intentionally over-extended `125 deg` lid limit so you can observe real rear-clearance collision (`-59 mm`) and arm reach saturation (`99%`) in 3D, then click **Apply Recommended Safe Limit** (`92 deg`) to watch the verdict flip to `PASS (+34 mm)` live.

---

## 3-DOF Robotic Arm IK & Clearance Solver

Implemented in `src/lib/kinematics.ts`:

- **Manipulator Geometry:** 3-DOF spatial arm with yaw base pedestal, upper arm `L1 = 0.44 m`, forearm `L2 = 0.41 m`, and `0.85 m` radial workspace envelope.
- **24-Waypoint Sweep:** Evaluates `transformPointByJoint(graspHandle, joint, q)` across 24 evenly spaced coordinates between `minLimit` and `maxLimit`, solving closed-form law-of-cosines IK (`yawAngle`, `shoulderAngle`, `elbowAngle`) at each waypoint.
- **Swept Body Clearance:** Measures moving-link clearance against static base bounds and rear hinge collision envelopes, surfacing the first offending waypoint and exact recommended safe limit whenever a collision or reach saturation occurs.

---

## Sim-Ready URDF Export Specification

Clicking **Export Sim-Ready URDF ZIP** in `/bench/[id]` runs client-side `JSZip` packaging (`src/lib/urdf-export.ts`) and downloads `<asset_slug>-sim-ready-urdf.zip`:

```text
bedside_drawer_cabinet-sim-ready-urdf.zip
├── bedside_drawer_cabinet.urdf        # Valid URDF 1.0 XML with base/moving links, joint limits, and grasp_handle_frame
├── meshes/
│   └── bedside_drawer_cabinet_split.glb  # Permanently archived part-split GLB mesh
├── grasp-spec.json                    # Grasp handle frame, part-to-link bindings, Lux3D task provenance
├── test-report.json                   # Deterministic 24-waypoint 3-DOF arm IK & clearance verification log
└── README_SIM.md                      # Quick-start instructions for PyBullet, MuJoCo, and Isaac Sim
```

### Quick Load Example (PyBullet)

```python
import pybullet as p

p.connect(p.GUI)
asset_id = p.loadURDF("bedside_drawer_cabinet.urdf", useFixedBase=True)
for j in range(p.getNumJoints(asset_id)):
    info = p.getJointInfo(asset_id, j)
    print(j, info[1].decode(), "type:", info[2], "limits:", info[8], info[9])
```

---

## Tech Stack

- **Framework:** Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5
- **3D & Kinematics:** Three.js, `@react-three/fiber`, `@react-three/drei`, custom binary glTF 2.0 parser (`src/lib/glb-parser.ts`)
- **UI & Motion:** Tailwind CSS v4, shadcn/ui (Radix primitives), `motion/react` (reduced-motion aware), `@phosphor-icons/react`
- **Packaging & Validation:** `JSZip`, `zod`, browser `localStorage` + `IndexedDB` persistence

---

## Local Development

```bash
# 1. Clone the repository
git clone https://github.com/Pizzylee001/jointbench.git
cd jointbench

# 2. Install dependencies
npm install

# 3. Configure your Aholo Labs API key (optional for archived assets, required for live generation)
cp .env.example .env.local
# Edit .env.local and set AHOLO_API_KEY=<your_aholo_labs_api_key>

# 4. Run development server
npm run dev
```

Open `http://localhost:3000`. All 3 archived Lux3D assets work offline immediately without an API key; live Lux3D generation and part-splitting in `/foundry` use either the server `AHOLO_API_KEY` or an optional session-only key entered in the Foundry UI.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
```

---

## Deploying to Vercel

1. Import `Pizzylee001/jointbench` in the Vercel dashboard (Framework Preset: **Next.js**).
2. Under **Environment Variables**, add:
   - `AHOLO_API_KEY` = your Aholo Labs API key (Server-side only; never prefixed with `NEXT_PUBLIC_`).
3. Click **Deploy**.

All six archived Lux3D `.glb` binaries are served directly from `public/assets/lux3d/`, and all `/api/lux3d/*` routes run automatically as Vercel serverless functions.

---

## Security Notes

- `AHOLO_API_KEY` is read strictly on the server in `src/lib/lux3d.ts` and never serialized into client bundles or HTML responses.
- Optional BYO session keys entered in `/foundry` are stored only in `sessionStorage` for the active browser tab and forwarded via request header to the Next.js server proxy.
- `/api/lux3d/fetch-glb` enforces an HTTPS allowlist (`*.kujiale.com`, `*.aholo.ai`, `*.aholo3d.cn`) to prevent SSRF.
