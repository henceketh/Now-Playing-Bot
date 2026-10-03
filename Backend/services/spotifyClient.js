const axios = require('axios');

// Only the Spotify operations this application needs; no SDK internals or global defaults.
function createSpotifyClient({ clientId, clientSecret, redirectUri }, http = axios) {
  let accessToken;
  let refreshToken;

  async function grant(parameters) {
    const { data } = await http.post('https://accounts.spotify.com/api/token', new URLSearchParams(parameters).toString(), {
      timeout: 5000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return { body: data };
  }

  return {
    setAccessToken: value => { accessToken = value; },
    getAccessToken: () => accessToken,
    setRefreshToken: value => { refreshToken = value; },
    getRefreshToken: () => refreshToken,
    refreshAccessToken: () => grant({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    authorizationCodeGrant: code => grant({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    createAuthorizeURL(scopes, state) {
      const parameters = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: scopes.join(' '), state });
      return `https://accounts.spotify.com/authorize?${parameters}`;
    },
    async getMyCurrentPlaybackState() {
      const { data } = await http.get('https://api.spotify.com/v1/me/player', {
        timeout: 5000, headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { body: data };
    },
  };
}

module.exports = { createSpotifyClient };
