# Three.js (vendored)

Offline ES modules used by the plaza's WebGL disc gallery. The existing
`import * as THREE from './vendor/three.module.js'` entry remains unchanged.

## Official source and license

- Package: **three@0.178.0**, release **r178** (`REVISION = '178'`).
- Upstream: https://github.com/mrdoob/three.js
- Version metadata: https://registry.npmjs.org/three/0.178.0
- Pinned npm tarball: https://registry.npmjs.org/three/-/three-0.178.0.tgz
- `three.module.js`: byte-for-byte copy of `package/build/three.module.js`.
- `three.core.js`: byte-for-byte copy of `package/build/three.core.js`.
- `LICENSE`: complete, unmodified `package/LICENSE` (MIT, copyright
  2010–2025 three.js authors). Both JavaScript license headers are also preserved.

Metadata and tarball were downloaded over HTTPS into separate new, empty
temporary directories. Only the two builds, LICENSE and package.json were
extracted into another new, empty temporary directory after integrity and
archive-path checks; package.json was inspected there, not installed here.
Python ran with `-I`. No npm install, package scripts or build scripts were run.

## Local dependency closure and API checks

```text
three.module.js
└── ./three.core.js
    └── no module imports
```

The entry's import and re-export declarations resolve only to `./three.core.js`.
Neither build has dynamic imports, CommonJS dependencies or source-map fetches.
No CDN, reference-site chunk, import map or bundler is needed to load these
modules when the prototype is served over local HTTP.

- Node's `vm.SourceTextModule` parsed and linked the module graph without
  evaluating the downloaded code.
- All **419 named exports** match the previous entry's export names exactly.
- The existing gallery's unchanged import path links successfully; all
  referenced `THREE` API names are present.
- The core's declared revision is `178`.

## Integrity

The downloaded tarball matched both the version metadata's SHA-512 SRI and
SHA-1 (`470fb4bc35bc0782dfe9a2c9b157fcbc1944bc44`). Its SHA-512 SRI is:

```text
sha512-ybFIB0+x8mz0wnZgSGy2MO/WCO6xZhQSZnmfytSPyNpM0sBafGRVhdaj+erYh5U+RhQOAg/eXqw5uVDiM2BjhQ==
```

SHA-256 checksums of the downloaded archive and exact installed files:

| Artifact | SHA-256 |
| --- | --- |
| `three-0.178.0.tgz` (temporary download; not installed) | `f9f1b23202c4697cbca9d97369559855517a7d0089f6c70f88014ce7deec474d` |
| `three.module.js` | `bc0d236927f5163414e7c59a5567257dfe925f1929ce0a151ac4185dc45ca5a2` |
| `three.core.js` | `562b72799ef1145f77997ece49a34f578422873757b0a13e41d76dcbfb776f06` |
| `LICENSE` | `bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601` |

## Retained legacy file

`three.module.B1_OyRqk.js` is the old core chunk from
`a24.raviklaassens.com/_astro/`, retained unchanged for provenance. It is not
part of the official npm artifacts above and is no longer reachable from the
active entry's import graph. It was not deleted or modified.

Its unchanged SHA-256 is
`8925f89a2df5feb4f341e2962ca1473c8830ceca367482afcb0d2cd566d971c1`.
