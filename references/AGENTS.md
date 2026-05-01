Original minified code: m=el_main.js

Extract only the core page translation logic, removing:
- Polyfills
- Closure Library framework
- UI widgets (TranslateElement)
- Analytics/telemetry
- Spelling suggestions
- Voting feedback

Use only this API endpoint:
- `https://translate-pa.googleapis.com/v1/translateHtml` (POST)

Use modern ES2025 JavaScript syntax and browser APIs only.
