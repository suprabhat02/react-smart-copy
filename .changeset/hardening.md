---
"react-smart-copy": patch
---

Hardening, with no change in behaviour:

- Colour conversions are typed end to end: three-component vectors no longer need casts, so the compiler checks every step.
- 100% test coverage now comes from deterministic tests alone, and the property tests run separately, so coverage never depends on a random seed.
- Stricter TypeScript settings (`noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`), and type tests for `react-smart-copy/capture`.
