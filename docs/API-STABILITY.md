# ElfUI API Stability

This policy applies during the remaining `0.1.0` beta and release-candidate cycle.

## Stable Beta Surface

The following package entry points are user-facing beta APIs:

- `@elfui/core`
- `@elfui/reactivity`
- `@elfui/runtime`
- `@elfui/compiler`
- `@elfui/compiler/compile`
- `@elfui/compiler/macro-component`
- `@elfui/compiler/vite`
- `@elfui/compiler-template`
- `@elfui/vite-plugin`

Changes to these entry points require a changeset and an updated declaration snapshot. A passing
name-only export check is not sufficient: parameters, returns, generics, overloads, interface
members, and optional or readonly state are part of the contract.

## Generated Internal Surface

`@elfui/core/internal` and `@elfui/runtime/internal` are reserved for compiler-generated code and
framework-owned tooling. Application and component-library source must not import them directly.

These entry points are protected by the compiler protocol rather than by independent semantic
versioning. An incompatible generated-helper change must increment the compiler protocol and ship
in the fixed Core, Compiler, and Vite Plugin release group.

## Experimental Surface

ElfUI currently has no supported experimental entry point. Future experiments must use an explicit
`/experimental` export and must not be re-exported from a stable package root.

Experimental APIs still require tests and documentation, but may change between beta releases with
a changeset and migration note.

## Deprecation And Removal

- Mark the symbol with `@deprecated`, its replacement, and the earliest removal release.
- Keep a deprecated stable API for at least two consecutive beta releases.
- Add a changeset when the deprecation is introduced and when it is removed.
- Search the complete ElfUI workspace and official ecosystem repositories before removal.
- Remove stale compatibility adapters before RC so they do not become accidental stable APIs.

Correctness fixes may change undocumented behavior without a deprecation window when the old
behavior could leak resources, violate platform semantics, or never had an observable effect. Such
changes still require regression tests and a changeset.

## Release Gates

- Canonical public declaration snapshot.
- Public/internal import-boundary checks.
- Compiler protocol and fixed-version compatibility checks.
- `publint` package validation.
- `@arethetypeswrong/cli` ESM and bundler resolution validation.
- Tarball consumer verification through `pnpm verify:publish:artifacts`.
