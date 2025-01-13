import { exec } from 'child_process';
import worker from 'worker_threads';
import fileType from 'file-type';
import puppeteer, { Browser } from 'puppeteer';
import { unlink } from 'fs/promises';
import { config } from 'dotenv';

// Configure us some environment variables
config();

let timeout: ReturnType<typeof setTimeout> = null;

function restartTimeout(browser: Browser | null) {
  if (timeout !== null) clearTimeout(timeout);
  timeout = setTimeout(() => {
    if (browser !== null) browser.close();
    worker.parentPort.postMessage(408);
    process.exit(1);
  }, 15e3);
}

// Test if file has a video stream or image stream
function hasVideoOrImageStream(file: string): Promise<boolean> {
  return new Promise((res) => {
    const a = exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 ${file}`,
    );
    let hasVideo = false;
    a.stdout.on('data', (data) => {
      if (data === 'video') hasVideo = true;
    });
    a.on('exit', () => {
      res(hasVideo);
    });
  });
}

// Test if file has an audio stream
function hasAudioStream(file: string): Promise<boolean> {
  return new Promise((res) => {
    const a = exec(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 ${file}`,
    );
    let hasAudio = false;
    a.stdout.on('data', (data) => {
      if (data === 'audio') hasAudio = true;
    });
    a.on('exit', () => {
      res(hasAudio);
    });
  });
}

// This is a worker thread, so we can't run it as the main thread
if (worker.isMainThread) throw new Error("can't be ran as main thread");
(async function () {
  try {
    let a = await fileType.fromFile(
      `${process.env.BASE_UPLOAD_PATH}${worker.workerData.file}`,
    );
    if (a === undefined && !worker.workerData.file.match(/\.html?$/)) {
      worker.parentPort.postMessage(415);
      process.exit(0);
    }
    if (worker.workerData.file.match(/\.html?$/)) {
      const browser = await puppeteer.launch(),
        page = await browser.newPage();
      page.setViewport({ width: 256, height: 256 });
      restartTimeout(browser);
      await page.goto(
        `file://${process.env.BASE_UPLOAD_PATH}${worker.workerData.file}`,
        {
          waitUntil: 'networkidle2',
        },
      );
      await page.screenshot({
        path: `${process.env.OUTPUT_PATH}${worker.workerData.file}.webp`,
      });
      restartTimeout(browser);
      exec(
        `chmod +r+w ${process.env.OUTPUT_PATH}${worker.workerData.file}.webp`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            worker.parentPort.postMessage(200);
            process.exit(0);
          }
        },
      );
    } else if (await hasVideoOrImageStream(worker.workerData.file)) {
      restartTimeout(null);
      exec(
        `ffmpeg -i ${process.env.BASE_UPLOAD_PATH}${worker.workerData.file} -vf 'scale=256:256:force_original_aspect_ratio=1,format=rgba,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=#00000000' -vframes 1 /tmp/cumulonimbus-preview-cache/${worker.workerData.file}.webp`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            worker.parentPort.postMessage(200);
            process.exit(0);
          }
        },
      );
    } else if (a.mime === 'application/pdf') {
      restartTimeout(null);
      exec(
        `pdftoppm -singlefile -png -x 0 -y 0 -W 256 -H 256 -scale-to 256 ${process.env.BASE_UPLOAD_PATH}${worker.workerData.file} /tmp/${worker.workerData.file}`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            restartTimeout(null);
            exec(
              `ffmpeg -i /tmp/${worker.workerData.file}.png -vf 'scale=256:256:force_original_aspect_ratio=1,format=rgba,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=#00000000' -vframes 1 ${process.env.OUTPUT_PATH}${worker.workerData.file}.webp`,
              async (error, stdout, stderr) => {
                if (error) {
                  worker.parentPort.postMessage(500);
                  console.error(error, stderr, stdout);
                  process.exit(0);
                } else {
                  await unlink(`/tmp/${worker.workerData.file}.png`);
                  worker.parentPort.postMessage(200);
                  process.exit(0);
                }
              },
            );
          }
        },
      );
    } else if (a.mime.startsWith('font')) {
      const browser = await puppeteer.launch(),
        page = await browser.newPage();
      page.setViewport({ width: 256, height: 256 });
      restartTimeout(browser);
      await page.goto(
        `file://${process.cwd()}/font-renderer.html?font=${
          worker.workerData.file
        }`,
        {
          waitUntil: 'load',
        },
      );
      restartTimeout(browser);
      await page.screenshot({
        path: `${process.env.OUTPUT_PATH}${worker.workerData.file}.webp`,
      });
      worker.parentPort.postMessage(200);
      process.exit(0);
    } else if (await hasAudioStream(worker.workerData.file)) {
      restartTimeout(null);
      exec(
        `ffmpeg -i ${process.env.BASE_UPLOAD_PATH}${worker.workerData.file} -filter_complex 'showwavespic=256x256' -frames:v 1 ${process.env.OUTPUT_PATH}${worker.workerData.file}.webp`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            worker.parentPort.postMessage(200);
            process.exit(0);
          }
        },
      );
    } else {
      worker.parentPort.postMessage(415);
      process.exit(0);
    }
  } catch (e) {
    worker.parentPort.postMessage(500);
    console.error(e);
    process.exit(0);
  }
})();
