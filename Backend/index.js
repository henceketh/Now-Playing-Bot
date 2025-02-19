const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os')
const crypto = require('crypto')
const { exec } = require('child_process');

dotenv.config();

const TOKEN_PATH = path.join('spotify-tokens.json');

function saveTokens(accessToken, refreshToken) {
    const tokenData = {
        access_token: accessToken,
        refresh_token: refreshToken,
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData));
}

function loadTokens() {
    if (fs.existsSync(TOKEN_PATH)) {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        return tokenData;
    } else {
        return null;
    }
}

const app = express();
app.use(cors());

console.log({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
})

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

spotifyApi.clientCredentialsGrant().then(
    function(data) {
        spotifyApi.setAccessToken(data.body['access_token']);
    },
    function(err) {
        console.log('Something went wrong when retrieving an access token', err);
    }
);

class Spotify {
    constructor(sp_dc) {
        this.token_url = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
        this.lyrics_url = 'https://spclient.wg.spotify.com/color-lyrics/v2/track/';
        this.sp_dc = sp_dc;
        this.cache_file = path.join(__dirname, 'spotify_cache.json');
    }

    async getToken() {
        try {
            const response = await axios.get(this.token_url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36',
                    'App-platform': 'WebPlayer',
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cookie': `sp_dc=${this.sp_dc};`
                }
            });

            const token_json = response.data;
            if (!token_json || token_json.isAnonymous) {
                console.log('The SP_DC set seems to be invalid, please correct it!');
            }

            fs.writeFileSync(this.cache_file, JSON.stringify(token_json));
        } catch (error) {
            console.error('Error fetching token:', error);
            console.log('Failed to retrieve token.');
        }
    }

    async checkTokenExpire() {
        if (fs.existsSync(this.cache_file)) {
            const json = JSON.parse(fs.readFileSync(this.cache_file, 'utf8'));
            const timeleft = json.accessTokenExpirationTimestampMs;
            const timenow = Date.now();

            await this.getToken();

            if (timeleft < timenow) {
                await this.getToken();
            }
        } else {
            await this.getToken();
        }
    }

    getLyrics = async (track_id) => {
        await this.checkTokenExpire()

        const json = JSON.parse(fs.readFileSync(this.cache_file, 'utf8'));
        const token = json.accessToken;

        const formatted_url = `${'https://spclient.wg.spotify.com/color-lyrics/v2/track/'}${track_id}?format=json&market=from_token`;

        try {
            const response = await axios.get(formatted_url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36',
                    'App-platform': 'WebPlayer',
                    'Authorization': `Bearer ${token}`
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching lyrics:', error.response.data);
            return false
        }
    }
}

async function fetchLyrics(song, artist) {
    const geniusApiUrl = `https://api.genius.com/search?q=${encodeURIComponent(song + ' ' + artist)}`;
    const options = {
        headers: {
            Authorization: `Bearer ${process.env.GENIUS_API_TOKEN}`,
        },
    };

    try {
        const response = await axios.get(geniusApiUrl, options);
        const hits = response.data.response.hits;
        if (hits.length > 0) {
            const lyricsUrl = hits[0].result.url;

            const lyricsPage = await axios.get(lyricsUrl);
            const $ = cheerio.load(lyricsPage.data);

            const lyricsArray = [];
            $('[data-lyrics-container=true]').each((i, elem) => {
                $(elem)
                    .find('br')
                    .replaceWith('\n');

                const text = $(elem).text().trim();

                if (text) {
                    lyricsArray.push(...text.split('\n').map(line => line));
                }
            });

            const strippedLyrics = lyricsArray.slice(2);

            return [
                strippedLyrics.length ? strippedLyrics : ['Lyrics not found.'],
                lyricsUrl
            ]
        } else {
            return ['Lyrics not found.'];
        }
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        return ['Error fetching lyrics.'];
    }
}

async function ensureAccessToken() {
    if (spotifyApi.getAccessToken()) {
        try {
            await spotifyApi.getMe();
        } catch (error) {
            await refreshAccessToken();
        }
    } else {
        console.error('No access token available');
    }
}

function transliterate(text) {
    const rus = "А-а-Б-б-В-в-Г-г-Д-д-Е-е-Ё-ё-Ж-ж-З-з-И-и-Й-й-К-к-Л-л-М-м-Н-н-О-о-П-п-Р-р-С-с-Т-т-У-у-Ф-ф-Х-х-Ц-ц-Ч-ч-Ш-ш-Щ-щ-Ы-ы-Э-э-Ю-ю-Я-я".split("-");
    const eng = "A-a-B-b-V-v-G-g-D-d-E-e-E-e-Zh-zh-Z-z-I-i-Y-y-K-k-L-l-M-m-N-n-O-o-P-p-R-r-S-s-T-t-U-u-F-f-Kh-kh-Ts-ts-Ch-ch-Sh-sh-Shch-shch-Y-y-E-e-Yu-yu-Ya-ya".split("-");

    let result = "";
    for (let i = 0; i < text.length; i++) {
        const index = rus.indexOf(text[i]);
        if (index >= 0) {
            result += eng[index];
        } else {
            result += text[i];
        }
    }
    return result;
}

function sanitizeHeaderContent(content) {
    content = transliterate(content);
    return content.replace(/[^ -~]/g, '');
}

