#!/usr/bin/env python3
"""
릴스 영상 1개 → 프레임 추출 + 내레이션 받아쓰기
사용법: python3 reels_analyze.py <영상파일.mp4> [출력폴더]

- 프레임: 1초 간격으로 장면 캡처 (자막/장면 분석용) → 클로드가 이미지로 읽음
- 오디오: whisper로 내레이션 텍스트 받아쓰기 → 클로드가 텍스트로 읽음
"""
import sys, os, subprocess, json
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def duration(video):
    # ffmpeg로 길이 추출
    r = run([FFMPEG, "-i", video])
    for line in (r.stderr or "").splitlines():
        if "Duration" in line:
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return float(h) * 3600 + float(m) * 60 + float(s)
    return None

def extract_frames(video, outdir, fps=1):
    os.makedirs(outdir, exist_ok=True)
    # 1초당 1프레임, 가로 720으로 리사이즈
    run([FFMPEG, "-y", "-i", video, "-vf", f"fps={fps},scale=720:-1",
         os.path.join(outdir, "frame_%03d.png")])
    frames = sorted(f for f in os.listdir(outdir) if f.startswith("frame_"))
    return frames

def extract_audio(video, outdir):
    os.makedirs(outdir, exist_ok=True)
    wav = os.path.join(outdir, "audio.wav")
    run([FFMPEG, "-y", "-i", video, "-ar", "16000", "-ac", "1", wav])
    return wav if os.path.exists(wav) else None

def transcribe(wav):
    # mlx_whisper (애플 실리콘 빠름) 우선, 없으면 whisper
    try:
        import mlx_whisper
        r = mlx_whisper.transcribe(wav, path_or_hf_repo="mlx-community/whisper-large-v3-turbo")
        return r.get("text", "")
    except Exception:
        try:
            import whisper
            model = whisper.load_model("base")
            r = model.transcribe(wav, language="ko")
            return r.get("text", "")
        except Exception as e:
            return f"[받아쓰기 실패: {e}]"

def main():
    if len(sys.argv) < 2:
        print("사용법: python3 reels_analyze.py <영상.mp4> [출력폴더]")
        sys.exit(1)
    video = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "/tmp/reels_out"
    os.makedirs(outdir, exist_ok=True)

    dur = duration(video)
    print(f"[1/3] 영상 길이: {dur:.1f}초" if dur else "[1/3] 길이 불명")

    frames = extract_frames(video, os.path.join(outdir, "frames"))
    print(f"[2/3] 프레임 {len(frames)}장 추출 → {outdir}/frames/")

    wav = extract_audio(video, outdir)
    text = transcribe(wav) if wav else "[오디오 없음]"
    print(f"[3/3] 내레이션 받아쓰기 완료")

    result = {"video": video, "duration_sec": dur,
              "frames_dir": os.path.join(outdir, "frames"),
              "frame_count": len(frames), "transcript": text}
    with open(os.path.join(outdir, "result.json"), "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\n=== 내레이션 ===")
    print(text)
    print(f"\n=== 결과 저장: {outdir}/result.json ===")

if __name__ == "__main__":
    main()
