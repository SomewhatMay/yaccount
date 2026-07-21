import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: ["out/**", ".next/**", "node_modules/**"],
  },
  {
    // §0.6 / impl §2 "Key structural rule": src/core is pure, platform-agnostic
    // TypeScript. It must never import React, Next, Capacitor, or drivestore —
    // that boundary is what lets all product logic be unit-tested in Node and
    // keeps sync (M9) / native (M10) as isolated seams.
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/core must stay platform-agnostic (impl §2)." },
            {
              name: "react-dom",
              message: "src/core must stay platform-agnostic (impl §2).",
            },
            { name: "next", message: "src/core must stay platform-agnostic (impl §2)." },
            {
              name: "drivestore",
              message: "src/core must not depend on the backend (impl §2).",
            },
          ],
          patterns: [
            {
              group: [
                "react/*",
                "react-dom/*",
                "next/*",
                "@capacitor/*",
                "@capacitor-community/*",
                "drivestore/*",
              ],
              message:
                "src/core must stay platform-agnostic — no React/Next/Capacitor/drivestore (impl §2).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
