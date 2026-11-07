const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Ambil token dari config.js lo biar aman
const CONFIG = require('./config');
const GITHUB_TOKEN = CONFIG.GITHUB_TOKEN;
const GITHUB_OWNER = CONFIG.GITHUB_OWNER || "danz-art"; // Ganti pake username github lo
const GITHUB_REPO = CONFIG.GITHUB_REPO || "danzxbuilderz"; // Ganti pake nama repo lo

const githubAPI = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'NodeJS-Telegram-Bot'
    }
});

// Fungsi untuk upload ZIP ke GitHub Release (Legal pake API resmi)
async function uploadZipToRelease(zipPath, fileName, tag) {
    try {
        // 1. Bikin Release baru
        const releaseRes = await githubAPI.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
            tag_name: tag,
            name: `Build ${tag}`,
            body: `Project build untuk tag ${tag}`,
            draft: false,
            prerelease: false
        });

        const releaseId = releaseRes.data.id;
        const uploadUrl = releaseRes.data.upload_url.replace('{?name,label}', '');

        // 2. Upload file ZIP ke Release
        const form = new FormData();
        form.append('file', fs.createReadStream(zipPath), "project.zip");

        await axios.post(`${uploadUrl}?name=${fileName}`, form, {
            headers: {
                ...form.getHeaders(),
                Authorization: `token ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'NodeJS-Telegram-Bot'
            }
        });

        return {
            releaseId: releaseId,
            browserUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${tag}.zip`
        };
    } catch (error) {
        console.error("Gagal upload ke GitHub:", error.response ? error.response.data : error.message);
        throw new Error("Gagal upload ZIP ke GitHub Release");
    }
}

// Fungsi untuk hapus Release (biar repo bersih)
async function deleteRelease(releaseId) {
    try {
        if (!releaseId) return;
        await githubAPI.delete(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${releaseId}`);
    } catch (error) {
        console.error("Gagal hapus release:", error.message);
    }
}

// Trigger GitHub Actions buat build
async function triggerWorkflow(browserUrl, tag, mode) {
    try {
        // Asumsi lo punya file .github/workflows/build.yml di repo lo
        const res = await githubAPI.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/build.yml/dispatches`, {
            ref: 'main',
            inputs: {
                tag: tag,
                mode: mode
            }
        });
        // GitHub Actions nggak ngasih balik Run ID langsung, jadi kita harus cari manual
        // (Ini versi sederhana, kita tunggu 3 detik terus ambil run terakhir)
        await new Promise(r => setTimeout(r, 3000));
        
        const runsRes = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?event=workflow_dispatch&per_page=1`);
        if (runsRes.data.workflow_runs.length > 0) {
            return runsRes.data.workflow_runs[0].id;
        }
        throw new Error("Run ID tidak ditemukan");
    } catch (error) {
        console.error("Gagal trigger workflow:", error.response ? error.response.data : error.message);
        throw new Error("Gagal memulai build di GitHub Actions");
    }
}

// Cek status build
async function getRunStatus(runId) {
    try {
        const res = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`);
        const run = res.data;
        
        let status = run.status; // queued, in_progress, completed
        let conclusion = run.conclusion; // success, failure
        
        // Hitung durasi
        const start = new Date(run.run_started_at || run.created_at).getTime();
        const end = run.updated_at ? new Date(run.updated_at).getTime() : Date.now();
        const durationSec = Math.floor((end - start) / 1000);

        return { status, conclusion, durationSec };
    } catch (error) {
        console.error("Gagal cek status:", error.message);
        throw new Error("Gagal cek status build");
    }
}

// Ambil daftar artifact (APK)
async function getArtifacts(runId) {
    try {
        const res = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`);
        return res.data.artifacts.map(art => ({
            id: art.id,
            name: art.name,
            size: art.size_in_bytes
        }));
    } catch (error) {
        throw new Error("Gagal mengambil artifact");
    }
}

// Download artifact ZIP
async function downloadArtifactZip(artifactId, destPath) {
    try {
        const res = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifactId}/zip`, {
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(destPath);
        res.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error("Gagal download artifact");
    }
}

// Ambil log error dari GitHub Actions (kalo build gagal)
async function getFailedStepLog(runId) {
    try {
        const jobsRes = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/jobs`);
        const failedJob = jobsRes.data.jobs.find(j => j.conclusion === 'failure');
        
        if (!failedJob) return null;

        const failedStep = failedJob.steps.find(s => s.conclusion === 'failure');
        
        // GitHub nggak ngasih log langsung lewat API v3 (harus download zip log)
        // Jadi kita cuma kasih tau nama step yang gagal
        return {
            stepName: failedStep ? failedStep.name : "Unknown Step",
            errorLines: [`Build gagal di step: ${failedStep ? failedStep.name : "Unknown"}`]
        };
    } catch (error) {
        return null;
    }
}

// Fungsi tidur (delay)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi tambahan buat Web2APK (Kalo butuh)
async function createReleaseOnly(tag) {
    const res = await githubAPI.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
        tag_name: tag,
        name: `Icon ${tag}`,
        draft: true
    });
    return { releaseId: res.data.id, uploadUrl: res.data.upload_url.replace('{?name,label}', '') };
}

async function uploadAssetFile(uploadUrl, filePath, fileName, mimeType) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename: fileName, contentType: mimeType });
    await axios.post(`${uploadUrl}?name=${fileName}`, form, {
        headers: { ...form.getHeaders(), Authorization: `token ${GITHUB_TOKEN}` }
    });
}

async function publishRelease(releaseId) {
    const res = await githubAPI.patch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${releaseId}`, {
        draft: false
    });
    // Ambil URL icon dari assets
    return res.data.assets.length > 0 ? res.data.assets[0].browser_download_url : null;
}

async function triggerWeb2ApkWorkflow(url, appName, iconUrl) {
    // Sama kayak triggerWorkflow, cuma beda input
    const res = await githubAPI.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/web2apk.yml/dispatches`, {
        ref: 'main',
        inputs: { url, app_name: appName, icon_url: iconUrl }
    });
    await sleep(3000);
    const runsRes = await githubAPI.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?event=workflow_dispatch&per_page=1`);
    return runsRes.data.workflow_runs[0].id;
}

// Export semua fungsi yang dibutuhin index.js
module.exports = {
    uploadZipToRelease,
    deleteRelease,
    triggerWorkflow,
    getRunStatus,
    getArtifacts,
    downloadArtifactZip,
    getFailedStepLog,
    sleep,
    createReleaseOnly,
    uploadAssetFile,
    triggerWeb2ApkWorkflow,
    publishRelease
};