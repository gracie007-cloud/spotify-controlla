
var stopButton = document.getElementById("stop");

navigator.mediaDevices.getUserMedia({audio: true, video: false})
    .then(function (stream) {
        let chunks = [];
        let mediaRecorder = new MediaRecorder(stream, {"mimeType": "audio/mp4"});
        mediaRecorder.start();
        mediaRecorder.ondataavailable = function (ev) {
            chunks.push(ev.data);
        }

        stopButton.addEventListener("click", (ev) => mediaRecorder.stop());
        
        mediaRecorder.onstop = function (ev) {
            let blob = new Blob(chunks);

            blob.arrayBuffer().then((data) => {
                new AudioContext().decodeAudioData(data).then((audioBuffer) => {
                    let wavBuffer = audioBufferToWav(audioBuffer);
                    window.api.callSpotify(wavBuffer);
                }).catch ((error) => {
                    alert(error)
                })
            })
        }
    })
    .catch((error) => {
        alert("error: " + error)
    })

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const samples = buffer.length;
    const blockAlign = numChannels * bitDepth / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples * blockAlign;

    const bufferLength = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    let offset = 0;

    const writeString = (str) => {
        for (let i = 0; i < str.length; i++) {
            console.log([numChannels, sampleRate, format, bitDepth, samples, blockAlign, byteRate, dataSize])
            view.setUint8(offset++, str.charCodeAt(i));
        }
    };

    // WAV header
    writeString("RIFF");
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString("WAVE");
    writeString("fmt ");
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeString("data");
    view.setUint32(offset, dataSize, true); offset += 4;

    // Interleave channel data
    const channelData = [];

    for (let i = 0; i < numChannels; i++) {
        channelData.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < samples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = channelData[ch][i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }

    return arrayBuffer;
}


const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);

    return window.crypto.subtle.digest('SHA-256', data);
}

const generateRandomString = (length) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));

  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}


async function loginToSpotify()
{
    try {
        const clientId = '1c7f4a482dde4f179d64db53fb5d59a8';
        const redirectUri = 'http://127.0.0.1:5173';

        const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
        const authUrl = new URL("https://accounts.spotify.com/authorize")

        const codeVerifier = generateRandomString(64);
        const hashed = await sha256(codeVerifier)
        const codeChallenge = base64encode(hashed);

        window.api.addCredentials('code_verifier', codeVerifier);

        const params =  {
            response_type: 'code',
            client_id: clientId,
            scope,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: redirectUri,
        }

        authUrl.search = new URLSearchParams(params).toString();
        window.location.href = authUrl.toString();
    } catch (err) {
        alert(err);
    }
}
window.api.readCredentials("access_token").then((value) => {
    if(! value) {
        loginToSpotify()

        return;
    }

    window.api.readCredentials("expires_in").then((value) => {
        if(value && Date.now() > value) {
            window.api.reconnectSpotify();
        }
    });
});
