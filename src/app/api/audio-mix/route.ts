import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// POST — mix audio into video using FFmpeg
// Body: { videoUrl, audioUrl, videoVolume, audioVolume, audioStart, audioDuration, outputQuality }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      videoUrl,
      audioUrl,
      videoVolume = 1.0,
      audioVolume = 0.5,
      audioStart = 0,
      outputQuality = "1080p",
      fps = 30,
    } = body;

    if (!videoUrl || !audioUrl) {
      return NextResponse.json({ success: false, error: "videoUrl and audioUrl required" }, { status: 400 });
    }

    const workDir = join(tmpdir(), `mix-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    const videoPath = join(workDir, "input.mp4");
    const audioPath = join(workDir, "audio.mp3");
    const outputPath = join(workDir, "output.mp4");

    // Download source files
    const [videoRes, audioRes] = await Promise.all([
      fetch(videoUrl),
      fetch(audioUrl),
    ]);

    if (!videoRes.ok || !audioRes.ok) {
      return NextResponse.json({ success: false, error: "Failed to download source files" }, { status: 400 });
    }

    await Promise.all([
      writeFile(videoPath, Buffer.from(await videoRes.arrayBuffer())),
      writeFile(audioPath, Buffer.from(await audioRes.arrayBuffer())),
    ]);

    // Build FFmpeg command
    const qualityMap: Record<string, string[]> = {
      "720p": ["-vf", "scale=-2:720", "-b:v", "2500k"],
      "1080p": ["-vf", "scale=-2:1080", "-b:v", "5000k"],
      "1440p": ["-vf", "scale=-2:1440", "-b:v", "10000k"],
      "4k": ["-vf", "scale=-2:2160", "-b:v", "20000k"],
    };

    const quality = qualityMap[outputQuality] || qualityMap["1080p"];
    const fpsNum = Math.min(Math.max(Number(fps) || 30, 24), 90);

    const ffmpegArgs = [
      "-i", videoPath,
      "-i", audioPath,
      "-filter_complex",
      `[0:a]volume=${videoVolume}[va];[1:a]adelay=${audioStart * 1000}|${audioStart * 1000},volume=${audioVolume}[aa];[va][aa]amix=inputs=2:duration=first:dropout_transition=2[out]`,
      "-map", "0:v",
      "-map", "[out]",
      ...quality,
      "-r", String(fpsNum),
      "-c:v", "libx264",
      "-preset", "medium",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    // Run FFmpeg
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", ffmpegArgs, { stdio: "pipe" });
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      });
      proc.on("error", reject);
    });

    // Upload result to blob storage
    const { readFile } = await import("fs/promises");
    const outputBuffer = await readFile(outputPath);
    const blob = await put(`mixed-media/${randomUUID()}.mp4`, outputBuffer, { access: "public", allowOverwrite: true });

    // Cleanup temp files
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        url: blob.url,
        quality: outputQuality,
        fps: fpsNum,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio mixing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
