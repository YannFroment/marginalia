// Imported first by every entry point: fails with a readable message on an
// unsupported Node instead of a cryptic syntax/import error further down.
const MIN_MAJOR = 18;
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_MAJOR) {
  console.error(`Marginalia needs Node ${MIN_MAJOR}+ (you have ${process.versions.node}). Run \`nvm use\` (see .nvmrc) or install a newer Node.`);
  process.exit(1);
}
