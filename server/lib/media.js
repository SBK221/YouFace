import { spawn } from 'node:child_process';

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

export async function probeVideo(config, filePath) {
  const { stdout } = await run(config.ffprobeBin, ['-v','error','-print_format','json','-show_format','-show_streams',filePath]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error('NO_VIDEO_STREAM');
  return {
    durationSeconds: Number(data.format?.duration || 0),
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    formatName: data.format?.format_name || '',
    videoCodec: video.codec_name || ''
  };
}

export async function transcodeVideo(config, input, output, thumbnail) {
  await run(config.ffmpegBin, [
    '-y','-i',input,
    '-vf','scale=-2:min(720\\,ih)',
    '-c:v','libx264','-preset','veryfast','-crf','23',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',
    output
  ]);
  await run(config.ffmpegBin, ['-y','-ss','1','-i',output,'-frames:v','1','-vf','scale=640:-2',thumbnail]);
}
