---
name: react-bits
description: React Bits (reactbits.dev, github.com/DavidHDev/react-bits), open-source React components for animated text, animations, backgrounds and micro-interactions (SplitText, BlurText, CountUp, AnimatedList, Aurora, Magnet, switches, loaders…). Use when Ravitime needs a ready-made animated React component, or when the user mentions React Bits.
---

# React Bits

React Bits is a catalogue of copy-in React components, each in four flavours: JS or TS, plain CSS or Tailwind. Components land in the project as source files (like shadcn/ui), not as a runtime dependency.

## Find a component

The catalogue for agents is `https://www.reactbits.dev/llms.txt`. It lists every component, its page and its CLI name (PascalCase, e.g. `SplitText`). Fetch it rather than guessing names. Each component page shows its props and a live preview.

Categories: Text Animations, Animations, Backgrounds, UI Components, Micro (switches, buttons, loaders).

## Add it to Ravitime

Ravitime's front end (`frontend/`) is React + TypeScript with plain CSS (`src/styles.css`), and no Tailwind. Always take the **TS-CSS** flavour:

```bash
cd frontend
npx jsrepo@latest add https://reactbits.dev/r/<Component>-TS-CSS
```

Then:

1. Read the files it added and their imports. Install the component's own dependencies (some need `gsap`, `motion`, `three` or `ogl`). Prefer components whose dependencies the app already has, or that need none. Mobile bundle size matters: Ravitime also ships as an iPhone app.
2. Move the component into `src/components/`. Make its CSS follow the project: colours from the `:root` tokens in `styles.css` (`--accent`, `--text`, `--surface`…, with their dark-mode values), and fonts Barlow / Barlow Semi Condensed. Don't add a second palette.
3. Honour `prefers-reduced-motion`: render the end state without motion.
4. Check it at 390 px wide (phone) and in dark mode before keeping it.

## When not to use it

Ravitime is a working tool read on the run: legibility comes first (PRODUCT.md). Use a React Bits component for one deliberate moment (a number that counts up, a list that appears, a loader). Don't scatter effects, and don't use flashy backgrounds behind data. For hand-tuned motion, see the `gsap-*` and `transitions-*` skills.

## Licence

MIT + Commons Clause: free to use inside an application, website or product. Keep the copyright notice in the copied files. The components may not be sold as a component library.
