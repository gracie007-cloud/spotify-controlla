const { app, desktopCapturer, Tray, session, BrowserWindow, ipcMain } = require('electron')
const path = require('path');
const fs = require("fs");
const OpenAI = require("openai");
const axios = require("axios");

const http = require("http");
const url = require("url");


let headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
};

const playlistId = "6FGpNjX5Z9DqRpc5cyr9kL";

let tray = null
let mainWindow = null;

app.whenReady().then(() => {
    tray = new Tray('spotifyTemplate.png')

    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({"types": ["screen"]}).then((sources) => {
            callback({"audio": "loopback"});
        }).catch((error) => {
            console.log("I failed: "+ error);
        })
    }, {useSystemPicker: false})

    tray.on("click", function () {
        mainWindow = new BrowserWindow({
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true
            }
        });
        mainWindow.addListener("close", function (event) {
            event.preventDefault();
            mainWindow.hide();
        });

        console.log("I'm supposed to start listening to your microphone");
        
        mainWindow.loadFile("index.html");
    });
});


ipcMain.handle("callSpotify", (_event, buffer) => {
    let filePath = path.join(__dirname, 'spotify/audio.wav');
    fs.writeFileSync(filePath, Buffer.from(buffer));

    const openai = new OpenAI();

    openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "gpt-4o-transcribe",
        response_format: "text",
    }).then((response) => {
        addSongToPlaylist(response);
        mainWindow.close();
        
    }).catch((error) => {
        console.log(error)
    });
});

function getCredentials(key)
{
    let json = JSON.parse(fs.readFileSync("credentials.json"));
    
    return json[key];
}

function setCredentials(key, value)
{
    let json = JSON.parse(fs.readFileSync("credentials.json"));
    json[key] = value;
    console.log(json[key], key, "code_ver");
    fs.writeFileSync(path.join(__dirname, "credentials.json"), JSON.stringify(json));
}

function reconnectSpotify()
{
    const clientId = '1c7f4a482dde4f179d64db53fb5d59a8';

    let body = {
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: getCredentials("refresh_token")
    }

    const headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    };
    console.log("here");

    axios.post("https://accounts.spotify.com/api/token", body, {headers: headers}).then((response) => {
        setCredentials('access_token', response.data.access_token);
        setCredentials('refresh_token', response.data.refresh_token);
        setCredentials('expires_in', Date.now() + response.data.expires_in * 1000);
    }).catch((error) => {
        console.log(error);
    });
}

ipcMain.handle("getCredentials", (_event, key) => {
    return getCredentials(key);
});

ipcMain.handle("setCredentials", (_event, key, value) => {
    setCredentials(key, value);
});

ipcMain.handle("reconnectSpotify", (_event) => {
    reconnectSpotify();
});

async function addSongToPlaylist(songName) 
{
    let url = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks";

    let body = {
        uris: []
    };

    headers.Authorization = "Bearer "+ getCredentials('access_token');

    let songUri = await getSongUri(songName);

    if (! songUri) {
        return;
        
    }

    body.uris.push(songUri);

    axios.post(url, body, {headers: headers}).then((response) => {
        console.log(response.data);
    }).catch((error) => {
        console.log(error);
    })
}

async function getSongUri(songName)
{
    let url = "https://api.spotify.com/v1/search?q=" + songName + "&type=track"
    let songUri = null;
    headers.Authorization = "Bearer "+ getCredentials('access_token');

    try {
        let response = await axios.get(url, {headers: headers});
        songUri = response.data.tracks.items[0].uri;
    } catch (error) {
        console.log(error);
    }

    return songUri;
}

function startAuthServer() 
{
    const server = http.createServer((req, res) => {
    const query = url.parse(req.url, true).query;

    const clientId = '1c7f4a482dde4f179d64db53fb5d59a8';
   
    if (query.code) {
        console.log("Spotify auth code:", query.code);
        const codeVerifier = getCredentials('code_verifier');

        let body = {
            client_id: clientId,
            grant_type: "authorization_code",
            code: query.code,
            redirect_uri: "http://127.0.0.1:5173",
            code_verifier: codeVerifier
        }

        const headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        };

        axios.post("https://accounts.spotify.com/api/token", body, {headers: headers}).then((response) => {
            setCredentials('access_token', response.data.access_token);
            setCredentials('refresh_token', response.data.refresh_token);
            setCredentials('expires_in', Date.now() + response.data.expires_in * 1000);
            mainWindow.loadFile("index.html");
        }).catch((error) => {
            console.log(error);
        });
        
        server.close();
    }

  });

  server.listen(5173, () => {
    console.log("Listening for Spotify redirect...");
  });
}

startAuthServer();