---
"react-smart-copy": patch
---

Fix `formatColor` for greys from other colour spaces in `hsl` and `hwb`: white from `color(display-p3 1 1 1)` was written as `hsl(240 NaN% 100%)`, and greys from Lab or OKLCH came out with a made-up hue and saturation (`lab(100 0 0)` as `hsl(120 50% 100%)`). Greys are now `hsl(0 0% …)` and `hwb(0 …)`; real tints keep their hue, however faint.

Also hardening, with no other change in behaviour:

- Colour conversions are typed end to end: three-component vectors no longer need casts, so the compiler checks every step.
- 100% test coverage now comes from deterministic tests alone, and the property tests run separately, so coverage never depends on a random seed. Colour property tests now draw edge values (0, 0.5, 1) often, and check that no format ever writes `NaN` and that greys stay grey.
- Stricter TypeScript settings (`noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`), and type tests for `react-smart-copy/capture`.
