# Now-Playing-Bot

This project is a Telegram bot built using the [Telegraf](https://telegraf.js.org/) framework that allows users to fetch and download Spotify tracks. The bot caches the downloaded tracks on the server and serves them via a simple HTTP server.

## Features

- Authorization command to control access to the bot.
- Inline queries to search and fetch Spotify tracks.
- Cached audio files served via HTTP.
- Modularized structure for maintainability and scalability.
- Uses environment variables for configuration.

## Requirements

- Node.js (v12.x or higher)
- npm (Node package manager)
- Python 3.x
- yt-dlp (for downloading media from YouTube and other sources)
- ffmpeg (for audio processing)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/henceketh/Now-Playing-Bot.git
cd Now-Playing-Bot
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Create a `.env` file in the root of the project:

```bash
BOT_TOKEN=your-telegram-bot-token
PORT=8888
USER_DB=users.json
CACHE_DIR=cache
AUDIO_BASE_URL=https://yourserver.com/audio
```

Replace `your-telegram-bot-token` with your actual Telegram bot token.

4. Install `yt-dlp` and `ffmpeg`:

For Linux users, it's recommended to use a virtual environment for Python packages.

### Linux (with virtual environment)

```bash
sudo apt-get install python3-venv ffmpeg
python3 -m venv env
source env/bin/activate
pip install yt-dlp
```

### Windows

1. Download and install [Python 3.x](https://www.python.org/downloads/)
2. Install `yt-dlp` and `ffmpeg`:

```bash
pip install yt-dlp
choco install ffmpeg
```

5. Start the bot:

```bash
node index.js
```

## Usage

- **Authorization**: Users can authorize themselves by sending the `/god` command to the bot.
- **Search Tracks**: Authorized users can search for tracks using inline queries in any chat.

## Environment Variables

The following environment variables should be configured in the `.env` file:

- `BOT_TOKEN`: Your Telegram bot token.
- `PORT`: The port number for the HTTP server.
- `USER_DB`: The path to the JSON file storing authorized users.
- `CACHE_DIR`: Directory where audio files will be cached.
- `AUDIO_BASE_URL`: Base URL to serve the cached audio files.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
