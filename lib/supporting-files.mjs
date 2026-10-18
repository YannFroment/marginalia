// Which files are supporting, not the core of a change: tests, database, generated
// files. A guided tour reads the core first and leaves these for the end. Pure.

const TESTS = /(^|\/)(__tests__|__mocks__|__snapshots__|tests?|specs?|e2e|cypress)\/|\.(test|spec|stories)\.[a-z]+$|\.snap$/i;
const DATABASE = /(^|\/)(migrations?|seeds?|prisma|fixtures?)\/|\.sql$/i;
const GENERATED = /(^|\/)(generated|__generated__|dist|build|\.next)\/|(^|\/)[^/]*generated[^/]*$|\.gen\.[a-z]+$|\.min\.(js|css)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|composer\.lock|Gemfile\.lock|poetry\.lock)$/i;

export const isSupportingPath = (path) => TESTS.test(path) || DATABASE.test(path) || GENERATED.test(path);

// A stop is supporting when it has files and every one of them is. A stop that mixes core
// and supporting files is core: it carries an idea of the change.
export const isSupportingStop = (files) => files.length > 0 && files.every(isSupportingPath);

// The core stops first, the supporting ones after, each group in the order given.
export const coreFirst = (stops) => [...stops.filter((s) => !s.supporting), ...stops.filter((s) => s.supporting)];
