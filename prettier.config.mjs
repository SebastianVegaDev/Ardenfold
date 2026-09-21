/** @type {import("prettier").Config} */
const config = {
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    tabWidth: 4,
    printWidth: 100,
    plugins: ["prettier-plugin-tailwindcss"],
    tailwindStylesheet: "./apps/web/src/app/globals.css",
};

export default config;
