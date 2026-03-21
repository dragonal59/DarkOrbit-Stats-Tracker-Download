/**
 * Identifiants en dur pour le scraping "Événements DO" (page d'accueil DarkOrbit).
 * Non exposés au renderer — utilisé uniquement par le process principal.
 */
const DO_EVENTS_CREDENTIALS = {
  username: 'fr1ss',
  password: 'lolmdr123',
};

function getDoEventsCredentials() {
  return { ...DO_EVENTS_CREDENTIALS };
}

module.exports = { getDoEventsCredentials, DO_EVENTS_CREDENTIALS };
