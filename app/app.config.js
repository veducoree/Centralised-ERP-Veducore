/**
 * Extends app.json with one alternate launcher icon per school.
 * The list comes from assets/school-icons/manifest.json, produced by
 * `npm run icons:sync` (scripts/sync-school-icons.mjs).
 */
const fs = require('fs');
const path = require('path');

function schoolIcons() {
  const file = path.join(__dirname, 'assets/school-icons/manifest.json');
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

module.exports = ({ config }) => {
  const icons = schoolIcons().map((e) => ({
    name: e.name,
    ios: `./assets/school-icons/${e.name}/icon.png`,
    android: {
      foregroundImage: `./assets/school-icons/${e.name}/foreground.png`,
      backgroundColor: e.backgroundColor || '#FFFFFF',
    },
  }));

  const plugins = (config.plugins || []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== 'expo-alternate-app-icons',
  );
  plugins.push(['expo-alternate-app-icons', icons]);

  return { ...config, plugins };
};