app.get('/download-current-song', async (req, res) => {
    await ensureAccessToken();

    try {
        const data = await spotifyApi.getMyCurrentPlaybackState();
        if (data.body && data.body.is_playing) {
            const songName = data.body.item.name;
            const artistName = data.body.item.artists.map(artist => artist.name).join(', ');

            const filePath = await downloadSongFromYouTube(songName, artistName);

            if (filePath) {
                res.setHeader('X-Song-Name', sanitizeHeaderContent(songName));
                res.setHeader('X-Artist-Name', sanitizeHeaderContent(artistName));

                res.download(filePath, `${songName}-${artistName}.mp3`, err => {
                    if (err) {
                        console.error('Error sending file:', err);
                    }

                    fs.unlink(filePath, err => {
                        if (err) console.error('Error deleting file:', err);
                    });
                });
            } else {
                res.status(500).send('Failed to download the song.');
            }
        } else {
            res.status(404).json({ message: 'No song is currently playing' });
        }
    } catch (error) {
        console.log(error)
        res.status(500).send(error);
    }
});

async function downloadSongFromYouTube(songName, artistName) {
    const searchQuery = `${songName} ${artistName}`;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&key=${youtubeApiKey}`;

    try {
        const response = await axios.get(youtubeApiUrl);
        const videoId = response.data.items[0].id.videoId;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const tempDir = os.tmpdir();
        const randomFileName = `${crypto.randomBytes(16).toString('hex')}.mp3`;
        const outputFilePath = path.join(tempDir, randomFileName);

        console.log(`Starting download: ${videoUrl}`);
        console.log(`Saving to: ${outputFilePath}`);

        return new Promise((resolve, reject) => {
            const command = `yt-dlp -x --audio-format mp3 -o "${outputFilePath}" ${videoUrl}`;
            console.log(`Executing command: ${command}`);

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error downloading video:', error);
                    console.error('stderr:', stderr);
                    return reject(error);
                }

                console.log('Download complete:', stdout);
                resolve(outputFilePath);
            });
        });
    } catch (error) {
        console.error('Error fetching or downloading YouTube video:', error);
        return null;
    }
}

app.get('/currently-playing', async (req, res) => {
    const startTime = Date.now();
    await ensureAccessToken();

    try {
        const dataStartTime = Date.now();
        const data = await spotifyApi.getMyCurrentPlaybackState();
        const dataEndTime = Date.now();
        const dataFetchDuration = dataEndTime - dataStartTime;

        if (data.body && data.body.is_playing) {
            const songName = data.body.item.name;
            const artistName = data.body.item.artists.map(artist => artist.name).join(', ');
            const albumName = data.body.item.album.name;
            const songUrl = data.body.item.external_urls.spotify;
            const durationMs = data.body.item.duration_ms;
            const progressMs = data.body.progress_ms;
            const progressPercentage = Math.floor(progressMs / durationMs * 100);
            const image = data.body.item.album.images[0].url;
            const songId = data.body.item.id;

            const geniusStartTime = Date.now();
            const geniusResponse = [[], ''];
            const geniusEndTime = Date.now();
            const geniusFetchDuration = geniusEndTime - geniusStartTime;

            const lyricsArray = geniusResponse[0];
            const geniusUrl = geniusResponse[1];

            const SP = new Spotify(process.env.SP_DC);

            const lyricsStartTime = Date.now();
            let actualLyrics = await SP.getLyrics(songId);
            const lyricsEndTime = Date.now();
            const lyricsFetchDuration = lyricsEndTime - lyricsStartTime;

            if (!actualLyrics) actualLyrics = {
                syncType: "LINE_UNSYNCED",
                lyrics: {
                    lines: lyricsArray.map(line => ({
                        words: line,
                        syllables: [],
                        endTimeMs: "0",
                        startTimeMs: "0"
                    }))
                }
            };

            const endTime = Date.now();
            const totalDuration = endTime - startTime;

            res.json({
                song: songName,
                artist: artistName,
                album: albumName,
                song_image: image,

                delay: {
                    data: dataFetchDuration,
                    lyrics: lyricsFetchDuration,
                    external_lyrics: geniusFetchDuration,
                    total: totalDuration
                },

                playback: {
                    progress_ms: progressMs,
                    duration_ms: durationMs,
                    progress_percentage: progressPercentage
                },

                links: {
                    genius: geniusUrl,
                    spotify: songUrl
                },

                lyrics: actualLyrics.lyrics,
                timing: {
                    data_fetch_duration: dataFetchDuration,
                    genius_fetch_duration: geniusFetchDuration,
                    lyrics_fetch_duration: lyricsFetchDuration,
                    total_duration: totalDuration
                }
            });
        } else {
            res.json({ message: 'No song is currently playing' });
        }
    } catch (error) {
        console.log(error)
        res.status(500).send('error');
    }
});

app.get('/mazafakatospotik', (req, res) => {
    const scopes = ['user-read-playback-state', 'user-read-currently-playing'];
    res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];

        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);

        saveTokens(accessToken, refreshToken);

        res.redirect('/');
    } catch (error) {
        res.status(500).send(error);
    }
});

async function refreshAccessToken() {
    try {
        const data = await spotifyApi.refreshAccessToken();
        const newAccessToken = data.body['access_token'];

        console.log('The access token has been refreshed!');
        spotifyApi.setAccessToken(newAccessToken);

    } catch (error) {
        console.error('Could not refresh access token', error);
    }
}

setInterval(() => {
    refreshAccessToken();
}, 55 * 60 * 1000);

const tokens = loadTokens();
console.log(tokens)
if (tokens) {
    spotifyApi.setAccessToken(tokens.access_token);
    spotifyApi.setRefreshToken(tokens.refresh_token);
}

app.listen(3012, () => {
    console.log('Server running on http://localhost:3012');
});
